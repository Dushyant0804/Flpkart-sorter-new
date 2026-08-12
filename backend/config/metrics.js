// config/metrics.js
const client = require("prom-client");

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const decisionLatency = new client.Histogram({
  name: "sorter_decision_latency_ms",
  help: "Latency of sorting decision in ms",
  buckets: [1, 2, 5, 10, 20, 50, 100],
});

const vendorCallsTotal = new client.Counter({
  name: "sorter_vendor_calls_total",
  help: "Total vendor API calls",
  labelNames: ["status"], // success|failed
});

register.registerMetric(decisionLatency);
register.registerMetric(vendorCallsTotal);

module.exports = {
  register,
  decisionLatency,
  vendorCallsTotal,
};
