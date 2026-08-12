// plugins/bagCloseWorker.js
//
// BullMQ worker that processes "bagClose" jobs from bagCloseQueue.
//
// Job data: { chute_ids, request_payload }
//
// Flow per chute_id:
//  0. Resolve chute_code from chute_mappings (e.g. CH056 → D056)
//  1. Fetch current wbns from bags_wbn using chute_code
//  2. Insert into bag_closing table (snapshot + payload + response)
//  3. Reset bags_wbn (wbns = [], first_drop_at = null)

const { Worker } = require("bullmq");
const fp         = require("fastify-plugin");
const connection = require("../config/redisConnection");
const logRecorder = require("../utils/logger");

// machine_id comes from the settings table (validated upstream in the route
// via facilityId/installationId lookup), but we still guard the dynamic
// table name against anything unexpected before it ever reaches SQL.
const MACHINE_ID_PATTERN = /^[A-Za-z0-9_]+$/;

function assertValidMachineId(machine_id) {
  if (!machine_id || !MACHINE_ID_PATTERN.test(machine_id)) {
    throw new Error(`chuteMappingWorker: invalid machine_id "${machine_id}"`);
  }
}

module.exports = fp(async function bagCloseWorker(fastify) {

  new Worker(
    "bagCloseQueue",
    async (job) => {
      const { chute_ids, request_payload,machine_id } = job.data;
      assertValidMachineId(machine_id);

      // console.log(`bagCloseWorker: closing ${chute_ids.length} chute(s): [${chute_ids.join(", ")}]`);
      logRecorder.bagLogger.info({ message: "Bag close job received", event: "bag-close-worker(job-received)", data: { jobId: job.id, chute_ids, totalChutes: chute_ids.length } });
      const tableName = `chute_mappings_${machine_id}`;
      const client = await fastify.pg.connect();
      try {
        await client.query("BEGIN");

        for (const chute_id of chute_ids) {

          // ── 0. Resolve chute_code from chute_mappings ────────────────
          // Queue receives chute_id (e.g. CH056), operations use chute_code (e.g. D056)
          const codeRes = await client.query(
            `SELECT chute_code FROM ${tableName} WHERE chute_id = $1 LIMIT 1`,
            [chute_id]
          );

          if (!codeRes.rows.length) {
            // console.warn(`⚠️  bagCloseWorker: no chute_mappings row for chute_id=${chute_id} — skipping`);
            logRecorder.bagLogger.info({ message: "Chute mapping not found", event: "bag-close-worker(mapping-not-found)", data: { jobId: job.id, chute_id } });
            continue;
          }

          const chute_code = codeRes.rows[0].chute_code;
          // console.log(`✅ bagCloseWorker: chute_id=${chute_id} → chute_code=${chute_code}`);
          logRecorder.bagLogger.info({ message: "Chute mapping resolved", event: "bag-close-worker(mapping-resolved)", data: { jobId: job.id, chute_id, chute_code } });

          // ── 1. Fetch current wbns from bags_wbn ─────────────────────
          const bagRes = await client.query(
            `SELECT wbns, item_ids FROM bags_wbn WHERE bag_code = $1 AND machine_id = $2`,
            [chute_code,machine_id]
          );

          const currentWbns    = bagRes.rows[0]?.wbns     ?? [];
          const currentItemIds = bagRes.rows[0]?.item_ids ?? [];

          // ── 2. Insert into bag_closing (snapshot) ───────────────────
          const response_payload = { success: true };

          await client.query(
            `INSERT INTO bag_closing
               (chute_id, wbns, item_ids, bag_close_payload, bag_close_response, bag_closed_at,machine_id)
             VALUES ($1, $2::text[], $3::text[], $4::jsonb, $5::jsonb, NOW(),$6)`,
            [
              chute_code,
              currentWbns,
              currentItemIds,
              JSON.stringify(request_payload),
              JSON.stringify(response_payload),
              machine_id
            ]
          );

          // ── 3. Reset bags_wbn ────────────────────────────────────────
          // wbns → empty array
          // first_drop_at → null (reset for next bag cycle)
          await client.query(
            `UPDATE bags_wbn
             SET wbns          = ARRAY[]::TEXT[],
                 item_ids      = ARRAY[]::TEXT[],
                 first_drop_at = NULL,
                 updated_at    = NOW()
             WHERE bag_code = $1 AND machine_id = $2`,
            [chute_code,machine_id]
          );

          // console.log(`✅ bagCloseWorker: chute_id=${chute_id} chute_code=${chute_code} closed — ${currentWbns.length} wbn(s) archived`);
          logRecorder.bagLogger.info({ message: "Bag archived successfully", event: "bag-close-worker(bag-archived)", data: { jobId: job.id, chute_id, chute_code, archivedWbns: currentWbns.length, archivedItemIds: currentItemIds.length } });

                    // ── 4. Delete parcels rows for this chute_id ─────────────────
          // Clears all parcels assigned to this chute so next bag cycle starts fresh
          const delRes = await client.query(
            `DELETE FROM parcels WHERE chute_id = $1 AND machine_id = $2`,
            [chute_code,machine_id]
          );

          // console.log(`✅ bagCloseWorker: chute_id=${chute_id} chute_code=${chute_code} closed — ${currentWbns.length} wbn(s) archived`);
          logRecorder.bagLogger.info({ message: "Parcels cleared after bag close", event: "bag-close-worker(parcels-cleared)", data: { jobId: job.id, chute_id, chute_code, deletedRows: delRes.rowCount } });
        }

        await client.query("COMMIT");
        // console.log(`bagCloseWorker: job ${job.id} committed — ${chute_ids.length} chute(s) closed`);
        logRecorder.bagLogger.info({ message: "Bag close job committed", event: "bag-close-worker(job-committed)", data: { jobId: job.id, totalChutes: chute_ids.length } });

      } catch (err) {
        await client.query("ROLLBACK");
        // console.error(`❌ bagCloseWorker error: ${err.message}`);
        logRecorder.bagLogger.info({ message: "Bag close job failed", event: "bag-close-worker(job-failed)", data: { jobId: job.id, chute_ids, error: err.message } });
        throw err; // BullMQ retries
      } finally {
        client.release();
      }
    },
    {
      connection,
      concurrency: Number(process.env.BAG_CLOSE_WORKER_CONC || 2),
    }
  );

logRecorder.bagLogger.info({ message: "Bag close worker started", event: "bag-close-worker(start)" });
});