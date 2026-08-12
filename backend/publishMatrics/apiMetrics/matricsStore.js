const metricsStore = {};

function initMetric(apiName) {
  if (!metricsStore[apiName]) {
    metricsStore[apiName] = {
      success: 0,
      clientError: 0,
      serverError: 0,
      latencies: []
    };
  }
}

function recordMetric(apiName, statusCode, latency) {
  initMetric(apiName);

  if (statusCode >= 200 && statusCode < 300) {
    metricsStore[apiName].success++;
  } else if (statusCode >= 400 && statusCode < 500) {
    metricsStore[apiName].clientError++;
  } else if (statusCode >= 500) {
    metricsStore[apiName].serverError++;
  }

  metricsStore[apiName].latencies.push(latency);
}

function resetMetrics() {
  Object.keys(metricsStore).forEach((key) => {
    metricsStore[key] = {
      success: 0,
      clientError: 0,
      serverError: 0,
      latencies: []
    };
  });
}

module.exports = {
  metricsStore,
  recordMetric,
  resetMetrics
};