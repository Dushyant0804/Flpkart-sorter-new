const percentile = require("./percentile");
const { metricsStore } = require("./matricsStore");

async function buildApiMetricsPayload() {

  const metrics = [];

  for (const [apiName, data] of Object.entries(metricsStore)) {

    metrics.push({
      type: "API",
      name: `${apiName}.2xx`,
      value: String(data.success),
      measure: "rps"
    });

    metrics.push({
      type: "API",
      name: `${apiName}.4xx`,
      value: String(data.clientError),
      measure: "rps"
    });

    metrics.push({
      type: "API",
      name: `${apiName}.5xx`,
      value: String(data.serverError),
      measure: "rps"
    });

    metrics.push({
      type: "API",
      name: `${apiName}.p95`,
      value: String(
        percentile(data.latencies, 95)
      ),
      measure: "ms"
    });

    metrics.push({
      type: "API",
      name: `${apiName}.p99`,
      value: String(
        percentile(data.latencies, 99)
      ),
      measure: "ms"
    });

  }

  return metrics;

}

module.exports = {
  buildApiMetricsPayload
};