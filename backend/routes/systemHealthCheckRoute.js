// routes/systemHealthRoutes.js
//
// Reads THIS server's own OS-level health on demand — no external
// device, no push agent. Requires the `systeminformation` package
// (Node's built-in `os` module alone can't give disk/network/temp):
//   npm install systeminformation
//
// GET /api/system-health
//   → { success, data: [ { title, value, status, temperature, uptime }, ... ] }
//   Shape matches what SystemHealth.jsx already expects.

const fp = require("fastify-plugin");
const si = require("systeminformation");
const os = require("os");

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function statusForValue(pct) {
  if (pct >= 90) return "Critical";
  if (pct >= 70) return "Warning";
  return "Healthy";
}

module.exports = async function systemHealthCheckRoute(fastify) {

  fastify.get("/system-health", async (req, reply) => {
    try {
      const [cpuLoad, mem, disks, netStats, cpuTemp] = await Promise.all([
        si.currentLoad(),          // cross-platform CPU % (better than os.loadavg on Windows)
        si.mem(),                  // memory
        si.fsSize(),                // disk(s) — array, one per mounted volume
        si.networkStats(),          // network throughput per interface
        si.cpuTemperature().catch(() => ({ main: null })), // may be unsupported on some hardware/containers
      ]);

      const cpuPct = Math.round(cpuLoad.currentLoad);

      const memUsedPct = Math.round((mem.active / mem.total) * 100);

      // Use the volume with the highest usage % (usually the main OS disk)
      const primaryDisk = disks.reduce(
        (worst, d) => (d.use > (worst?.use ?? -1) ? d : worst),
        null
      );
      const diskPct = primaryDisk ? Math.round(primaryDisk.use) : 0;

      // Sum throughput across interfaces, convert bytes/sec to a rough
      // 0-100 "utilization" against a configurable ceiling — adjust
      // NETWORK_CEILING_MBPS to your actual link speed for a meaningful %.
      const NETWORK_CEILING_MBPS = 100; // e.g. 100 Mbps link — change to match your NIC
      const totalBytesPerSec = netStats.reduce((sum, n) => sum + (n.rx_sec || 0) + (n.tx_sec || 0), 0);
      const totalMbps = (totalBytesPerSec * 8) / 1_000_000;
      const networkPct = Math.min(100, Math.round((totalMbps / NETWORK_CEILING_MBPS) * 100));

      const uptimeStr = formatUptime(os.uptime());
      const tempStr = cpuTemp.main != null ? `${Math.round(cpuTemp.main)}°C` : "N/A";

      const data = [
        {
          title: "CPU Usage",
          value: cpuPct,
          status: statusForValue(cpuPct),
          temperature: tempStr,
          uptime: uptimeStr,
        },
        {
          title: "Memory Usage",
          value: memUsedPct,
          status: statusForValue(memUsedPct),
          temperature: tempStr,
          uptime: uptimeStr,
        },
        {
          title: "Disk Usage",
          value: diskPct,
          status: statusForValue(diskPct),
          temperature: tempStr,
          uptime: uptimeStr,
        },
        // {
        //   title: "Network",
        //   value: networkPct,
        //   status: statusForValue(networkPct),
        //   temperature: tempStr,
        //   uptime: uptimeStr,
        // },
      ];

      return reply.send({ success: true, data });

    } catch (err) {
      fastify.log.error("GET /system-health error:", err);
      return reply.code(500).send({ success: false, error: err.message });
    }
  });
}