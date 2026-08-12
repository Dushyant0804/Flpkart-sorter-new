// plugins/confirmSortWorker.js
//
// BullMQ worker that processes "confirm" jobs from confirmSortQueue.
//
// Job data: { id, wbn, item_id, chute_id, status, reason, sort }
//
// Flow:
//  1. Find record in bulk_data by item_id (direct PK match only)
//  2. Move it to sorted_bulk_data (preserving all original timestamps)
//  3. Delete from bulk_data
//  4. Add wbn + item_id to bags_wbn table for the chute's bag_code (chute_id)
//     - wbn inserted as-is (no splitting)
//     - item_id appended to item_ids TEXT[] column
//     - first_drop_at set only if bag has no wbns yet
//     - subsequent drops only update wbns + item_ids arrays + updated_at
//  5. Update primary_bin_data with final_bag, sort, reason

const { Worker } = require("bullmq");
const fp         = require("fastify-plugin");
const connection = require("../config/redisConnection");
const logRecorder = require("../utils/logger")

module.exports = fp(async function confirmSortWorker(fastify) {

  new Worker(
    "confirmSortQueue",
    async (job) => {
      const { wbn, item_id, chute_id, status, reason, sort, machine_id } = job.data;

      // fastify.log.info(`📥 confirmSortWorker: item_id=${item_id} wbn=${wbn} chute=${chute_id}`);
      logRecorder.info({ message: "Confirm sort job received", event: "confirm-sort-worker(job-received)", data: { item_id, wbn, chute_id, status, reason, sort } });

      const client = await fastify.pg.connect();
      try {
        await client.query("BEGIN");

        // ── STEP 1: Find record in bulk_data by item_id (PK match only) ─
        const bulkRes = await client.query(
          `SELECT item_id, labels, type, sort_code, timestamp, received_at
           FROM bulk_data
           WHERE item_id = $1
           LIMIT 1`,
          [item_id]
        );

        if (!bulkRes.rows.length) {
          // fastify.log.warn(`⚠️  confirmSortWorker: item_id=${item_id} not found in bulk_data — skipping move`);
          logRecorder.info({ message: "Item not found in bulk_data", event: "confirm-sort-worker(bulk-data-not-found)", data: { item_id } });
        } else {
          const row = bulkRes.rows[0];

          // ── STEP 2: Move to sorted_bulk_data ──────────────────────────
          // Preserve original timestamps exactly — only moved_at is new
          await client.query(
            `INSERT INTO sorted_bulk_data
               (item_id, labels, type, sort_code, timestamp, received_at, moved_at)
             VALUES ($1, $2::jsonb, $3, $4::jsonb, $5, $6, NOW())
             ON CONFLICT (item_id) DO UPDATE SET
               labels      = EXCLUDED.labels,
               type        = EXCLUDED.type,
               sort_code   = EXCLUDED.sort_code,
               timestamp   = EXCLUDED.timestamp,
               received_at = EXCLUDED.received_at,
               moved_at    = NOW()`,
            [
              row.item_id,
              JSON.stringify(row.labels),
              row.type,
              JSON.stringify(row.sort_code),
              row.timestamp,
              row.received_at,
            ]
          );

          // ── STEP 3: Delete from bulk_data ─────────────────────────────
          await client.query(
            `DELETE FROM bulk_data WHERE item_id = $1`,
            [row.item_id]
          );

          // fastify.log.info(`✅ confirmSortWorker: moved ${item_id} → sorted_bulk_data`);
          logRecorder.info({ message: "Record moved to sorted_bulk_data", event: "confirm-sort-worker(record-moved)", data: { item_id } });
        }

        // ── STEP 4: Add wbn + item_id to bags_wbn table ─────────────────
        // bag_code = chute_id (e.g. "D056")
        // wbn inserted as-is — no splitting
        // item_id appended to item_ids TEXT[] column
        // first_drop_at: set only when bag is first filled (wbns was empty)
        // updated_at: always updated

        const bagRes = await client.query(
          `SELECT id, wbns FROM bags_wbn WHERE bag_code = $1 AND machine_id = $2`,
          [chute_id,machine_id]
        );

        if (bagRes.rows.length === 0) {
          // Bag doesn't exist yet — create with first_drop_at set
          await client.query(
            `INSERT INTO bags_wbn (bag_code, wbns, item_ids, first_drop_at, updated_at,machine_id)
             VALUES ($1, ARRAY[$2]::text[], ARRAY[$3]::text[], NOW(), NOW(),$4)`,
            [chute_id, wbn, item_id,machine_id]
          );
          // fastify.log.info(`🆕 bags_wbn: created bag ${chute_id} with wbn=${wbn} item_id=${item_id}`);
          logRecorder.info({ message: "New bag created", event: "confirm-sort-worker(bag-created)", data: { bag_code: chute_id, wbn, item_id } });
        } else {
          const existingWbns = bagRes.rows[0].wbns || [];
          const isFirstDrop  = existingWbns.length === 0;

          if (isFirstDrop) {
            // Bag exists but was cleared (empty wbns) — set first_drop_at again
            await client.query(
              `UPDATE bags_wbn
               SET wbns          = array_append(wbns, $1::text),
                   item_ids      = array_append(item_ids, $2::text),
                   first_drop_at = NOW(),
                   updated_at    = NOW()
               WHERE bag_code = $3 AND machine_id = $4`,
              [wbn, item_id, chute_id,machine_id]
            );
            // fastify.log.info(`🔄 bags_wbn: bag ${chute_id} refilled — first_drop_at reset, wbn=${wbn}`);
            logRecorder.info({ message: "Bag refilled and first_drop_at reset", event: "confirm-sort-worker(bag-refilled)", data: { bag_code: chute_id, wbn, item_id } });
          } else {
            // Bag already has wbns — just append, don't touch first_drop_at
            await client.query(
              `UPDATE bags_wbn
               SET wbns       = array_append(wbns, $1::text),
                   item_ids   = array_append(item_ids, $2::text),
                   updated_at = NOW()
               WHERE bag_code = $3 AND machine_id = $4`,
              [wbn, item_id, chute_id,machine_id]
            );
            // fastify.log.info(`➕ bags_wbn: appended wbn=${wbn} item_id=${item_id} to bag ${chute_id}`);
            logRecorder.info({ message: "WBN appended to existing bag", event: "confirm-sort-worker(bag-updated)", data: { bag_code: chute_id, wbn, item_id } });
          }
        }

        await client.query("COMMIT");
        // fastify.log.info(`✅ confirmSortWorker: job done for ${item_id}`);
        logRecorder.info({ message: "Confirm sort transaction committed", event: "confirm-sort-worker(transaction-committed)", data: { item_id } });
        // ── STEP 5: Update primary_bin_data ─────────────────────────────
        // Done AFTER commit so sort result is always persisted regardless of this update
        try {
          const updateRes = await fastify.pg.query(
            `UPDATE primary_bin_data
             SET final_bag = $1,
                 sort      = $2,
                 reason    = $3,
                 sorttime  = NOW()
             WHERE id = (
               SELECT id FROM primary_bin_data
               WHERE wbn = $4 AND machine_id = $5
               ORDER BY id DESC
               LIMIT 1
             )`,
            [chute_id, chute_id === "D043" ? "RECIRCULATE" : status, reason ?? null, wbn,machine_id]
          );
          if (updateRes.rowCount > 0) {
            // fastify.log.info(`✅ primaryBinData updated: wbn=${wbn} final_bag=${chute_id} sort=${status}`);
            logRecorder.info({ message: "primary_bin_data updated", event: "confirm-sort-worker(primary-bin-updated)", data: { wbn, final_bag: chute_id, sort: chute_id === "D043" ? "RECIRCULATE" : status } });
          } else {
            // fastify.log.warn(`⚠️  primaryBinData: no row found for wbn=${wbn}`);
            logRecorder.info({ message: "No primary_bin_data record found", event: "confirm-sort-worker(primary-bin-not-found)", data: { wbn } });
          }
        } catch (err) {
          // fastify.log.error(`❌ primaryBinData update failed for wbn=${wbn}: ${err.message}`);
          logRecorder.info({ message: "Failed to update primary_bin_data", event: "confirm-sort-worker(primary-bin-update-failed)", data: { wbn, error: err.message } });
          // non-fatal — confirmation data already committed above
        }

      } catch (err) {
        await client.query("ROLLBACK");
        // fastify.log.error(`❌ confirmSortWorker error: ${err.message}`);
        logRecorder.info({ message: "Confirm sort worker transaction failed", event: "confirm-sort-worker(transaction-failed)", data: { item_id, wbn, chute_id, error: err.message } });
        throw err; // BullMQ retries
      } finally {
        client.release();
      }
    },
    {
      connection,
      concurrency: Number(process.env.CONFIRM_WORKER_CONC || 4),
    }
  );

  logRecorder.info({ message: "Confirm Sort Worker started", event: "confirm-sort-worker(start)" });
});