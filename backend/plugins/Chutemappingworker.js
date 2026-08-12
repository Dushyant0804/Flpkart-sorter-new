const { Worker } = require("bullmq");
const fp = require("fastify-plugin");
const redisConnection = require("../config/redisConnection");
const logRecorder = require("../utils/logger"); 

// CH112 → "12" → "D012"
// CH039 → "39" → "D039"
// CH10  → "10" → "D010"
function deriveChuteCode(chute_id) {
  const digits = String(chute_id).replace(/\D/g, ""); // strip non-digits
  const last2  = digits.slice(-2);                    // last 2 digits
  return `D0${last2}`;
}

// machine_id comes from the settings table (validated upstream in the route
// via facilityId/installationId lookup), but we still guard the dynamic
// table name against anything unexpected before it ever reaches SQL.
const MACHINE_ID_PATTERN = /^[A-Za-z0-9_]+$/;

function assertValidMachineId(machine_id) {
  if (!machine_id || !MACHINE_ID_PATTERN.test(machine_id)) {
    throw new Error(`chuteMappingWorker: invalid machine_id "${machine_id}"`);
  }
}

module.exports = fp(async function chuteMappingWorker(fastify) {

  const worker = new Worker(
    "chutemappingqueue",
    async (job) => {
      const { mapping, machine_id } = job.data;

      assertValidMachineId(machine_id);

      logRecorder.info({message : `chuteMappingWorker: processing ${mapping.length} chute(s) for machine_id=${machine_id}`});

      const tableName = `chute_mappings_${machine_id}`;

      const client = await fastify.pg.connect();
      try {
        await client.query("BEGIN");

        for (const chute of mapping) {
          const chute_code = deriveChuteCode(chute.chute_id);

          await client.query(
            `INSERT INTO ${tableName}
               (chute_id, chute_code, strategy, bag_code, sort_code_list, updated_at)
             VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, NOW())
             ON CONFLICT (chute_id)
             DO UPDATE SET
               chute_code     = EXCLUDED.chute_code,
               strategy       = EXCLUDED.strategy,
               bag_code       = EXCLUDED.bag_code,
               sort_code_list = EXCLUDED.sort_code_list,
               updated_at     = NOW()`,
            [
              chute.chute_id,
              chute_code,
              chute.strategy          ?? null,
              JSON.stringify(chute.bag_code       ?? []),
              JSON.stringify(chute.sort_code_list ?? []),
            ]
          );

          logRecorder.info({message : `✅ machine_id=${machine_id} ${chute.chute_id} → chute_code=${chute_code}`});
        }

        await client.query("COMMIT");
        logRecorder.info({message : `chuteMappingWorker: upserted ${mapping.length} chute(s) for machine_id=${machine_id}`});

        // Force sortEngineWorker to reload THIS machine's chute mapping cache
        // (not the global label config) — with-argument call resets chute
        // mapping per resetSortEngineCache(machine_id) contract.
        await fastify.resetSortEngineCache?.(machine_id);
        logRecorder.info({message : `chuteMappingWorker: sort engine cache invalidated for machine_id=${machine_id}`});

      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`chuteMappingWorker DB error (machine_id=${machine_id}):`, err.message);
        throw err;
      } finally {
        client.release();
      }
    },
    { connection: { ...redisConnection, maxRetriesPerRequest: null } }
  );

  worker.on("failed", (job, err) => {
    console.error(`chuteMappingWorker job ${job.id} failed (machine_id=${job?.data?.machine_id}): ${err.message}`);
  });

  worker.on("completed", (job) => {
    logRecorder.info({message:`chuteMappingWorker job ${job.id} completed for machine_id=${job?.data?.machine_id}`});
  });

  fastify.addHook("onClose", async () => {
    await worker.close();
  });
});
