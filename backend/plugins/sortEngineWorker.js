// plugins/sortEngineWorker.js
//
// Flow:
//  1. Duplicate check  → bags_wbn table (commented out)
//  2. Label extraction → regex match (+ slice for long barcodes) → wbnKey
//  3. Bulk data lookup → labels[] jsonb key exists → resolves real item_id
//  4. Live API pull    → 3 attempts; retryable=network/5xx, non-retryable=404/409/410
//  5. Sorting logic    → chute_mappings cache (per machine_id) → bestChute
//  6. Induct API       → call synchronously; if fail → reject to EXCEPTION_CHUTE
//  7. Broadcast        → sort-result WebSocket (only after successful induct)
//  8. Enqueue          → inductApiQueue for DB persistence only
//
// ── Multi-machine cache strategy ────────────────────────────────────────────
// This worker serves multiple physical sorter machines. Each job carries a
// `machine_id`. label_configurations (regex) is IDENTICAL across all
// machines, so it stays one global cache. chute_mappings DIFFERS per
// machine (each machine has its own chutes/sort codes), so it is cached
// per-machine — both locally (Map<machine_id, rows>) and in Redis
// (one key per machine_id). All 10 machines share ONE Redis server; only
// the KEYS are namespaced by machine_id.
//
//   Local cache (hot path, read every job, zero network cost)
//     labelConfigCache            → single array, shared by all machines
//     chuteMappingCacheByMachine  → Map(machine_id -> array)
//
//   Redis (shared source of truth across all worker instances/processes)
//     sortEngine:cache:labelConfig                → global
//     sortEngine:cache:chuteMapping:<machine_id>   → per machine
//
//   Invalidation: resetSortEngineCache(machine_id)
//     - called WITH machine_id  → reloads only that machine's chute mapping
//       from Postgres, writes it to Redis, publishes {type:"chute", machine_id}
//     - called WITHOUT machine_id → reloads the global label config from
//       Postgres, writes it to Redis, publishes {type:"label"}
//     Every other worker instance is subscribed and, on receiving either
//     message, re-hydrates ONLY the affected cache from Redis (not Postgres)
//     — avoids a thundering herd on the DB across instances/machines.
//
//   If Redis is unreachable, every read/write falls back to Postgres
//   directly so the sorter keeps running (degraded speed, not broken).
//
// ── fkApiClient / tokenManager integration ──────────────────────────────────
// settings (facilityId, installationId) are now loaded per machine_id in
// tokenManager. Every fkApiClient call in this file that needs those values
// (pullSortationDetails, inductShipment) is passed `machine_id` so it can
// resolve the right row via tokenManager.getSettings(machine_id). The FK
// access token itself is still ONE shared token across all machines — only
// the settings lookup is machine-specific.

const fp           = require("fastify-plugin");
const { Worker }   = require("bullmq");
const connection   = require("../config/redisConnection");
const tokenManager = require("../config/tokenManager");
const fkApiClient  = require("../config/fkApiClient");
const logRecorder =  require("../utils/logger");

// `../config/redisConnection` is a plain connection-options object
// (host/port/etc.) used to configure BullMQ's `connection` option — it is
// NOT an ioredis client instance. We build a real ioredis client from those
// same options so cache reads/writes and pub/sub share the exact same
// Redis target as BullMQ.
const IORedis      = require("ioredis");
const redisClient  = new IORedis({ ...connection, maxRetriesPerRequest: null });

const EXCEPTION_CHUTE = "D040";

// Pull API retry config
const PULL_MAX_ATTEMPTS   = 3;
const PULL_RETRY_DELAY_MS = 1000;
const PULL_RETRYABLE      = new Set([429, 500, 502, 503, 504]);

// Redis cache config
const REDIS_KEY_LABEL_CONFIG          = "sortEngine:cache:labelConfig";
const REDIS_KEY_CHUTE_MAPPING_PREFIX  = "sortEngine:cache:chuteMapping"; // + ":" + machine_id
const REDIS_INVALIDATE_CHANNEL        = "sortEngine:cache:invalidate";
const REDIS_TTL_SECONDS               = 600; // 10 min backstop, invalidation is the primary mechanism
const PER_MACHINE_WORKER_CONCURRENCY = Number(process.env.SORTER_WORKER_CONC_PER_MACHINE || 4);


module.exports = fp(async function sortEngineWorkerPlugin(fastify) {

  // ── Init ──────────────────────────────────────────────────────────────────
  await tokenManager.init(fastify.pg);
  fkApiClient.init(fastify.pg);

  // ── Local in-memory cache (hot path, read on every job) ─────────────────────
  let labelConfigCache    = [];
  let labelConfigLoadedAt = 0;

  const chuteMappingCacheByMachine   = new Map(); // machine_id -> chute rows
  const chuteMappingLoadedAtByMachine = new Map(); // machine_id -> timestamp

  const CACHE_TTL_MS = 60_000;

  // Dedicated subscriber connection — ioredis requires a separate connection
  // once a client enters subscribe mode.
  const redisSub = redisClient.duplicate();

  function chuteMappingRedisKey(machine_id) {
    return `${REDIS_KEY_CHUTE_MAPPING_PREFIX}:${machine_id}`;
  }

  function hydrateLabelConfig(rawRows) {
    return rawRows.map((row) => ({
      label_type:   row.label_type,
      label_regex:  new RegExp(row.label_regex),
      label_fields: row.label_fields,
    }));
  }

  function dehydrateLabelConfig(rawRows) {
    // Store the plain DB rows (regex as string) — RegExp objects aren't JSON safe.
    return rawRows.map((row) => ({
      label_type:   row.label_type,
      label_regex:  row.label_regex,
      label_fields: row.label_fields,
    }));
  }

  // ── Label config (global, same for every machine) ───────────────────────────

  async function queryLabelConfigFromDb() {
    const res = await fastify.pg.query(
      `SELECT label_type, label_regex, label_fields FROM label_configurations`
    );
    return res.rows;
  }

  async function loadLabelConfigFromDbAndPopulateRedis() {
    const rows = await queryLabelConfigFromDb();

    labelConfigCache    = hydrateLabelConfig(rows);
    labelConfigLoadedAt = Date.now();

    try {
      await redisClient.set(
        REDIS_KEY_LABEL_CONFIG,
        JSON.stringify(dehydrateLabelConfig(rows)),
        "EX",
        REDIS_TTL_SECONDS
      );
    } catch (err) {
      logRecorder.info({ message: "⚠️  failed to write label config cache to redis (continuing on DB-loaded local cache)", event: "sort-engine(file)", err: err.message });
    }
  }

  async function loadLabelConfig() {
    try {
      const json = await redisClient.get(REDIS_KEY_LABEL_CONFIG);
      if (json) {
        labelConfigCache    = hydrateLabelConfig(JSON.parse(json));
        labelConfigLoadedAt = Date.now();
        logRecorder.info({ message: "label config cache hydrated from redis", event: "sort-engine(file)" });
        return;
      }
    } catch (err) {
      logRecorder.info({ message: "⚠️  redis read failed for label config cache, falling back to DB", event: "sort-engine(file)", err: err.message });
    }

    await loadLabelConfigFromDbAndPopulateRedis();
  }

  async function ensureLabelConfig() {
    if (Date.now() - labelConfigLoadedAt > CACHE_TTL_MS) await loadLabelConfig();
  }

  // ── Chute mapping (per machine_id) ──────────────────────────────────────────

  async function queryChuteMappingFromDb(machine_id) {
    const res = await fastify.pg.query(
      `SELECT chute_id, chute_code, sort_code_list FROM chute_mappings_${machine_id}`,
    );
    return res.rows.map((row) => ({
      chute_id:       row.chute_id,
      chute_code:     row.chute_code,
      sort_code_list: row.sort_code_list,
    }));
  }

  async function loadChuteMappingFromDbAndPopulateRedis(machine_id) {
    const rows = await queryChuteMappingFromDb(machine_id);

    chuteMappingCacheByMachine.set(machine_id, rows);
    chuteMappingLoadedAtByMachine.set(machine_id, Date.now());

    try {
      await redisClient.set(
        chuteMappingRedisKey(machine_id),
        JSON.stringify(rows),
        "EX",
        REDIS_TTL_SECONDS
      );
    } catch (err) {
      logRecorder.info({ message: `⚠️  failed to write chute mapping cache to redis for machine_id=${machine_id} (continuing on DB-loaded local cache)`, event: "sort-engine(file)", err: err.message });
    }
  }

  async function loadChuteMapping(machine_id) {
    try {
      const json = await redisClient.get(chuteMappingRedisKey(machine_id));
      if (json) {
        chuteMappingCacheByMachine.set(machine_id, JSON.parse(json));
        chuteMappingLoadedAtByMachine.set(machine_id, Date.now());
        logRecorder.info({ message: `chute mapping cache hydrated from redis for machine_id=${machine_id}`, event: "sort-engine(file)" });
        return;
      }
    } catch (err) {
      logRecorder.info({ message: `⚠️  redis read failed for chute mapping cache (machine_id=${machine_id}), falling back to DB`, event: "sort-engine(file)", err: err.message });
    }

    await loadChuteMappingFromDbAndPopulateRedis(machine_id);
  }

  async function ensureChuteMapping(machine_id) {
    const loadedAt = chuteMappingLoadedAtByMachine.get(machine_id) || 0;
    if (Date.now() - loadedAt > CACHE_TTL_MS) await loadChuteMapping(machine_id);
  }

  async function ensureCache(machine_id) {
    await Promise.all([ensureLabelConfig(), ensureChuteMapping(machine_id)]);
  }

  // Initial load: label config is global, load it once at boot.
  // Chute mappings are loaded lazily, per machine_id, on that machine's first job.
  await loadLabelConfig();

  // ── Cross-instance invalidation ─────────────────────────────────────────────
  try {
    await redisSub.subscribe(REDIS_INVALIDATE_CHANNEL);
    redisSub.on("message", async (channel, message) => {
      if (channel !== REDIS_INVALIDATE_CHANNEL) return;

      let payload;
      try {
        payload = JSON.parse(message);
      } catch (err) {
        logRecorder.info({ message: "⚠️  received malformed sort engine cache invalidation message", event: "sort-engine(file)", err: err.message });
        return;
      }

      try {
        if (payload.type === "label") {
          labelConfigLoadedAt = 0;
          await loadLabelConfig();
          logRecorder.info({ message: "label config cache reloaded via pub/sub invalidation", event: "sort-engine(file)" });
        } else if (payload.type === "chute" && payload.machine_id) {
          chuteMappingLoadedAtByMachine.delete(payload.machine_id);
          await loadChuteMapping(payload.machine_id);
          logRecorder.info({ message: `chute mapping cache reloaded via pub/sub invalidation for machine_id=${payload.machine_id}`, event: "sort-engine(file)" });
        }
      } catch (err) {
        logRecorder.info({ message: "⚠️  failed to reload sort engine cache after invalidation signal", event: "sort-engine(file)", err: err.message, data: payload });
      }
    });
  } catch (err) {
    logRecorder.info({ message: "⚠️  failed to subscribe to sort engine cache invalidation channel", event: "sort-engine(file)", err: err.message });
  }

  // resetSortEngineCache(machine_id):
  //   - with machine_id    → reset that machine's chute mapping only
  //   - without machine_id → reset the global label config (regex) only
  fastify.decorate("resetSortEngineCache", async (machine_id) => {
    try {
      if (machine_id) {
        logRecorder.info({ message: `reset sort engine cache — reloading chute mapping for machine_id=${machine_id} and notifying other instances`, event: "sort-engine(file)" });
        await loadChuteMappingFromDbAndPopulateRedis(machine_id);
        await redisClient.publish(REDIS_INVALIDATE_CHANNEL, JSON.stringify({ type: "chute", machine_id }));
      } else {
        logRecorder.info({ message: "reset sort engine cache — reloading global label config and notifying other instances", event: "sort-engine(file)" });
        await loadLabelConfigFromDbAndPopulateRedis();
        await redisClient.publish(REDIS_INVALIDATE_CHANNEL, JSON.stringify({ type: "label" }));
      }
    } catch (err) {
      logRecorder.info({ message: "❌ resetSortEngineCache failed", event: "sort-engine(file)", err: err.message, data: { machine_id } });
      // Ensure this instance at least isn't left serving stale data even if
      // the DB reload or redis publish above failed partway through.
      if (machine_id) {
        chuteMappingLoadedAtByMachine.delete(machine_id);
      } else {
        labelConfigLoadedAt = 0;
      }
    }
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  function splitWbn(rawWbn) {
    return String(rawWbn).split(",").map((s) => s.trim()).filter(Boolean);
  }

  function extractWbnKey(labels) {
    for (const label of labels) {
      for (const config of labelConfigCache) {
        if (!config.label_regex.test(label)) continue;

        if (label.length <= 30) {
          return label;
        }

        const field = config.label_fields?.[0];
        if (!field) continue;
        const start = parseInt(field.start_index, 10);
        if (isNaN(start)) continue;

        let pipeCount = 0;
        let end = -1;
        for (let i = 0; i < label.length; i++) {
          if (label[i] === "|") {
            pipeCount++;
            if (pipeCount === 2) { end = i; break; }
          }
        }

        if (end === -1) {
          logRecorder.info({message : `⚠️  long label has <2 pipes, cannot extract: "${label}"`,event : "sort-engine(file)"  })
          continue;
        }

        return label.slice(start, end);
      }
    }
    return null;
  }

  function runSortingLogic(parcelSortCodes, machine_id) {
    const chuteMappingCache = chuteMappingCacheByMachine.get(machine_id) || [];

    const parcelMap = {};
    for (const { key, value } of parcelSortCodes) parcelMap[key] = value;

    let bestChute   = null;
    let bestCount   = -1;
    let bestHasFlow = false;

    for (const chute of chuteMappingCache) {
      for (const combination of chute.sort_code_list) {
        let conflict     = false;
        let matchCount   = 0;
        let hasFlowMatch = false;
        const matchLog   = [];

        for (const { key, value } of combination) {
          if (!value && value !== 0) { matchLog.push(`  ${key}: wildcard`); continue; }
          const parcelValue = parcelMap[key];
          if (parcelValue === undefined) { matchLog.push(`  ${key}: not in parcel`); continue; }
          if (parcelValue !== value) { conflict = true; break; }
          matchLog.push(`  ${key}: "${value}" ✅`);
          matchCount++;
          if (key === "flow") hasFlowMatch = true;
        }

        if (conflict) continue;

        if (
          matchCount > bestCount ||
          (matchCount === bestCount && hasFlowMatch && !bestHasFlow)
        ) {
          bestCount   = matchCount;
          bestChute   = chute;
          bestHasFlow = hasFlowMatch;
          logRecorder.info({message :` ⭐ New best → ${chute.chute_id} (${chute.chute_code}), machine_id=${machine_id}, count: ${bestCount}` ,event : "sort-engine(file)" })
        }
      }
    }

    return bestCount > 0 ? bestChute : null;
  }

  function buildResult({ id, wbn, item_id = null, chute_id, status, reason = null, source = null, machine_id = null }) {
    return { id, wbn, item_id, chute_id, status, reason, source, machine_id };
  }

  async function updatePrimaryBinData(wbn, item_id, wbn_key, expected_bag, sort, reason, machine_id = null) {
    try {
      const res = await fastify.pg.query(
        `UPDATE primary_bin_data
         SET item_id      = $1,
             expected_bag = $2,
             sort         = $3,
             reason       = $4,
             wbn_key      = $5,
             sorttime     = NOW()
         WHERE id = (
           SELECT id FROM primary_bin_data
           WHERE wbn = $6 AND machine_id = $7
           ORDER BY id DESC
           LIMIT 1
         )`,
        [
          item_id      ?? null,
          expected_bag ?? null,
          sort         ?? null,
          reason       ?? null,
          wbn_key      ?? null,
          wbn,
          machine_id
        ]
      );
      if (res.rowCount > 0) {
        logRecorder.info({message : `✅ primaryBinData updated: wbn=${wbn} wbn_key=${wbn_key} item_id=${item_id} bag=${expected_bag} sort=${sort} reason=${reason}`,event : "sort-engine(file)" })
      } else {
        logRecorder.info({message : `⚠️  primaryBinData: no row found for wbn=${wbn}`,event : "sort-engine(file)" })
      }
    } catch (err) {
      logRecorder.info({message : `❌ primaryBinData update failed for wbn=${wbn}:`,event : "sort-engine(file)",err : err.message })
    }
  }

  // Enqueue to inductApiQueue — DB persistence only (API already called inline)
  async function enqueueInduct(item_id, wbn, chute_id, status, reason, source, induct_payload, induct_response, inductapi_sent, machine_id) {
    try {
      await fastify.queues.inductApiQueue.add("induct", {
        item_id, wbn, chute_id, status, reason, source, machine_id,
        induct_payload, induct_response, inductapi_sent,
      });
    } catch (err) {
      logRecorder.info({message : `❌ enqueueInduct failed for item_id=${item_id}:`,event : "sort-engine(file)" })
    }
  }

  async function pullWithRetry(labels, machine_id) {
    let lastResult;

    for (let attempt = 1; attempt <= PULL_MAX_ATTEMPTS; attempt++) {
      // machine_id is passed through so fkApiClient can resolve the correct
      // facilityId/installationId via tokenManager.getSettings(machine_id)
      // (settings are now per-machine; the access token itself stays shared).
      lastResult = await fkApiClient.pullSortationDetails(labels, machine_id);

      if (lastResult.success) return lastResult;

      const status      = lastResult.status;
      const isRetryable = !status || PULL_RETRYABLE.has(status);

      if (!isRetryable) {
        logRecorder.info({message : `❌ pull API [attempt ${attempt}]: ${lastResult.reason} (non-retryable) → stopping`,event : "sort-engine(file)" })
        return lastResult;
      }

      if (attempt < PULL_MAX_ATTEMPTS) {
        const delay = PULL_RETRY_DELAY_MS * attempt;
        logRecorder.info({message : `⏳ pull API [attempt ${attempt}/${PULL_MAX_ATTEMPTS}]: ${lastResult.reason} → retrying in ${delay}ms`,event : "sort-engine(file)" })
        await new Promise(r => setTimeout(r, delay));
      } else {
        logRecorder.info({message : `❌ pull API: all ${PULL_MAX_ATTEMPTS} attempts failed → rejecting to ${EXCEPTION_CHUTE}`,event : "sort-engine(file)" })
      }
    }

    return lastResult;
  }


    // ── Per-machine Workers ────────────────────────────────────────────────────
  const machineRes = await fastify.pg.query(
    `SELECT DISTINCT machine_id FROM settings WHERE machine_id IS NOT NULL`
  );

  const machineIds = machineRes.rows.map((r) => r.machine_id);

  if (!machineIds.length) {
    logRecorder.info({ message: "❌ sortEngineWorker: no machine_id rows found in settings — no workers started", event: "sort-engine(file)" });
  }

  const workersByMachine = new Map();

  for (const machine_id of machineIds) {
    try {
      await ensureChuteMapping(machine_id);
    } catch (err) {
      logRecorder.info({ message: `⚠️  failed to warm chute mapping cache for machine_id=${machine_id} at boot`, event: "sort-engine(file)", err: err.message });
    }

    const queueName = `sortEngineQueue-${machine_id}`;
    const worker =   new Worker(
    queueName,
    async (job) => {
      const { id, wbn: rawWbn, machine_id } = job.data;
      // Reject immediately if machine_id is missing or has no matching settings —
      // before touching cache/DB, so nothing silently disappears.
      if (!machine_id || !tokenManager.getSettings(machine_id)) {
        const out = buildResult({ id, wbn: rawWbn, chute_id: EXCEPTION_CHUTE, status: "REJECTED", reason: "INVALID_MACHINE_ID", machine_id });
        logRecorder.info({ message: `⚠️  rejected: missing or unknown machine_id`, event: "sort-engine(file)", data: { machine_id } });
        fastify.broadcastSortResult?.(out);
        await updatePrimaryBinData(rawWbn, null, null, EXCEPTION_CHUTE, "REJECTED", "INVALID_MACHINE_ID", machine_id);
        return out;
      }
      await ensureCache(machine_id);

      const labels = splitWbn(rawWbn);
      // ── STEP 2: Label regex + wbnKey extraction ──────────────────────────
      if (!labelConfigCache.length) {
        const out = buildResult({ id, wbn: rawWbn, chute_id: EXCEPTION_CHUTE, status: "REJECTED", reason: "NO_LABEL_CONFIG", machine_id });
        fastify.broadcastSortResult?.(out);
        await updatePrimaryBinData(rawWbn, null, null, EXCEPTION_CHUTE, "REJECTED", "NO_LABEL_CONFIG",machine_id);
        return out;
      }

      const wbnKey = extractWbnKey(labels);
      logRecorder.info({message : `WBN key extracted`,event : "sort-engine(file)",data : {wbn: rawWbn,wbnKey,labelsCount: labels.length,machine_id} })
      if (!wbnKey) {
        logRecorder.info({message : `Label extraction failed`,event : "sort-engine(file)",data : {wbn: rawWbn,reason:"LABEL_NO_MATCH",machine_id} })
        const out = buildResult({ id, wbn: rawWbn, chute_id: EXCEPTION_CHUTE, status: "REJECTED", reason: "LABEL_NO_MATCH", machine_id });
        fastify.broadcastSortResult?.(out);
        await updatePrimaryBinData(rawWbn, null, null, EXCEPTION_CHUTE, "REJECTED", "LABEL_NO_MATCH",machine_id);
        return out;
      }

      // ── STEP 3: Bulk data lookup ─────────────────────────────────────────
      let parcelSortCodes = null;
      let item_id         = null;
      let source          = "DB";

      const bulkRes = await fastify.pg.query(
        `SELECT item_id, sort_code FROM bulk_data WHERE labels ? $1 LIMIT 1`,
        [wbnKey]
      );
      logRecorder.info({message : `Bulk data lookup From DB`,event : "sort-engine(file)",data : {wbnKey,found: bulkRes.rows.length > 0,itemId: bulkRes.rows[0]?.item_id || null,machine_id} })
      if (bulkRes.rows.length > 0) {
        parcelSortCodes = bulkRes.rows[0].sort_code;
        item_id         = bulkRes.rows[0].item_id;
      }

      // ── STEP 4: Live API pull — 3 attempts ──────────────────────────────
      if (!parcelSortCodes) {
        source = "API";
        logRecorder.info({message : `Bulk miss, calling FK API`,event : "sort-engine(file)",data : {wbn: rawWbn, labels, machine_id} })
        const apiResult = await pullWithRetry(labels, machine_id);

        if (!apiResult.success) {
          logRecorder.info({message : `FK pull API failed`,event : "sort-engine(file)",data : {wbn: rawWbn,reason: apiResult.reason,status: apiResult.status,machine_id} })
          const out = buildResult({ id, wbn: rawWbn, item_id, chute_id: EXCEPTION_CHUTE, status: "REJECTED", reason: apiResult.reason, source: "API", machine_id });
          fastify.broadcastSortResult?.(out);
          await updatePrimaryBinData(rawWbn, item_id, wbnKey, EXCEPTION_CHUTE, "REJECTED", apiResult.reason,machine_id);
          return out;
        }

        parcelSortCodes = apiResult.data?.sort_code;
        item_id         = apiResult.data?.item?.item_id ?? wbnKey;
        if (!parcelSortCodes?.length) {
          logRecorder.info({message : `sort code not found in pull data`,event : "sort-engine(file)",data : {wbn: rawWbn,machine_id} })
          const out = buildResult({ id, wbn: rawWbn, item_id, chute_id: EXCEPTION_CHUTE, status: "REJECTED", reason: "EMPTY_SORT_CODE", source: "API", machine_id });
          fastify.broadcastSortResult?.(out);
          await updatePrimaryBinData(rawWbn, item_id, wbnKey, EXCEPTION_CHUTE, "REJECTED", "EMPTY_SORT_CODE",machine_id);
          return out;
        }
      }

      // ── STEP 5: Sorting logic (scoped to this machine_id) ────────────────
      const chuteMappingForMachine = chuteMappingCacheByMachine.get(machine_id) || [];
      if (!chuteMappingForMachine.length) {
        logRecorder.info({message : `Mapping not found for machine`,event : "sort-engine(file)",data : {reason: "NO_CHUTE_MAPPING",machine_id} })
        const out = buildResult({ id, wbn: rawWbn, item_id, chute_id: EXCEPTION_CHUTE, status: "REJECTED", reason: "NO_CHUTE_MAPPING", source, machine_id });
        fastify.broadcastSortResult?.(out);
        await updatePrimaryBinData(rawWbn, item_id, wbnKey, EXCEPTION_CHUTE, "REJECTED", "NO_CHUTE_MAPPING",machine_id);
        return out;
      }

      const bestChute = runSortingLogic(parcelSortCodes, machine_id);
      logRecorder.info({message : `Sorting decision`,event : "sort-engine(file)",data : {wbn: rawWbn,itemId:item_id,chute:bestChute?.chute_code || EXCEPTION_CHUTE,matched:!!bestChute,machine_id} })
      if (!bestChute) {
        logRecorder.info({message : `Sorting decision`,event : "sort-engine(file)",data : {wbn: rawWbn,itemId:item_id,reason: "NO_CHUTE_MATCH",machine_id} })
        const out = buildResult({ id, wbn: rawWbn, item_id, chute_id: EXCEPTION_CHUTE, status: "REJECTED", reason: "NO_CHUTE_MATCH", source, machine_id });
        fastify.broadcastSortResult?.(out);
        await updatePrimaryBinData(rawWbn, item_id, wbnKey, EXCEPTION_CHUTE, "REJECTED", "NO_CHUTE_MATCH",machine_id);
        return out;
      }

      const chute_code = bestChute.chute_code;

      // ── STEP 6: Induct API — synchronous, before broadcast ───────────────
      // If induct fails → reject to EXCEPTION_CHUTE, don't sort
      // reason codes: DNF, SAPB, RTO, ISE, INDUCT_BODY_FAILED, EMPTY_RESPONSE
      // machine_id passed so fkApiClient can resolve this machine's
      // facilityId/installationId via tokenManager.getSettings(machine_id).
      const inductResult = await fkApiClient.inductShipment(item_id, machine_id);
      logRecorder.info({message : `Induct API Called`,event : "sort-engine(file)",data : {machine_id} })
      if (!inductResult.success) {
        const inductReason = inductResult.reason ?? "INDUCT_FAILED";
        logRecorder.info({message : `⚠️  induct failed: item_id=${item_id} reason=${inductReason} → rerouting to ${EXCEPTION_CHUTE}`,event : "sort-engine(file)",data : {machine_id} })
        const out = buildResult({ id, wbn: rawWbn, item_id, chute_id: EXCEPTION_CHUTE, status: "REJECTED", reason: inductReason, source, machine_id });
        fastify.broadcastSortResult?.(out);
        await updatePrimaryBinData(rawWbn, item_id, wbnKey, EXCEPTION_CHUTE, "REJECTED", inductReason,machine_id);

        // Persist failed induct to DB via queue
        await enqueueInduct(
          item_id, rawWbn, EXCEPTION_CHUTE, "REJECTED", inductReason, source,
          inductResult.payload, inductResult.response, false, machine_id
        );
        return out;
      }

      // ── STEP 7: Broadcast — only after successful induct ─────────────────
      const out = buildResult({ id, wbn: rawWbn, item_id, chute_id: chute_code, status: "SORTED", source, machine_id });
      logRecorder.info({message : `📤 SORTED: ${rawWbn} → chute=${bestChute.chute_id} code=${chute_code} item_id=${item_id} wbn_key=${wbnKey} machine_id=${machine_id} (${source})`,event : "sort-engine(file)" })
      fastify.broadcastSortResult?.(out);
      await updatePrimaryBinData(rawWbn, item_id, wbnKey, chute_code, "SORTED", null,machine_id);

      // ── STEP 8: Enqueue for DB persistence only (API already done) ───────
      await enqueueInduct(
        item_id, rawWbn, chute_code, "SORTED", null, source,
        inductResult.payload, inductResult.response, true, machine_id
      );

      return out;
    },
    {
      connection:  { ...connection, maxRetriesPerRequest: null },
      concurrency: PER_MACHINE_WORKER_CONCURRENCY,
    }
  );
    worker.on("failed", (job, err) => {
      logRecorder.info({ message: `❌ sortEngineWorker[${machine_id}] job failed`, event: "sort-engine(file)", data: { jobId: job?.id, error: err.message } });
    });

    workersByMachine.set(machine_id, worker);
    logRecorder.info({ message: `⚙️  sortEngineWorker started for machine_id=${machine_id} (queue=${queueName}, concurrency=${PER_MACHINE_WORKER_CONCURRENCY})`, event: "sort-engine(file)" });
  }


  fastify.addHook("onClose", async (instance, done) => {
    try { await redisSub.quit(); } catch (_) {}
    for (const worker of workersByMachine.values()) {
      try { await worker.close(); } catch (_) {}
    }
    done();
  });

  logRecorder.info({ message: `⚙️  sortEngineWorker plugin ready — ${workersByMachine.size} machine worker(s)`, event: "sort-engine(file)" });
});
