const os = require("os");

async function buildHardwareMetrics() {

  const totalMemory =
    os.totalmem() / 1024 / 1024 / 1024;

  const freeMemory =
    os.freemem() / 1024 / 1024 / 1024;

  const usedMemory =
    totalMemory - freeMemory;

  const cpuCount =
    os.cpus().length;

  const load =
    os.loadavg()[0];

  const cpuPercent =
    Math.min(
      (load / cpuCount) * 100,
      100
    );

  return [

    {
      type: "HARDWARE",
      name: "cpu_allocated",
      value: String(cpuCount),
      measure: "cores"
    },

    {
      type: "HARDWARE",
      name: "cpu_used",
      value: load.toFixed(2),
      measure: "cores"
    },

    {
      type: "HARDWARE",
      name: "cpu_utilization",
      value: cpuPercent.toFixed(2),
      measure: "percent"
    },

    {
      type: "HARDWARE",
      name: "memory_allocated",
      value: totalMemory.toFixed(2),
      measure: "GB"
    },

    {
      type: "HARDWARE",
      name: "memory_used",
      value: usedMemory.toFixed(2),
      measure: "GB"
    },

    {
      type: "HARDWARE",
      name: "memory_utilization",
      value: (
        (usedMemory / totalMemory) * 100
      ).toFixed(2),
      measure: "percent"
    },

    {
      type: "HARDWARE",
      name: "disk_allocated",
      value: "0",
      measure: "GB"
    },

    {
      type: "HARDWARE",
      name: "disk_used",
      value: "0",
      measure: "GB"
    },

    {
      type: "HARDWARE",
      name: "disk_utilization",
      value: "0",
      measure: "percent"
    },

    {
      type: "HARDWARE",
      name: "network_tx",
      value: "0",
      measure: "mbps"
    },

    {
      type: "HARDWARE",
      name: "network_rx",
      value: "0",
      measure: "mbps"
    }

  ];

}

module.exports = {
  buildHardwareMetrics
};