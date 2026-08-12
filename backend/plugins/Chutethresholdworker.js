// plugins/chuteThresholdWorker.js

const { Worker } = require("bullmq");
const fp         = require("fastify-plugin");
const axios      = require("axios");
const connection = require("../config/redisConnection");

module.exports = fp(async function chuteThresholdWorker(fastify) {

  const worker = new Worker(
    "chuteThresholdQueue",
    async (job) => {
      const { scope, chute_ids, closing_threshold, type } = job.data;

      const max_weight = closing_threshold?.max_weight ?? null;
      const max_volume = closing_threshold?.max_volume ?? null;
      const max_items  = closing_threshold?.max_items  ?? null;

      const client = await fastify.pg.connect();
      try {
        await client.query("BEGIN");

        let targetChuteIds = [];

        if (scope === "ALL") {
          const result = await client.query(
            `SELECT chute_id FROM chute_mappings ORDER BY chute_id ASC`
          );
          targetChuteIds = result.rows.map((r) => r.chute_id);

          if (targetChuteIds.length === 0) {
            console.log("chuteThresholdWorker: no chutes found in chute_mappings");
            await client.query("COMMIT");
            return;
          }

          console.log(`chuteThresholdWorker [ALL]: applying threshold to ${targetChuteIds.length} chute(s)`);
        } else {
          targetChuteIds = chute_ids;
          console.log(`chuteThresholdWorker [SPECIFIC]: applying threshold to ${targetChuteIds.length} chute(s)`);
        }

        for (const chute_id of targetChuteIds) {
          await client.query(
            `INSERT INTO chute_thresholds
               (chute_id, max_weight, max_volume, max_items, type, updated_at)
             VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5, NOW())
             ON CONFLICT (chute_id)
             DO UPDATE SET
               max_weight = EXCLUDED.max_weight,
               max_volume = EXCLUDED.max_volume,
               max_items  = EXCLUDED.max_items,
               type       = EXCLUDED.type,
               updated_at = NOW()`,
            [chute_id, JSON.stringify(max_weight), JSON.stringify(max_volume), JSON.stringify(max_items), type]
          );
        }

        await client.query("COMMIT");
        console.log(`✅ chuteThresholdWorker: upserted thresholds for ${targetChuteIds.length} chute(s)`);

        // ── Send threshold map to Node-RED ────────────────────────────
        // Build { chute_id: max_items_value, ... } for all updated chutes
        try {
          const thresholdRes = await client.query(
            `SELECT chute_id, max_items FROM chute_thresholds
             WHERE chute_id = ANY($1::text[])
             ORDER BY chute_id ASC`,
            [targetChuteIds]
          );

          const nodeRedPayload = {};
          for (const row of thresholdRes.rows) {
            nodeRedPayload[`${row.chute_id}_t`] = row.max_items?.value ?? null;
          }

          const nodeRedUrl = process.env.NODE_RED_URL || "http://127.0.0.1:1880/chute-thresholds";

          await axios.post(nodeRedUrl, nodeRedPayload, {
            headers: { "Content-Type": "application/json" },
            timeout: 5_000,
          });

          console.log(`✅ chuteThresholdWorker: sent threshold map to Node-RED (${thresholdRes.rows.length} chutes)`);
        } catch (err) {
          // Non-blocking — log but don't fail the job
          console.error("❌ chuteThresholdWorker: Node-RED notify failed:", err.message);
        }

      } catch (err) {
        await client.query("ROLLBACK");
        console.error("❌ chuteThresholdWorker DB error:", err.message);
        throw err;
      } finally {
        client.release();
      }
    },
    { connection }
  );

  worker.on("failed", (job, err) => {
    console.error(`❌ chuteThresholdWorker job ${job.id} failed: ${err.message}`);
  });

  worker.on("completed", (job) => {
    console.log(`✅ chuteThresholdWorker job ${job.id} completed`);
  });

  fastify.addHook("onClose", async () => {
    await worker.close();
  });
});