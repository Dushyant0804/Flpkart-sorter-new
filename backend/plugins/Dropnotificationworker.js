// plugins/dropNotificationWorker.js
//
// BullMQ worker that processes jobs from dropNotificationQueue.
//
// Job data: { wbn, item_id, chute_id (chute_code e.g. D051), status, reason, source }
//
// Flow:
//  1. Update parcels + sorter_audit_log with status, reason, final_chute_id
//  2. If status = REJECTED → set all drop fields to null, skip API, done
//  3. If status = SORTED   → resolve chute_id from chute_mappings
//  4. Fetch induct_time from parcels
//  5. Build payload + call FK notifyDropItem API (PUT)
//  6. Update parcels + sorter_audit_log with drop fields

const { Worker } = require("bullmq");
const fp         = require("fastify-plugin");
const axios      = require("axios");
const connection = require("../config/redisConnection");
const tokenManager = require("../config/tokenManager");
const logRecorder = require("../utils/logger")

module.exports = fp(async function dropNotificationWorker(fastify) {

  new Worker(
    "dropNotificationQueue",
    async (job) => {
      const { wbn, item_id, chute_id: chute_code, status, reason,machine_id } = job.data;
      // chute_id in queue is chute_code e.g. D051 (exception) or D056 (sorted)

      // console.log(`📥 dropNotificationWorker: item_id=${item_id} wbn=${wbn} chute_code=${chute_code} status=${status} reason=${reason}`);
      logRecorder.info({ message: "Drop notification job received", event: "drop-notification-worker(job-received)", data: { item_id, wbn, chute_code, status, reason } });
      // ── STEP 1: Update parcels + audit_log with status, reason, final_chute_id ──
      // For REJECTED: final_chute_id = chute_code as-is (e.g. D051 — exception chute, not in mappings)
      // For SORTED:   final_chute_id will be updated again after drop API with resolved chute_id
      try {
        await fastify.pg.query(
          `UPDATE parcels
           SET status    = $1,
               reason    = $2,
               final_chute_id = $3
           WHERE item_id = $4 AND machine_id = $5`,
          [status, reason ?? null, chute_code, item_id,machine_id]
        );
        await fastify.pg.query(
          `UPDATE sorter_audit_log
           SET status    = $1,
               reason    = $2,
               final_chute_id = $3
           WHERE item_id = $4 AND machine_id = $5`,
          [status, reason ?? null, chute_code, item_id,machine_id]
        );
        // console.log(`✅ dropNotificationWorker: status/reason/final_chute_id updated for item_id=${item_id}`);
        logRecorder.info({ message: "Parcel status updated successfully", event: "drop-notification-worker(status-updated)", data: { item_id, status, reason, final_chute_id: chute_code } });

      } catch (err) {
        // console.error(`❌ dropNotificationWorker: status update failed for item_id=${item_id}: ${err.message}`);
        logRecorder.info({ message: "Failed to update parcel status", event: "drop-notification-worker(status-update-failed)", data: { item_id, error: err.message } });
      }

      // ── STEP 2: REJECTED → null drop fields, skip API ────────────────
      if (status !== "SORTED") {
        // console.log(`⏭️  dropNotificationWorker: status=${status} → nulling drop fields, skipping drop API`);
        logRecorder.info({ message: "Rejected shipment, skipping drop notification", event: "drop-notification-worker(rejected)", data: { item_id, status, reason } });
        try {
          await fastify.pg.query(
            `UPDATE parcels
             SET drop_time                  = NULL,
                 drop_notification_sent     = false,
                 drop_notification_payload  = NULL,
                 drop_notification_response = NULL
             WHERE item_id = $1 AND machine_id = $2`,
            [item_id,machine_id]
          );
          await fastify.pg.query(
            `UPDATE sorter_audit_log
             SET drop_time                  = NULL,
                 drop_notification_sent     = false,
                 drop_notification_payload  = NULL,
                 drop_notification_response = NULL
             WHERE item_id = $1 AND machine_id = $2`,
            [item_id,machine_id]
          );
        } catch (err) {
          // console.error(`❌ dropNotificationWorker: null drop fields update failed: ${err.message}`);
          logRecorder.info({ message: "Failed to clear drop fields", event: "drop-notification-worker(clear-drop-fields-failed)", data: { item_id, error: err.message } });
        }
        return;
      }

      // ── STEP 3: Resolve chute_id from chute_mappings ─────────────────
      // SORTED only — chute_code (e.g. D056) → real chute_id (e.g. CH056)
      let chute_id = chute_code; // fallback if lookup fails
      try {
        const chuteRes = await fastify.pg.query(
          `SELECT chute_id FROM chute_mappings_${machine_id} WHERE chute_code = $1 LIMIT 1`,
          [chute_code]
        );
        if (chuteRes.rows.length > 0) {
          chute_id = chuteRes.rows[0].chute_id;
          // console.log(`✅ dropNotificationWorker: chute_code=${chute_code} → chute_id=${chute_id}`);
          logRecorder.info({ message: "Chute mapping resolved", event: "drop-notification-worker(chute-mapping-resolved)", data: { chute_code, chute_id } });
        } else {
          // console.warn(`⚠️  dropNotificationWorker: no chute_mappings row for chute_code=${chute_code}, using as-is`);
          logRecorder.info({ message: "Chute mapping not found, using fallback", event: "drop-notification-worker(chute-mapping-missing)", data: { chute_code } });
        }
      } catch (err) {
        // console.error(`❌ dropNotificationWorker: chute_mappings lookup failed: ${err.message}, using chute_code as fallback`);
        logRecorder.info({ message: "Chute mapping lookup failed", event: "drop-notification-worker(chute-mapping-failed)", data: { chute_code, error: err.message } });
      }

      // ── STEP 4: Fetch induct_time from parcels ───────────────────────
      let induct_time_ms = null;
      try {
        const parcelRes = await fastify.pg.query(
          `SELECT induct_time FROM parcels WHERE item_id = $1 AND machine_id = $2 LIMIT 1`,
          [item_id,machine_id]
        );
        if (parcelRes.rows.length > 0 && parcelRes.rows[0].induct_time) {
          induct_time_ms = new Date(parcelRes.rows[0].induct_time).getTime();
        }
      } catch (err) {
        // console.warn(`⚠️  dropNotificationWorker: could not fetch induct_time for item_id=${item_id}: ${err.message}`);
        logRecorder.info({ message: "Failed to fetch induct time", event: "drop-notification-worker(induct-time-fetch-failed)", data: { item_id, error: err.message } });
      }

      const drop_time_ms = Date.now();

      // ── STEP 5: Build payload + call FK notifyDropItem API ───────────
      const payload = {
        chute_id,
        item: {
          item_id,
          type:      "SHIPMENT",
          image_url: "",
        },
        additional_data: [],
        physical_attributes: {
          length:  { value: 0, unit: "MILLIMETRE" },
          breadth: { value: 0, unit: "MILLIMETRE" },
          height:  { value: 0, unit: "MILLIMETRE" },
          volume:  { value: 0, unit: "CUBIC_MILLIMETRE" },
          weight:  { value: 0, unit: "GRAMS" },
        },
        induct_time: induct_time_ms ?? drop_time_ms,
        drop_time:   drop_time_ms,
      };

      const settings = tokenManager.getSettings(machine_id);
      if (!settings) {
        logRecorder.info({ message: "⚠️ no settings found — skipping drop notification", event: "drop-notification-worker(missing-settings)", data: { item_id, machine_id } });
        return;
      }
      const { facilityId, installationId } = settings;
      const url   = `http://localhost:4000/api/v2/sort/notifyDropItem`;
      const token = await tokenManager.getValidToken();

      const headers = {
        "x-requested-by": "mechintsorter",
        "Authorization":  `Bearer ${token}`,
        "Content-Type":   "application/json",
      };

      let notificationSent = false;
      let apiResponse      = null;

      try {
        const response   = await axios.put(url, payload, { headers, timeout: 8_000 });
        notificationSent = true;
        apiResponse      = response.data;
        // console.log(`✅ dropNotificationWorker: ${item_id} chute_id=${chute_id} → ${response.status}`);
        logRecorder.info({ message: "Drop notification sent successfully", event: "drop-notification-worker(api-success)", data: { item_id, chute_id, statusCode: response.status } });
      } catch (err) {
        apiResponse = err.response?.data ?? { error: err.message };
        // console.error(`❌ dropNotificationWorker: ${item_id} → ${err.response?.status ?? "network"} ${err.message}`);
        logRecorder.info({ message: "Drop notification API failed", event: "drop-notification-worker(api-failed)", data: { item_id, chute_id, statusCode: err.response?.status ?? "NETWORK_ERROR", error: err.message } });
        throw err;   // <-- BullMQ will retry
      }

      // ── STEP 6: Update parcels + audit_log with drop fields ──────────
      try {
        await fastify.pg.query(
          `UPDATE parcels
           SET drop_time                  = $1,
               drop_notification_sent     = $2,
               drop_notification_payload  = $3::jsonb,
               drop_notification_response = $4::jsonb,
               final_chute_id                  = $5
           WHERE item_id = $6 AND machine_id = $7`,
          [
            new Date(drop_time_ms),
            notificationSent,
            JSON.stringify(payload),
            JSON.stringify(apiResponse),
            chute_id,   // resolved CH056 for SORTED
            item_id,
            machine_id,
          ]
        );
        await fastify.pg.query(
          `UPDATE sorter_audit_log
           SET drop_time                  = $1,
               drop_notification_sent     = $2,
               drop_notification_payload  = $3::jsonb,
               drop_notification_response = $4::jsonb,
               final_chute_id                  = $5
           WHERE item_id = $6 AND machine_id = $7`,
          [
            new Date(drop_time_ms),
            notificationSent,
            JSON.stringify(payload),
            JSON.stringify(apiResponse),
            chute_id,
            item_id,
            machine_id,
          ]
        );
        // console.log(`✅ dropNotificationWorker: drop fields updated for item_id=${item_id}`);
        logRecorder.info({ message: "Drop details updated successfully", event: "drop-notification-worker(drop-fields-updated)", data: { item_id, notificationSent, chute_id } });
      } catch (err) {
        // console.error(`❌ dropNotificationWorker: drop fields update failed: ${err.message}`);
        logRecorder.info({ message: "Failed to update drop details", event: "drop-notification-worker(drop-fields-update-failed)", data: { item_id, error: err.message } });
      }
    },
    {
      connection,
      concurrency: Number(process.env.DROP_WORKER_CONC || 4),
    }
  );

logRecorder.info({ message: "Drop Notification Worker started", event: "drop-notification-worker(start)" });
});