const axios = require("axios");
const tokenManager = require("../config/tokenManager");
const logRecorder = require("../utils/logger");

const { buildApiMetricsPayload } = require("./apiMetrics/buildApiMetricsPayload");
const { buildQueueMetrics } = require("./queueMetrics/buildQueueMetrics");
const { buildHardwareMetrics } = require("./hardwareMetrics/buildHardwareMetrics");
const { resetMetrics } = require("./apiMetrics/matricsStore");

async function buildHeaders() {
  const token = await tokenManager.getValidToken();

  return {
    "X-REQUESTED-BY": "mechintsorter",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function publishMetrics(fastify) {
return
  const settings = tokenManager.getSettings(machine_id);
  const { facilityId, installationId } = settings;

  if (!facilityId || !installationId) {
    throw new Error("Missing facilityId / installationId");
  }

  const apiMetrics = await buildApiMetricsPayload();

  const queueMetrics = await buildQueueMetrics(fastify);

  const hardwareMetrics = await buildHardwareMetrics();

  const payload = {
    metrics: [
      ...apiMetrics,
      ...queueMetrics,
      ...hardwareMetrics
    ],
    timestamp: Date.now()
  };

  const url =
    `http://10.24.32.216/api/v2/facility/${facilityId}/installation/${installationId}/metrics`;

  const headers = await buildHeaders();


  try {

    const response = await axios.post(
      url,
      payload,
      {
        headers,
        timeout: 8000
      }
    );

    logRecorder.info({
      message: "Metrics published successfully",
      data: response.data
    });

    resetMetrics();

    return {
      data: response.data
    };

  } catch (err) {

    logRecorder.info({
      message: "Metrics publish failed",
      event: "publish-metrics-failed",
      data: {
        status: err.response?.status,
        response: err.response?.data,
        error: err.message
      }
    });

    return {
      success: false,
      status: err.response?.status,
      data: err.response?.data
    };

  }

}

module.exports = {
  publishMetrics
};
