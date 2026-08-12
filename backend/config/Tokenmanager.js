// config/tokenManager.js
//
// Singleton that manages FK access token.
// All workers (across all machines) share the same token — no race conditions on refresh.
//
// Tables:
//   settings   → auth config, ONE ROW PER MACHINE: machine_id, client_id, client_secret,
//                target_client_id, facility_id, installation_id
//   auth_table (id=1) → token state: access_token, expires_in (seconds), token_fetched_at (timestamp)
//                        UNCHANGED — one shared token for every machine.
//
// Settings cache strategy:
//   - ALL machine rows are loaded in ONE shot (bulk), not per-machine, into a local
//     Map<machine_id, settings> AND a single Redis key holding all rows.
//   - On init(): try Redis first (fast); if empty, load from Postgres and populate Redis.
//   - reloadSettings() re-reads Postgres, writes fresh data to Redis, and publishes a
//     pub/sub signal so every other instance (other machines' processes) re-hydrates
//     from Redis instead of hitting Postgres again.
//   - doRefresh() needs client_id/client_secret/target_client_id to get a token —
//     since these are IDENTICAL across every machine's row, it just grabs them from
//     any one loaded row.
//
// Expiry logic (unchanged):
//   - FK returns expires_in = seconds the token is valid from fetch time
//   - We store expires_in as-is + token_fetched_at = NOW() in DB
//   - On validation: elapsed = now - token_
// fetched_at (seconds), valid if elapsed < expires_in - 60
//   - 60s buffer prevents using a token that expires mid-request
//
// Usage:
//   const tokenManager = require("../config/tokenManager");
//   await tokenManager.init(pool);
//   const token = await tokenManager.getValidToken();
//   const { facilityId, installationId } = tokenManager.getSettings(machine_id);

const axios       = require("axios");
const logRecorder = require('../utils/logger')
const fk_host_url = "https://service.authn-prod.fkcloud.in";

const CSRF_TOKEN = "83cdea61-319d-4dae-858c-c8d2636aab76";

// `./redisConnection` is a plain connection-options object (host/port/etc.)
// used to configure BullMQ elsewhere — it is NOT an ioredis client instance.
// We build a real ioredis client from those same options here.
const IORedis    = require("ioredis");
const connection = require("./redisConnection");
const redisClient = new IORedis({ ...connection, maxRetriesPerRequest: null });
const redisSub     = redisClient.duplicate();

const REDIS_KEY_SETTINGS       = "tokenManager:cache:settings";
const REDIS_INVALIDATE_CHANNEL = "tokenManager:cache:invalidate";
const REDIS_TTL_SECONDS        = 3500; // 1hr backstop — settings change rarely, reloadSettings() is the primary trigger

// ── In-memory token state (unchanged — one shared token for all machines) ───
let cachedToken    = null;  // access_token string
let expiresIn      = 0;     // seconds the token is valid from fetchedAt
let fetchedAt      = 0;     // epoch ms when token was fetched
let refreshPromise = null;  // shared promise — prevents concurrent refreshes

// ── Settings cache (bulk, one row per machine_id) ────────────────────────────
let settingsByMachine = new Map(); // machine_id -> { client_id, client_secret, target_client_id, facilityId, installationId }
let settingsLoadedAt  = 0;

let pool = null;

/**
 * Must be called once on server start after pg pool is ready.
 */
async function init(pgPool) {
  pool = pgPool;
  await loadSettings();
  await loadTokenFromDb();

  try {
    await redisSub.subscribe(REDIS_INVALIDATE_CHANNEL);
    redisSub.on("message", async (channel, message) => {
      if (channel !== REDIS_INVALIDATE_CHANNEL) return;
      try {
        const payload = JSON.parse(message);
        if (payload.type === "settings") {
          settingsLoadedAt = 0;
          await loadSettings(); // re-hydrates from redis, not postgres
          logRecorder.info({ message: "settings cache reloaded via pub/sub invalidation", event: "token-manager(settings-reloaded-pubsub)" });
        }
      } catch (err) {
        logRecorder.info({ message: "⚠️  failed to reload settings after invalidation signal", event: "token-manager(settings-reload-failed)", data: { err: err.message } });
      }
    });
  } catch (err) {
    logRecorder.info({ message: "⚠️  failed to subscribe to settings invalidation channel", event: "token-manager(subscribe-failed)", data: { err: err.message } });
  }

  console.log("tokenManager initialized");
  logRecorder.info({
    message: "Token manager initialized",
    event: "token-manager(init)",
  });
}

/**
 * Queries ALL machine rows from settings table (bulk — not per-machine).
 */
async function querySettingsFromDb() {
  const res = await pool.query(
    `SELECT machine_id, client_id, client_secret, target_client_id, facility_id, installation_id
     FROM settings`
  );
  console.log(res.rows)
  if (!res.rows.length) throw new Error("tokenManager: no rows found in settings table");
  return res.rows;
}

function rowsToMap(rows) {
  const map = new Map();
  for (const row of rows) {
    map.set(row.machine_id, {
      machine_id:       row.machine_id,
      client_id:        row.client_id,
      client_secret:    row.client_secret,
      target_client_id: row.target_client_id,
      facilityId:       row.facility_id,
      installationId:   row.installation_id,
    });
  }
  return map;
}

/**
 * Loads ALL machine settings from Postgres in one shot, sets local cache,
 * and best-effort writes the full set through to Redis (one key, one write)
 * so other instances can hydrate from Redis instead of hitting the DB.
 */
async function loadSettingsFromDbAndPopulateRedis() {
  const rows = await querySettingsFromDb();

  settingsByMachine = rowsToMap(rows);
  settingsLoadedAt   = Date.now();

  try {
    await redisClient.set(REDIS_KEY_SETTINGS, JSON.stringify(rows), "EX", REDIS_TTL_SECONDS);
  } catch (err) {
    logRecorder.info({ message: "⚠️  failed to write settings cache to redis (continuing on DB-loaded local cache)", event: "token-manager(settings-redis-write-failed)", data: { err: err.message } });
  }

  logRecorder.info({
    message: "Authentication settings loaded for all machines",
    event: "token-manager(settings-loaded)",
    data: { machineCount: settingsByMachine.size, machineIds: [...settingsByMachine.keys()] },
  });
}

/**
 * Tries Redis first (fast, no DB hit); falls back to Postgres if Redis has
 * nothing cached yet or is unreachable.
 */
async function loadSettings() {
  try {
    const json = await redisClient.get(REDIS_KEY_SETTINGS);
    if (json) {
      const rows = JSON.parse(json);
      settingsByMachine = rowsToMap(rows);
      settingsLoadedAt   = Date.now();
      logRecorder.info({ message: "settings cache hydrated from redis", event: "token-manager(settings-hydrated-redis)", data: { machineCount: settingsByMachine.size } });
      return;
    }
  } catch (err) {
    logRecorder.info({ message: "⚠️  redis read failed for settings cache, falling back to DB", event: "token-manager(settings-redis-read-failed)", data: { err: err.message } });
  }

  await loadSettingsFromDbAndPopulateRedis();
}

/**
 * Loads token state from auth_table.
 * Reconstructs fetchedAt from token_fetched_at timestamp.
 * (Unchanged — token remains one shared row, no machine_id involved.)
 */
async function loadTokenFromDb() {
  const res = await pool.query(
    `SELECT access_token, expires_in, token_fetched_at FROM auth_table WHERE id = 1`
  );
  if (!res.rows.length) return; // no token yet — will refresh on first request

  const row = res.rows[0];
  if (row.access_token && row.expires_in && row.token_fetched_at) {
    cachedToken = row.access_token;
    expiresIn   = row.expires_in;                             // seconds
    fetchedAt   = new Date(row.token_fetched_at).getTime();   // epoch ms
    console.log(`tokenManager: loaded token from DB, expires_in=${expiresIn}s fetched_at=${new Date(fetchedAt).toISOString()}`);
    logRecorder.info({
      message: "Token loaded from database",
      event: "token-manager(token-loaded-db)",
      data: {
        expires_in: expiresIn,
        fetched_at: new Date(fetchedAt).toISOString(),
      },
    });
  }
}

/**
 * HOW EXPIRY IS CHECKED: (unchanged)
 *
 * FK gives: { access_token: "xxx", expires_in: 3600 }
 * We store: expires_in=3600, token_fetched_at=NOW()
 *
 * On each check:
 *   elapsed  = (Date.now() - fetchedAt) / 1000   ← seconds since fetch
 *   valid if elapsed < expires_in - 60            ← 60s buffer
 *
 * Example:
 *   expires_in  = 3600s
 *   elapsed     = 3500s  → 3500 < 3540 ✅ valid
 *   elapsed     = 3541s  → 3541 < 3540 ❌ refresh
 */
function tokenIsValid() {
  if (!cachedToken || !fetchedAt || !expiresIn) return false;
  const elapsedSeconds = (Date.now() - fetchedAt) / 1000;
  const valid = elapsedSeconds < expiresIn - 60;
  console.log(`🔑 tokenIsValid=${valid} elapsed=${Math.floor(elapsedSeconds)}s expires_in=${expiresIn}s remaining=${Math.floor(expiresIn - elapsedSeconds)}s`);
  logRecorder.info({
    message: "Token validation checked",
    event: "token-manager(token-validation)",
    data: {
      valid,
      elapsed_seconds: Math.floor(elapsedSeconds),
      expires_in: expiresIn,
      remaining_seconds: Math.floor(expiresIn - elapsedSeconds),
    },
  });
  return valid;
}

/**
 * Returns the client_id/client_secret/target_client_id used to obtain a token.
 * These are IDENTICAL across every machine's settings row (only facilityId /
 * installationId differ per machine), so any one loaded row's credentials work.
 */
function getAuthCredentials() {
  const first = settingsByMachine.values().next().value;
  if (!first || !first.client_id || !first.client_secret || !first.target_client_id) {
    throw new Error("tokenManager: missing auth config (client_id, client_secret, target_client_id) — no settings loaded");
  }
  return {
    client_id:        first.client_id,
    client_secret:    first.client_secret,
    target_client_id: first.target_client_id,
  };
}

/**
 * Calls FK auth API, updates memory + auth_table.
 * Token remains ONE shared token for all machines.
 */
async function doRefresh() {
  const { client_id, client_secret, target_client_id } = getAuthCredentials();

  const url = `https://mechint-testing-env.onrender.com/v3/oauth/token`;

  const params = new URLSearchParams({
    client_id,
    client_secret,
    grant_type:       "client_credentials",
    target_client_id,
  });

  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    "Cookie":       `CSRF-TOKEN=${CSRF_TOKEN}`,
  };

  // console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  // console.log("tokenManager: refreshing access token...");
  // console.log(`  URL:              ${url}`);
  // console.log(`  client_id:        ${client_id}`);
  // console.log(`  client_secret:    ${client_secret}`);
  // console.log(`  grant_type:       client_credentials`);
  // console.log(`  target_client_id: ${target_client_id}`);
  // console.log(`  Cookie:           CSRF-TOKEN=${CSRF_TOKEN}`);
  // console.log(`  Content-Type:     application/x-www-form-urlencoded`);
  // console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  logRecorder.info({
    message: "Refreshing access token",
    event: "token-manager(refresh-start)",
  });

  let response;
  try {
    response = await axios.post(url, params.toString(), {
      headers,
      timeout: 10_000,
    });
  } catch (err) {
    logRecorder.info({
      message: "Authentication API failed",
      event: "token-manager(refresh-failed)",
      data: {
        error: err.message,
        status: err.response?.status,
        response: err.response?.data,
      },
    });
    throw err;
  }

  const { access_token, expires_in } = response.data;
  if (!access_token) {
    logRecorder.info({
      message: "No access token received",
      event: "token-manager(missing-access-token)",
      data: response.data,
    });
    throw new Error("tokenManager: no access_token in auth response");
  }
  if (!expires_in) {
    logRecorder.info({
      message: "No expires_in received",
      event: "token-manager(missing-expiry)",
      data: response.data,
    });
    throw new Error("tokenManager: no expires_in in auth response");
  }

  const nowMs     = Date.now();
  const fetchedTs = new Date(nowMs);

  // Update memory
  cachedToken = access_token;
  expiresIn   = expires_in;
  fetchedAt   = nowMs;

  // Persist to auth_table — UPSERT so it never silently fails
  await pool.query(
    `INSERT INTO auth_table (id, access_token, expires_in, token_fetched_at, updated_at)
     VALUES (1, $1, $2, $3, NOW())
     ON CONFLICT (id) DO UPDATE SET
       access_token      = EXCLUDED.access_token,
       expires_in        = EXCLUDED.expires_in,
       token_fetched_at  = EXCLUDED.token_fetched_at,
       updated_at        = NOW()`,
    [access_token, expires_in, fetchedTs]
  );

  console.log(`✅ tokenManager: token refreshed — expires_in=${expires_in}s valid until ~${new Date(nowMs + expires_in * 1000).toISOString()}`);
  logRecorder.info({
    message: "Access token refreshed successfully",
    event: "token-manager(refresh-success)",
    data: {
      expires_in,
      fetched_at: fetchedTs.toISOString(),
      valid_until: new Date(nowMs + expires_in * 1000).toISOString(),
    },
  });
  return cachedToken;
}

/**
 * Returns a valid access token (shared across all machines).
 * If expired → refresh. If refresh already in progress → await same promise.
 */
async function getValidToken() {
  if (tokenIsValid()) {
    logRecorder.info({
      message: "Using cached access token",
      event: "token-manager(cached-token)",
    });
    return cachedToken;
  }

  if (refreshPromise) {
    logRecorder.info({
      message: "Waiting for ongoing token refresh",
      event: "token-manager(refresh-in-progress)",
    });
    return await refreshPromise;
  }

  refreshPromise = doRefresh().finally(() => {
    refreshPromise = null;
  });

  return await refreshPromise;
}

/**
 * Exposes cached settings for a SPECIFIC machine (facilityId, installationId etc.)
 * used by fkApiClient. machine_id is required — call sites need to pass the
 * machine_id from the job being processed.
 */
function getSettings(machine_id) {
  if (!machine_id) {
    logRecorder.info({ message: "⚠️  getSettings called without machine_id", event: "token-manager(get-settings-missing-machine-id)" });
    return undefined;
  }
  const settings = settingsByMachine.get(machine_id);
  if (!settings) {
    logRecorder.info({ message: `⚠️  no settings found for machine_id=${machine_id}`, event: "token-manager(get-settings-not-found)" });
  }
  return settings;
}

/**
 * Force reload ALL machines' settings from DB (call after settings are
 * updated via UI), writes fresh data to Redis, and notifies every other
 * instance (other machines' processes) to re-hydrate from Redis.
 */
async function reloadSettings() {
  try {
    await loadSettingsFromDbAndPopulateRedis();
    await redisClient.publish(REDIS_INVALIDATE_CHANNEL, JSON.stringify({ type: "settings" }));
    logRecorder.info({
      message: "Authentication settings reloaded",
      event: "token-manager(settings-reloaded)",
    });
  } catch (err) {
    logRecorder.info({
      message: "❌ reloadSettings failed",
      event: "token-manager(settings-reload-failed)",
      data: { err: err.message },
    });
    settingsLoadedAt = 0; // don't leave this instance stuck on stale data
  }
}

/**
 * Optional: call during graceful app shutdown to close the subscriber connection.
 */
async function shutdown() {
  try { await redisSub.quit(); } catch (_) { /* best effort */ }
}

module.exports = { init, getValidToken, getSettings, reloadSettings, shutdown };
