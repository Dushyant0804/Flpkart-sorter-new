
// For each item:
//   1. Check if item_id already exists in bulk_data
//   2. If exists AND incoming timestamp > existing timestamp:
//      - archive old row into previous_bulk_data
//      - replace with new row
//   3. If exists AND incoming timestamp <= existing timestamp:
//      - skip (old data, do not overwrite)
//   4. If not exists:
//      - insert fresh

const { Worker } = require("bullmq");
const fp = require("fastify-plugin");
const connection = require("../config/redisConnection");
const logRecorder = require("../utils/logger")
module.exports = fp(async function bulkDataWorker(fastify) {
  const worker = new Worker(
    "bulkDataQueue", // must match queue name in queues.js exactly
    async (job) => {
      const { items } = job.data;

      // console.log(
      //   `bulkDataWorker: processing ${items.length} item(s)`
      // );
      logRecorder.bulkDataLogger.info({ message: "Bulk data inserted" });

      const client = await fastify.pg.connect();
      try {
        await client.query("BEGIN");

        for (const item of items) {
          const { item_id, labels, type, sort_code, timestamp } = item;

          // ── Check if record already exists ──────────────────────────
          const existing = await client.query(
            `SELECT item_id, labels, type, sort_code, timestamp
             FROM bulk_data
             WHERE item_id = $1`,
            [item_id]
          );

          if (existing.rows.length > 0) {
            const existingRecord = existing.rows[0];

            // ── Incoming is older or same — skip ─────────────────────
            if (timestamp <= existingRecord.timestamp) {
              // console.log(
              //   `bulkDataWorker: skipping '${item_id}' — incoming timestamp (${timestamp}) is not newer than existing (${existingRecord.timestamp})`
              // );
              logRecorder.bulkDataLogger.info({ message: `bulkDataWorker: skipping '${item_id}' — incoming timestamp (${timestamp}) is not newer than existing (${existingRecord.timestamp})` });
              continue;
            }

            // ── Incoming is newer — archive old row first ─────────────
            await client.query(
              `INSERT INTO previous_bulk_data
                 (item_id, labels, type, sort_code, timestamp, replaced_at)
               VALUES ($1, $2::jsonb, $3, $4::jsonb, $5, NOW())`,
              [
                existingRecord.item_id,
                JSON.stringify(existingRecord.labels),
                existingRecord.type,
                JSON.stringify(existingRecord.sort_code),
                existingRecord.timestamp,
              ]
            );

            // ── Replace with new data ─────────────────────────────────
            await client.query(
              `UPDATE bulk_data
               SET labels      = $1::jsonb,
                   type        = $2,
                   sort_code   = $3::jsonb,
                   timestamp   = $4,
                   received_at = NOW()
               WHERE item_id = $5`,
              [
                JSON.stringify(labels),
                type,
                JSON.stringify(sort_code),
                timestamp,
                item_id,
              ]
            );

            // console.log(
            //   `bulkDataWorker: replaced '${item_id}' (old ts: ${existingRecord.timestamp} → new ts: ${timestamp})`
            // );
          } else {
            // ── Fresh insert ──────────────────────────────────────────
            await client.query(
              `INSERT INTO bulk_data
                 (item_id, labels, type, sort_code, timestamp, received_at)
               VALUES ($1, $2::jsonb, $3, $4::jsonb, $5, NOW())`,
              [
                item_id,
                JSON.stringify(labels),
                type,
                JSON.stringify(sort_code),
                timestamp,
              ]
            );

            // console.log(
            //   `bulkDataWorker: inserted '${item_id}'`
            // );
          }
        }

        await client.query("COMMIT");
        // console.log(
        //   `bulkDataWorker: job ${job.id} committed — ${items.length} item(s) processed`
        // );
      } catch (err) {
        await client.query("ROLLBACK");
        // console.error("bulkDataWorker DB error:", err.message);
        logRecorder.bulkDataLogger.info({
          message: "BulkDataWorker database error",
          error: err.message,
        });
        throw err; // BullMQ will retry
      } finally {
        client.release();
      }
    },
    { connection }
  );

  worker.on("failed", (job, err) => {
    // console.log(
    //   `bulkDataWorker job ${job.id} failed: ${err.message}`
    // );
    logRecorder.bulkDataLogger.info({
      message: `bulkDataWorker job ${job.id} failed: ${err.message}`,
      // error: err.message,
    });
  });

  worker.on("completed", (job) => {
    // console.log(`bulkDataWorker job ${job.id} completed`);
  });

  fastify.addHook("onClose", async () => {
    await worker.close();
  });
});