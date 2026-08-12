// config/fkApiClient.js
//
// Outbound FK API calls.
// Uses tokenManager for auth — no token logic here.
//
// Exports:
//   init(pool)                   → call once on server start
//   pullSortationDetails(labels) → sort data or error reason, saves to bulk_data on success
//   inductShipment(item_id)      → induct shipment, returns { success, payload, response }

const axios        = require("axios");
const tokenManager = require("./tokenManager");
const logRecorder = require("../utils/logger")
const { recordMetric } = require("../publishMatrics/apiMetrics/matricsStore");

let pool = null;

/**
 * Must be called once on server start after pg pool is ready.
 */
function init(pgPool) {
  pool = pgPool;
}

async function buildHeaders() {
  const token = await tokenManager.getValidToken();
  return {
    "X-REQUESTED-BY": "mechintsorter",
    "Authorization":  `Bearer ${token}`,
    "Content-Type":   "application/json",
  };
}

/**
 * GET sortation details for given labels from FK.
 * On success → upserts data into bulk_data table for future DB hits.
 */
async function pullSortationDetails(labels,machine_id) {
  const settings = tokenManager.getSettings(machine_id);
  if (!settings) {
  throw new Error(`fkApiClient: settings not found for machine ${machine_id}`);
}
  const { facilityId, installationId } = settings;

  if (!facilityId || !installationId) {
    throw new Error("fkApiClient: missing facilityId / installationId in settings");
  }

  const queryParams = labels.map((l) => `labels=${encodeURIComponent(l)}`).join("&");
  const url         = `http://localhost:4000/api/v2/sort/facility/:facilityId/installation/:installationId/sortationDetails`;
  const headers     = await buildHeaders();
  logRecorder.info({
  message: "Calling pullSortationDetails API",
  event: "fk-api-client(pull-sortation-request)",
  data: {
    facilityId,
    installationId,
    labels,
  },
});

  try {
        var start = Date.now();
    const response = await axios.get(url, { headers, timeout: 8_000 });
        recordMetric( //--------------------------------------------------------------
      "sortation_pull",
      response.status,
      Date.now() - start
    );
    const data     = response.data?.data;
     logRecorder.info({
      message: "Sortation details received successfully",
      event: "fk-api-client(pull-sortation-success)",
      data: {
        item_id: data?.item?.item_id,
        labels: data?.item?.labels,
        sort_code: data?.sort_code,
      },
    });

    // ── Save to bulk_data so next scan hits DB, not API ──────────────
    if (data && pool) {
      const { item, sort_code, timestamp } = data;
       logRecorder.info({
      message: "Saving sortation details into bulk_data",
      event: "fk-api-client(save-bulk-data)",
      data: {
        item_id: item.item_id,
      },
    });
      try {
        await pool.query(
          `INSERT INTO bulk_data
             (item_id, labels, type, sort_code, timestamp, received_at)
           VALUES ($1, $2::jsonb, $3, $4::jsonb, $5, NOW())
           ON CONFLICT (item_id)
           DO UPDATE SET
             labels      = EXCLUDED.labels,
             type        = EXCLUDED.type,
             sort_code   = EXCLUDED.sort_code,
             timestamp   = EXCLUDED.timestamp,
             received_at = NOW()`,
          [
            item.item_id,
            JSON.stringify(item.labels ?? []),
            item.type ?? null,
            JSON.stringify(sort_code ?? []),
            timestamp ?? Date.now(),
          ]
        );
        // console.log(`💾 fkApiClient: saved ${item.item_id} to bulk_data`);
        logRecorder.info({
        message: "bulk_data updated successfully",
        event: "fk-api-client(save-bulk-data-success)",
        data: {
          item_id: item.item_id,
        },
      });
      } catch (dbErr) {
        // console.error("❌ fkApiClient: bulk_data insert failed:", dbErr.message);
        
        logRecorder.info({
        message: "Failed to save bulk_data",
        event: "fk-api-client(save-bulk-data-failed)",
        data: {
          item_id: item?.item_id,
          error: dbErr.message,
          stack: dbErr.stack,
        },
      });
      }
    }

    return { success: true, data };
  } catch (err) {
        recordMetric( //-------------------------------------------------------------------
      "sortation_pull",
      err.response?.status || 500,
      Date.now() - start
    );
    const status    = err.response?.status;
    const reasonMap = { 404: "DNF", 409: "SAPB", 410: "RTO", 500: "ISE" };
    const reason    = reasonMap[status] || "API_ERROR";
    // console.error(`❌ fkApiClient pullSortationDetails: ${status} → ${reason}`);
    logRecorder.info({
    message: "pullSortationDetails API failed",
    event: "fk-api-client(pull-sortation-failed)",
    data: {
      facilityId,
      installationId,
      labels,
      status,
      reason,
      error: err.message,
      response: err.response?.data,
    },
  });
    return { success: false, reason, status };
  }
}

/**
 * POST inductShipment for a single item_id.
 * Called synchronously in sortEngineWorker before broadcast.
 *
 * Returns:
 *   { success: true,  payload, response }
 *   { success: false, reason, payload, response }
 */
async function inductShipment(item_id, machine_id) {
  const settings = tokenManager.getSettings(machine_id);
  if (!settings) {
    throw new Error(`fkApiClient: settings not found for machine ${machine_id}`);
  }
  const { facilityId, installationId } = settings;

  if (!facilityId || !installationId) {
    throw new Error("fkApiClient: missing facilityId / installationId in settings");
  }

  const url     = `https://mechint-testing-env.onrender.com/api/v2/facility/312/installation/LUH_Sorter_Mech_1/inductShipment`;
  const headers = await buildHeaders();
  const payload = { shipments: [{ item_id }] };

  const INDUCT_MAX_ATTEMPTS = 2;
  const INDUCT_TIMEOUT_MS   = 4_000;
  const INDUCT_RETRY_DELAY  = 500;

  logRecorder.info({
    message: "Calling inductShipment API",
    event: "fk-api-client(induct-request)",
    data: { facilityId, installationId, item_id },
  });

  const reasonMap = { 404: "DNF", 409: "SAPB", 410: "RTO", 500: "ISE" };

  let lastStatus  = null;
  let lastErrBody = null;
  let lastReason  = "API_ERROR";

  for (let attempt = 1; attempt <= INDUCT_MAX_ATTEMPTS; attempt++) {
    let start;
    try {
      start = Date.now();
      const response = await axios.post(url, payload, { headers, timeout: INDUCT_TIMEOUT_MS });
      recordMetric("induct_shipment", response.status, Date.now() - start);

      const shipmentResp = response.data?.shipment_responses?.[0];

      if (!shipmentResp) {
        logRecorder.info({
          message: "Empty shipment response received",
          event: "fk-api-client(induct-empty-response)",
          data: { item_id, response: response.data },
        });
        return { success: false, reason: "EMPTY_RESPONSE", payload, response: response.data };
      }

      if (shipmentResp.success === false) {
        const reason = shipmentResp?.error_response?.reason || "INDUCT_BODY_FAILED";
        logRecorder.info({
          message: "Shipment induction failed",
          event: "fk-api-client(induct-body-failed)",
          data: { item_id, reason, response: response.data },
        });
        return { success: false, reason, payload, response: response.data };
      }

      logRecorder.info({
        message: "Shipment inducted successfully",
        event: "fk-api-client(induct-success)",
        data: { item_id, response: response.data },
      });
      return { success: true, payload, response: response.data };

    } catch (err) {
      lastStatus  = err.response?.status;
      lastErrBody = err.response?.data ?? { error: err.message };
      lastReason  = reasonMap[lastStatus] || "API_ERROR";   // 👈 fixed: lastStatus, not status

      recordMetric("induct_shipment", lastStatus || 500, Date.now() - start);

      const isRetryable = !lastStatus || lastStatus >= 500 || lastStatus === 429;

      logRecorder.info({
        message: "inductShipment API attempt failed",
        event: "fk-api-client(induct-failed)",
        data: {
          item_id,
          machine_id,
          attempt,
          status: lastStatus ?? "network/timeout",   
          reason: lastReason,                          
          error: err.message,
          response: lastErrBody,                      
        },
      });

      if (!isRetryable) break;
      if (attempt < INDUCT_MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, INDUCT_RETRY_DELAY));
      }
    }
  }

  // Final failure after exhausting all attempts (or hit a non-retryable status)
  logRecorder.info({
    message: "inductShipment API failed after all attempts",
    event: "fk-api-client(induct-failed-final)",
    data: {
      item_id,
      machine_id,
      status: lastStatus ?? "network/timeout",
      reason: lastReason,
      response: lastErrBody,
    },
  });

  return { success: false, reason: lastReason, status: lastStatus, payload, response: lastErrBody };
}

module.exports = { init, pullSortationDetails, inductShipment };