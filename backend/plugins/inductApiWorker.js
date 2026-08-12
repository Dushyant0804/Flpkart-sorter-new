// plugins/inductApiWorker.js
//
// BullMQ worker — DB persistence only.
// Induct API is now called synchronously in sortEngineWorker before broadcast.
// This worker just upserts the result into parcels + sorter_audit_log.
//
// Job data:
//   { item_id, wbn, chute_id, status, reason, source,
//     induct_payload, induct_response, inductapi_sent }

const fp         = require("fastify-plugin");
const { Worker } = require("bullmq");
const connection = require("../config/redisConnection");
const logRecorder = require("../utils/logger")

async function upsertParcelInduct(fastify, { wbn, item_id, chute_id, status, reason, source,machine_id, inductapi_sent, induct_payload, induct_response }) {
  try {
    await fastify.pg.query(
      `INSERT INTO parcels
         (wbn, item_id, chute_id, expected_chute_id, status, reason, source,machine_id,
          induct_time, inductapi_sent, induct_payload, induct_response, created_at)
       VALUES ($1, $2, $3, $3, $4, $5, $6, $7, NOW(), $8, $9::jsonb, $10::jsonb, NOW())
       ON CONFLICT (item_id, machine_id) DO UPDATE SET
         wbn               = EXCLUDED.wbn,
         chute_id          = EXCLUDED.chute_id,
         expected_chute_id = EXCLUDED.expected_chute_id,
         status            = EXCLUDED.status,
         reason            = EXCLUDED.reason,
         source            = EXCLUDED.source,
         machine_id        = EXCLUDED.machine_id,
         induct_time       = NOW(),
         inductapi_sent    = EXCLUDED.inductapi_sent,
         induct_payload    = EXCLUDED.induct_payload,
         induct_response   = EXCLUDED.induct_response`,
      [
        wbn,
        item_id         ?? null,
        chute_id        ?? null,
        status          ?? null,
        reason          ?? null,
        source          ?? null,
        machine_id      ?? null,
        inductapi_sent  ?? false,
        JSON.stringify(induct_payload  ?? null),
        JSON.stringify(induct_response ?? null),
      ]
    );
    // console.log(`✅ parcels upserted: wbn=${wbn} item_id=${item_id} inductapi_sent=${inductapi_sent}`);
    logRecorder.info({ message: "Parcels upsert completed", event: "induct-api-worker(parcels-upserted)", data: { wbn, item_id, inductapi_sent } });
  } catch (err) {
    // console.error(`❌ parcels upsert failed for wbn=${wbn}:`, err.message);
    logRecorder.info({ message: "Parcels upsert failed", event: "induct-api-worker(parcels-upsert-failed)", data: { wbn, item_id, error: err.message } });
  }
}

async function upsertParcelAuditLog(fastify, { wbn, item_id, chute_id, status, reason, source,machine_id ,inductapi_sent, induct_payload, induct_response }) {
  try {
    await fastify.pg.query(
      `INSERT INTO sorter_audit_log
         (wbn, item_id, chute_id, expected_chute_id, status, reason, source,machine_id,
          induct_time, inductapi_sent, induct_payload, induct_response, created_at)
       VALUES ($1, $2, $3, $3, $4, $5, $6, $7, NOW(), $8, $9::jsonb, $10::jsonb, NOW())
       ON CONFLICT (item_id, machine_id) DO UPDATE SET
         wbn               = EXCLUDED.wbn,
         chute_id          = EXCLUDED.chute_id,
         expected_chute_id = EXCLUDED.expected_chute_id,
         status            = EXCLUDED.status,
         reason            = EXCLUDED.reason,
         source            = EXCLUDED.source,
         machine_id        = EXCLUDED.machine_id,
         induct_time       = NOW(),
         inductapi_sent    = EXCLUDED.inductapi_sent,
         induct_payload    = EXCLUDED.induct_payload,
         induct_response   = EXCLUDED.induct_response`,
      [
        wbn,
        item_id         ?? null,
        chute_id        ?? null,
        status          ?? null,
        reason          ?? null,
        source          ?? null,
        machine_id      ?? null,
        inductapi_sent  ?? false,
        JSON.stringify(induct_payload  ?? null),
        JSON.stringify(induct_response ?? null),
      ]
    );
    // console.log(`✅ sorter_audit_log upserted: wbn=${wbn} item_id=${item_id} inductapi_sent=${inductapi_sent}`);
    logRecorder.info({ message: "Sorter audit log upsert completed", event: "induct-api-worker(audit-log-upserted)", data: { wbn, item_id, inductapi_sent } });
  } catch (err) {
    // console.error(`❌ sorter_audit_log upsert failed for wbn=${wbn}:`, err.message);
    logRecorder.info({ message: "Sorter audit log upsert failed", event: "induct-api-worker(audit-log-upsert-failed)", data: { wbn, item_id, error: err.message } });
  }
}

module.exports = fp(async function inductApiWorkerPlugin(fastify) {

  const worker = new Worker(
    "inductApiQueue",
    async (job) => {
      const {
        item_id, wbn, chute_id, status, reason, source,machine_id,
        induct_payload, induct_response, inductapi_sent,
      } = job.data;

      // console.log(`📡 inductApiWorker: item_id=${item_id} wbn=${wbn} chute=${chute_id} inductapi_sent=${inductapi_sent}`);
      logRecorder.info({ message: "Induct API persistence job received", event: "induct-api-worker(job-received)", data: { item_id, wbn, chute_id, inductapi_sent } });
      await upsertParcelInduct(fastify, {
        wbn, item_id, chute_id, status, reason, source,machine_id,
        inductapi_sent,
        induct_payload,
        induct_response,
      });

      await upsertParcelAuditLog(fastify, {
        wbn, item_id, chute_id, status, reason, source,machine_id,
        inductapi_sent,
        induct_payload,
        induct_response,
      });

      return { success: true, item_id };
    },
    {
      connection: { ...connection, maxRetriesPerRequest: null },
    }
  );

  worker.on("failed", (job, err) => {
    // console.error(`❌ inductApiWorker job ${job?.id} failed: ${err.message}`);
    // console.error(`   item_id=${job?.data?.item_id} wbn=${job?.data?.wbn}`);
    logRecorder.info({ message: "Induct API worker job failed", event: "induct-api-worker(job-failed)", data: { jobId: job?.id, item_id: job?.data?.item_id, wbn: job?.data?.wbn, error: err.message } });
  });

  worker.on("completed", (job) => {
    // console.log(`✅ inductApiWorker job ${job.id} completed for item_id=${job?.data?.item_id}`);
    logRecorder.info({ message: "Induct API worker job completed", event: "induct-api-worker(job-completed)", data: { jobId: job.id, item_id: job?.data?.item_id } });
  });

  fastify.addHook("onClose", async () => { await worker.close(); });

  logRecorder.info({ message: "Induct API Worker started", event: "induct-api-worker(start)" });
});