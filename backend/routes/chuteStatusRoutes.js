// routes/chuteStatusRoutes.js
//
// POST /v2/facility/:facilityId/installation/:installationId/chuteStatus
//
// FK sends chute_ids (e.g. CH056) → we resolve chute_code (e.g. D056) from chute_mappings
// → use chute_code for all sensor/parcel/bag lookups → respond with full status per chute.
// All DB queries done directly — no queue needed (read-only response).
// All chute_ids processed in parallel via Promise.all for concurrent request survival.

const API_KEY = "mechintsorter";
const logRecorder = require("../utils/logger")

async function validateRequest(req, reply, fastify) {
  const { facilityId, installationId } = req.params;
  let machine_id;
  try {
 const result = await fastify.pg.query(
          `SELECT machine_id FROM settings WHERE facility_id = $1 AND installation_id = $2`,
          [facilityId, installationId]
        );
        if (result.rows.length === 0) {
          return reply.code(400).send({
            success: false,
            error_response: {
              code: 400,
              reason: "MACHINE_NOT_FOUND",
              message: `No machine found for facilityId '${facilityId}' and installationId '${installationId}'`,
            },
          });
        }

  machine_id = result.rows[0].machine_id;
  } catch (err) {
    fastify.log.error("❌ Settings validation error:", err.message);
    reply.code(500).send({
      success: false,
      error_response: { code: 500, reason: "SETTINGS_QUERY_ERROR", message: err.message },
    });
    return null;
  }

  return machine_id;
}

/**
 * Extracts numeric suffix from chute_code.
 * e.g. "D056" → 56, "D001" → 1, "D329" → 329
 * Used to build btn/snr keys for bag_sensors lookup.
 */
function extractChuteNumber(chute_code) {
  const match = chute_code.match(/(\d+)$/);
  if (!match) return null;
  return parseInt(match[1], 10);
}

/**
 * Process a single chute_id — all DB queries run in parallel via Promise.all.
 * Returns [chute_id, result] tuple.
 */
async function processChuteId(fastify, chute_id, machine_id) {
  // ── 0. 1 second delay ────────────────────────────────────────────────
  // Gives drop notification API (~300ms) time to complete before we query
  // parcels table — prevents items appearing in items_not_verified during
  // the race window between PLC confirmation and drop API response.
  await new Promise(r => setTimeout(r, 1000));

  // ── 1. Resolve chute_code from chute_mappings ────────────────────────
  let chute_code = null;
  const tableName = `chute_mappings_${machine_id}`;
  try {
    const codeRes = await fastify.pg.query(
      `SELECT chute_code FROM ${tableName} WHERE chute_id = $1 LIMIT 1`,
      [chute_id]
    );
    if (codeRes.rows.length > 0) {
      chute_code = codeRes.rows[0].chute_code;
      // console.log(`✅ chuteStatus: chute_id=${chute_id} → chute_code=${chute_code}`);
      logRecorder.bagLogger.info({ message: "Chute mapping resolved", event: "chute-status(chute-mapping-resolved)", data: { chute_id, chute_code } });
    } else {
      logRecorder.bagLogger.info({ message: "Chute mapping not found", event: "chute-status(chute-mapping-not-found)", data: { chute_id } });
      return [chute_id, { error: `No mapping found for chute_id=${chute_id}` }];
    }
  } catch (err) {
    logRecorder.bagLogger.info({ message: "Chute mapping lookup failed", event: "chute-status(chute-mapping-failed)", data: { chute_id, error: err.message } });
    return [chute_id, { error: err.message }];
  }

  // ── 2. Extract chute number for btn/snr lookup ───────────────────────
  const chuteNum = extractChuteNumber(chute_code);
  if (!chuteNum) {
    return [chute_id, { error: `Could not extract chute number from chute_code=${chute_code}` }];
  }

  const btnKey = `btn${chuteNum}`;
  const snrKey = `snr${chuteNum}`;

  // ── 3. Fire all remaining DB queries in parallel ─────────────────────
  const [sensorRes, mappingRes, parcelsRes] = await Promise.all([
    // sensors
    fastify.pg.query(
      `SELECT chute_id, value FROM bag_sensors WHERE chute_id = ANY($1::text[]) AND machine_id = $2`,
      [[btnKey, snrKey], machine_id]
    ),
    // bag_code
    fastify.pg.query(
      `SELECT bag_code FROM ${tableName} WHERE chute_code = $1 LIMIT 1`,
      [chute_code]
    ),
    // parcels
    fastify.pg.query(
      `SELECT item_id,
              induct_time,
              drop_time,
              drop_notification_sent,
              status,
              final_chute_id
       FROM parcels
       WHERE chute_id = $1 AND machine_id = $2`,
      [chute_code, machine_id]
    ),
  ]);

  // ── 4. Determine chute_status from btn sensor ────────────────────────
  const sensorMap = {};
  for (const row of sensorRes.rows) sensorMap[row.chute_id] = row.value;

  const btnVal = sensorMap[btnKey] ?? 0;

  let chute_status;
  if (btnVal === 0) {
    chute_status = "SORTATION_IN_PROGRESS";
  } else if (btnVal === 1) {
    chute_status = "BAGGING_IN_PROGRESS";
  } else {
    chute_status = "SORTATION_IN_PROGRESS"; // fallback
  }

  // ── 5. bag_code ──────────────────────────────────────────────────────
  const bag_code = mappingRes.rows[0]?.bag_code ?? [];

  // ── 6. Build list_of_items ───────────────────────────────────────────
  const list_of_items = parcelsRes.rows
    .filter((row) => row.status === "SORTED" && row.final_chute_id !== null)
    .map((row) => ({
    item: {
      item_id:   row.item_id,
      type:      "SHIPMENT",
      image_url: "",
    },
    additional_data: [
      { key: "carriage_id", value: "" },
    ],
    physical_attributes: {
      length:  { value: 0, unit: "MILLIMETRE" },
      breadth: { value: 0, unit: "MILLIMETRE" },
      height:  { value: 0, unit: "MILLIMETRE" },
      volume:  { value: 0, unit: "CUBIC_MILLIMETRE" },
      weight:  { value: 0, unit: "GRAMS" },
    },
    induct_time: row.induct_time ? new Date(row.induct_time).getTime() : null,
    drop_time:   row.drop_time   ? new Date(row.drop_time).getTime()   : null,
  }));

  // ── 7. Build items_not_verified ──────────────────────────────────────
  // SORTED + final_chute_id set (physically dropped) + drop not yet sent
  const items_not_verified = parcelsRes.rows
    .filter((row) =>
      !row.drop_notification_sent &&
      row.status === "SORTED" &&
      row.final_chute_id !== null
    )
    .map((row) => row.item_id);

  return [chute_id, {
    chute_status,
    total_weight: { value: 0, unit: "GRAMS" },
    total_volume: { value: 0, unit: "CUBIC_MILLIMETRE" },
    bag_code,
    list_of_items,
    items_not_verified,
  }];
}

async function chuteStatusRoutes(fastify) {
  fastify.post(
    "/v2/facility/:facilityId/installation/:installationId/chuteStatus",
    async (req, reply) => {
      const machine_id = await validateRequest(req, reply, fastify);
      if (machine_id == null) return;

      const { chute_ids } = req.body || {};
      logRecorder.bagLogger.info({ message: "Chute status request received", event: "chute-status(request)", data: { chute_ids } });

      if (!Array.isArray(chute_ids) || chute_ids.length === 0) {
        return reply.code(400).send({
          success: false,
          error_response: { code: 400, reason: "INVALID_PAYLOAD", message: "'chute_ids' must be a non-empty array" },
        });
      }

      // Process all chute_ids in parallel — each one fires its own DB queries concurrently
      const results = await Promise.all(
        chute_ids.map((chute_id) => processChuteId(fastify, chute_id, machine_id))
      );

      // Build response object from [chute_id, result] tuples
      const response = Object.fromEntries(results);
      logRecorder.bagLogger.info({ message: "Chute status response sent", event: "chute-status(response)", data: { requestedChutes: chute_ids.length } });

      return reply.code(200).send(response);
    }
  );
}

module.exports = chuteStatusRoutes;