// server.js (Fastify + Kafka + PostgreSQL)
require("dotenv").config();
const path = require("path");
const { Worker } = require("worker_threads");
const fastify = require("fastify")({ logger: false });
const fastifyCors = require("@fastify/cors");
const fastifyStatic = require("@fastify/static");
const { WebSocketServer } = require("ws");
const fastifyMultipart = require("@fastify/multipart");
const fastifyRedis = require("@fastify/redis");
const { initAllTables } = require("./models");
const cron = require("node-cron");
const logRecorder = require("./utils/logger");
const {publishMetrics} = require("./publishMatrics/publishMetrics")

// ===== Multipart must come BEFORE file upload routes =====
fastify.register(require("@fastify/multipart"), {
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  }
});

fastify.register(fastifyRedis, {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT || 6379,
});

// ────────────────────────────────────────────────────────────────────────────
// Machine list -- add/remove machine ids here only.
// Used to build the explicit per-machine websocket paths below.
// ────────────────────────────────────────────────────────────────────────────
const MACHINE_IDS = ["m01", "m02", "m03", "m04","m05"];

const BIN_DATA_PATHS     = MACHINE_IDS.map((m) => `/bin-data-${m}`);
const CONFIRMATION_PATHS = MACHINE_IDS.map((m) => `/confirmation-${m}`);
const SORT_RESULT_PATHS  = MACHINE_IDS.map((m) => `/sort-result-${m}`);

// ────────────────────────────────────────────────────────────────────────────
// sort-result clients -- per machine.
// Node-RED only listens on /sort-result-<machine_id> and never sends a
// message back, so the CONNECTION PATH is the only way to know which
// machine a given socket belongs to -- hence machine_id is taken from the
// path for GROUPING purposes only.
//
// When a job actually finishes in sortEngineWorker.js, the result object it
// builds (buildResult()) already carries machine_id -- broadcastSortResult()
// uses THAT machine_id (from the data, not the path) to pick which group of
// sockets to send to.
// ────────────────────────────────────────────────────────────────────────────
const sortResultClientsByMachine = new Map(); // machine_id -> Set<ws>

function getSortResultClientSet(machine_id) {
  if (!sortResultClientsByMachine.has(machine_id)) {
    sortResultClientsByMachine.set(machine_id, new Set());
  }
  return sortResultClientsByMachine.get(machine_id);
}

// Broadcast helper -- routes ONLY to the /sort-result-<machine_id> group
// that matches result.machine_id (comes from the job data, not the path).
fastify.decorate("broadcastSortResult", (result) => {
  const machine_id = result?.machine_id;
  if (!machine_id) {
    logRecorder.info({ message: "⚠️ broadcastSortResult called without machine_id -- cannot route", event: "sort result", data: result });
    return;
  }
  logRecorder.info({ message: "broadcast Sort Result", event: "sort result", data: JSON.stringify(result) });
  const msg = JSON.stringify(result);
  const clients = sortResultClientsByMachine.get(machine_id);
  if (!clients || clients.size === 0) return; // no listener connected for this machine right now
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(msg);
  }
});


// ===== Register Queue + Worker =====
fastify.register(require("./plugins/queues"));
// workers
fastify.register(require("./plugins/sortEngineWorker"));
fastify.register(require("./plugins/confirmSortWorker"));
// fastify.register(require("./plugins/operatorAuthWorker"));
fastify.register(require("./plugins/Chutemappingworker"));
fastify.register(require("./plugins/Chutethresholdworker"));
fastify.register(require("./plugins/Bulkdataworker"));
fastify.register(require("./plugins/Bagcloseworker"));
fastify.register(require("./plugins/inductApiWorker"));
fastify.register(require("./plugins/dropNotificationWorker"));
fastify.register(require("./plugins/cleanUpWorker"));


// ===== Routes =====
const userRoutes = require("./routes/userRoutes");
const settingsRoutes = require("./routes/settings");
const bagSensorsRoutes = require("./routes/bagSensors");
const bagLayoutRoutes = require("./routes/bagLayoutRoutes");
const sortedParcelRoutes = require("./routes/sortedParcelRoutes");
const activeParcelRoutes = require("./routes/activeParcelRoutes");
const bagsealEventsRoutes = require("./routes/bagsealEventsRoutes");
const parcelRoutes = require("./routes/parcelRoutes");
const alarmHistoryRoutes = require("./routes/alarmHistoryRoutes");

const chuteThresholdRoutes = require('./routes/chuteThresholdRoutes');
const chuteClosingConfigRoutes = require('./routes/chuteClosingConfigRoutes');
const labelConfigRoutes = require('./routes/Labelconfigroutes');
const bulkDataRoutes = require('./routes/bulkDataroutes');
const tokenManager = require("./config/tokenManager");
const chuteStatusRoutes = require('./routes/chuteStatusRoutes');
const bagCloseRoutes = require("./routes/bagCloseRoutes");
const removeFromContainerRoutes = require("./routes/removeFromContainerRoutes");
const chuteMappingsRoutes = require("./routes/chuteMappings");
const sortedBulkDataRoutes = require("./routes/sortedBulkDataRoutes");
const healthCheckRoute = require("./routes/healthCheckRoutes")


const { FastifyAdapter } = require("@bull-board/fastify");


// ===== PostgreSQL Connection =====
const pool = require("./config/pgConnection");
// Test DB
(async () => {
  try {
    const res = await pool.query("SELECT current_database(), current_user;");
    logRecorder.info({ message: "postgres connected", event: "database" })
  } catch (err) {
    logRecorder.info({ message: "PostgreSQL connection failed", data: { error: err.message } });
  }
})();

// Initialize all tables
(async () => {
  try {
    await initAllTables(pool);
    await tokenManager.init(pool);
    await tokenManager.getValidToken();
    logRecorder.info({ message: "All table initialized", event: "table initialization" })
    logRecorder.info({ message: "receiving token", event: "token" })
  } catch (err) {
    logRecorder.info({ message: "Failed to initialized table", event: "table initialization failed", err: err.message })
  }
})();

fastify.decorate("pg", pool);


// ======================================================
// Rebuild Alarm State On Server Start
// ======================================================
async function resolveStaleAlarms() {
  const client = await fastify.pg.connect();
  try {
    const result = await client.query(`
      UPDATE alarm_history
      SET
        resolved_at      = NOW(),
        duration_seconds = EXTRACT(EPOCH FROM (NOW() - arrived_at))::INTEGER
      WHERE resolved_at IS NULL
    `);
    if (result.rowCount > 0) {
      logRecorder.info({ message: "resolved alarm", event: "resolve", data: result.rowCount })
    }
  } catch (err) {
    logRecorder.info({ message: "error in resolved alarm", event: "resolve", err: err.message })
  } finally {
    client.release();
  }
}


// ===== Register REST Routes =====
fastify.register(userRoutes, { prefix: "/api/users" });
fastify.register(settingsRoutes, { prefix: "/api/settings" });
fastify.register(bagSensorsRoutes, { prefix: "/api" });
fastify.register(bagLayoutRoutes, { prefix: "/api" });
fastify.register(sortedParcelRoutes, { prefix: "/api" });
fastify.register(activeParcelRoutes, { prefix: "/api" });
fastify.register(bagsealEventsRoutes, { prefix: "/api" });
fastify.register(parcelRoutes, { prefix: "/api" });
fastify.register(alarmHistoryRoutes, { prefix: "/api" });
fastify.register(sortedBulkDataRoutes, { prefix: "/api" });
fastify.register(chuteThresholdRoutes);
fastify.register(chuteClosingConfigRoutes);
fastify.register(labelConfigRoutes);
fastify.register(bulkDataRoutes);
fastify.register(chuteStatusRoutes);
fastify.register(bagCloseRoutes);
fastify.register(removeFromContainerRoutes);
fastify.register(chuteMappingsRoutes);
fastify.register(healthCheckRoute);


let cachedSettings = {
  live_fetching: false,
  calibration_wbn: null
};
let lastSettingsLoad = 0;

async function getCachedSettings() {
  const now = Date.now();
  if (now - lastSettingsLoad > 5000) {
    const res = await fastify.pg.query(
      "SELECT live_fetching, calibration_wbn FROM settings WHERE id = 1"
    );
    cachedSettings = res.rows[0] || {
      live_fetching: false,
      calibration_wbn: null
    };
    lastSettingsLoad = now;
  }
  return cachedSettings;
}

// ======================================================
// 5) WebSocket Setup (FIXED for Fastify)
// ======================================================
const server = fastify.server;
const wss = new WebSocketServer({ noServer: true });

const PING_INTERVAL = 30000; // 30 seconds

function heartbeat() {
  this.isAlive = true;
}

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", heartbeat);
});

const wsPingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log("WS terminated (no pong)");
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, PING_INTERVAL);

// Connected clients -- bin-data / confirmation-data don't need per-machine
// tracking (machine_id already comes inside each JSON message they send).
const binClients = new Set();
const confirmationClients = new Set();

const machineStatusClients = new Set();
const alarmState = new Map();

// Upgrade handler -- explicit per-machine paths allowed through
server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(
    request.url,
    `http://${request.headers.host}`
  ).pathname;

  const isKnownPath =
    BIN_DATA_PATHS.includes(pathname) ||
    CONFIRMATION_PATHS.includes(pathname) ||
    SORT_RESULT_PATHS.includes(pathname) ||
    pathname === "/bag-sensors" ||
    pathname === "/machine-status";

  if (isKnownPath) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});


// ======================================================
// 6) WebSocket Routing
// ======================================================
wss.on("connection", async (ws, req) => {
  const wsPath = new URL(req.url, `http://${req.headers.host}`).pathname;

  // ----------------------------------------------------
  // BIN DATA WS -- explicit per-machine paths (/bin-data-m01 ... m10)
  // machine_id comes from the JSON payload, NOT the path.
  // ----------------------------------------------------
  if (BIN_DATA_PATHS.includes(wsPath)) {
    logRecorder.info({ message: "bin data web socket connected", event: "bin-data web socket", data: { path: wsPath } });
    binClients.add(ws);

    ws.on("message", async (msg) => {
      try {
        const data = JSON.parse(msg);
        if (data?.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        }
        logRecorder.info({ message: "parcel scanned", event: "scan parcel", data });

        const {
          id,
          wbn,
          length,
          width,
          height,
          weight,
          Volume,
          RealVolume,
          mode,
          machine_id   // from JSON payload
        } = data;

        if (!wbn) return;

        if (!machine_id) {
          logRecorder.info({ message: "⚠️ bin-data event missing machine_id", event: "bin-data", data: { wbn, id } });
          ws.send(JSON.stringify({ error: true, message: "machine_id missing" }));
          return;
        }

        // ------------------------------------------------
        // DB INSERT -- machine_id column added
        // ------------------------------------------------
        const client = await fastify.pg.connect();
        try {
          await client.query(
            `INSERT INTO primary_bin_data
             (wbn, length, width, height, weight, volume, real_volume, mode, infeed, machine_id, scantime)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, Now())`,
            [wbn, length, width, height, weight, Volume, RealVolume, mode, id, machine_id]
          );
        } finally {
          client.release();
        }

        logRecorder.info({ message: "parcel data insert(primary_bin_data)", event: "insert", data: { wbn, id, machine_id } });

        // ➤ Push sorting job -- routed to THIS machine's own queue
        await fastify.getSortEngineQueue(machine_id).add("shipSort", {
          id,
          wbn,
          machine_id
        });
        logRecorder.info({ message: "Sorting job queued", event: "queued job", data: { wbn, id, machine_id } });

      } catch (err) {
        ws.send(JSON.stringify({ error: true, message: err.message }));
        logRecorder.info({ message: "error to bin-data web-socket connection", event: "bin-data", err: err.message });
      }
    });

    ws.on("close", () => {
      logRecorder.info({ message: "close web-socket connection", event: "bin-data" });
      binClients.delete(ws);
    });

    return;
  }

  // ----------------------------------------------------
  // SORT RESULT WS -- explicit per-machine paths (/sort-result-m01 ... m10)
  // Node-RED only listens (never sends a message back), so the connection
  // path is the only way to know which machine's group this socket
  // belongs to. Routing at broadcast time uses result.machine_id instead
  // (from sortEngineWorker's buildResult()), never the path.
  // ----------------------------------------------------
  if (SORT_RESULT_PATHS.includes(wsPath)) {
    const machine_id = wsPath.replace("/sort-result-", ""); // grouping key only

    logRecorder.info({ message: "sort-result web socket connected", event: "/sort-result", data: { machine_id } });

    const clientSet = getSortResultClientSet(machine_id);
    clientSet.add(ws);

    ws.on("close", () => {
      clientSet.delete(ws);
      if (clientSet.size === 0) sortResultClientsByMachine.delete(machine_id);
      logRecorder.info({ message: "sort-result web socket closed", event: "/sort-result", data: { machine_id } });
    });

    return;
  }

  // ----------------------------------------------------
  // CONFIRMATION WS -- explicit per-machine paths (/confirmation-data-m01 ... m10)
  // machine_id comes from the JSON payload, NOT the path.
  // ----------------------------------------------------
  if (CONFIRMATION_PATHS.includes(wsPath)) {
    logRecorder.info({ message: "confirmation web socket connected", event: "/confirmation-data", data: { path: wsPath } });
    confirmationClients.add(ws);

    ws.on("message", async (msg) => {
      try {
        const data = JSON.parse(msg);
        logRecorder.info({ message: "received confirmation", event: "/confirmation-data", data });

        const id = data.id;
        const wbn = data.wbn;
        const sort = data.sort;
        const item_id = data.item_id;
        const chute_id = data.chute_id;
        const status = data.status;
        const reason = data.reason;
        const machine_id = data.machine_id;   // from JSON payload

        if (!wbn) {
          console.warn("Received confirmation without WBN:", data);
          return;
        }
        if (!machine_id) {
          logRecorder.info({ message: "⚠️ confirmation event missing machine_id", event: "/confirmation-data", data: { wbn, item_id } });
          ws.send(JSON.stringify({ id, wbn, status: "MACHINE_ID_MISSING" }));
          return;
        }
        // ONLY handle 'success'
        if (sort == "reject") {
          ws.send(JSON.stringify({ id, wbn, status: "CONFIRM_IGNORED" }));
          return;
        }
        if (!item_id || !chute_id) {
          console.warn("Missing item_id or chute_id in confirmation:", data);
          ws.send(JSON.stringify({ id, wbn, status: "NO_ITEM_ID_OR_CHUTE_ID" }));
          return;
        }

        await fastify.queues.dropNotificationQueue.add("dropNotification", {
          wbn,
          item_id,
          chute_id,
          status,
          reason,
          machine_id
        });

        await fastify.queues.confirmSortQueue.add("confirm", {
          id,
          wbn,
          item_id,
          chute_id,
          sort,                       // "success"
          status: data.status || null,
          reason: data.reason || null,
          machine_id
        });

        ws.send(JSON.stringify({ id, wbn, status: "CONFIRM_QUEUED" }));
      } catch (err) {
        console.error("confirmation WS error:", err);
      }
    });

    ws.on("close", () => confirmationClients.delete(ws));
    return;
  }

  // ----------------------------------------------------
  // MACHINE STATUS WS (ALARMS + HISTORY) -- UNCHANGED, not per-machine
  // ----------------------------------------------------
  if (wsPath === "/machine-status") {
    logRecorder.info({ message: "machine status web socket connected", event: "/machine-status" })
    machineStatusClients.add(ws);

    if (alarmState.size > 0) {
      const snapshot = {};
      alarmState.forEach((val, key) => { snapshot[key] = val; });
      ws.send(JSON.stringify({
        type: "ALARM_UPDATE",
        data: snapshot,
        time: new Date().toISOString(),
      }));
      logRecorder.info({ message: `Sent alarm snapshot (${alarmState.size} codes) to new client`, event: "/machine-status" })
    }

    ws.on("message", async (msg) => {
      try {
        const data = JSON.parse(msg);

        if (data?.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        }

        const alarmDictionary = require("./config/alarmDictionary");
        const client = await fastify.pg.connect();

        try {
          for (const code in data) {
            const newState = Number(data[code]);
            const oldState = alarmState.get(code) || 0;

            // ARRIVED
            if (oldState === 0 && newState === 1) {
              const message = alarmDictionary[code]?.message || "UNKNOWN";
              await client.query(
                `INSERT INTO alarm_history (code, message, arrived_at)
                 VALUES ($1, $2, NOW())`,
                [code, message]
              );
              logRecorder.info({ message: `Alarm Arrived: ${code}`, event: "/machine-status" })
            }

            // RESOLVED
            if (oldState === 1 && newState === 0) {
              await client.query(
                `UPDATE alarm_history
                 SET
                   resolved_at      = NOW(),
                   duration_seconds = EXTRACT(EPOCH FROM (NOW() - arrived_at))::INTEGER
                 WHERE code = $1
                 AND resolved_at IS NULL`,
                [code]
              );
              logRecorder.info({ message: `Alarm Resolved: ${code}`, event: "/machine-status" })
            }

            alarmState.set(code, newState);
          }
        } finally {
          client.release();
        }

        const payload = JSON.stringify({
          type: "ALARM_UPDATE",
          data,
          time: new Date().toISOString(),
        });

        machineStatusClients.forEach((c) => {
          if (c.readyState === 1) c.send(payload);
        });

      } catch (err) {
        logRecorder.info({ message: `❌ /machine-status WS error`, event: "/machine-status", err })
      }
    });

    ws.on("close", () => {
      logRecorder.info({ message: `❌ WS Closed: /machine-status`, event: "/machine-status" })
      machineStatusClients.delete(ws);
    });

    return;
  }

  // ----------------------------------------------------
  // BAG SENSORS WS -- UNCHANGED, not per-machine
  // ----------------------------------------------------
if (wsPath === "/bag-sensors") {
  logRecorder.info({ message: `WS Connected: /bag-sensors`, event: "/bag-sensors" });

  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg); // Data e.g., { btn1: 1, snr1: 0, machine_id: 1 }
      const machineId = data.machine_id;

      if (!machineId) {
        ws.send(JSON.stringify({ error: "Missing machine_id in payload" }));
        return;
      }

      // Payload se saare chute_id aur unki values extracted karein
      const chuteIds = [];
      const values = [];

      // btn1..btn100 aur snr1..snr100 check karein
      for (let i = 1; i <= 100; i++) {
        const btnKey = `btn${i}`;
        const snrKey = `snr${i}`;

        if (btnKey in data) {
          chuteIds.push(btnKey);
          values.push(data[btnKey] ?? 0);
        }
        if (snrKey in data) {
          chuteIds.push(snrKey);
          values.push(data[snrKey] ?? 0);
        }
      }

      if (chuteIds.length === 0) {
        ws.send(JSON.stringify({ status: "NO_DATA_TO_UPDATE" }));
        return;
      }

      const client = await fastify.pg.connect();

      try {
        await client.query("BEGIN");

        // Single Bulk Update Query using unnest()
        const updateQuery = `
          UPDATE bag_sensors AS b
          SET value = v.val::integer, updated_at = NOW()
          FROM (
            SELECT unnest($1::text[]) AS chute_id, unnest($2::integer[]) AS val
          ) AS v
          WHERE b.chute_id = v.chute_id 
            AND b.machine_id = $3
        `;

        await client.query(updateQuery, [chuteIds, values, machineId]);
        await client.query("COMMIT");

        ws.send(JSON.stringify({ status: "UPDATED" }));
      } catch (err) {
        await client.query("ROLLBACK");
        console.error("DB Update Error:", err);
        ws.send(JSON.stringify({ error: err.message }));
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("bag-sensors WS error:", err);
      logRecorder.info({ message: `bag-sensors WS error:`, event: " /bag-sensors", err });
    }
  });

  ws.on("close", () => logRecorder.info({ message: `WS Closed: /bag-sensors`, event: " /bag-sensors" }));
  return;
}
});


fastify.get("/debug/queues", (req, reply) => {
  return reply.send({ queues: fastify.queues });
});

const serverAdapter = new FastifyAdapter();

fastify.after(() => {
  const { createBullBoard } = require("@bull-board/api");
  const { BullMQAdapter } = require("@bull-board/api/bullMQAdapter");

  if (!fastify.queues) {
    fastify.log.error("❌ Queues not registered, Bull Board disabled");
    return;
  }

  const {
    sortEngineDLQ,
    confirmEngineDLQ,
    confirmSortQueue,
    chuteMappingQueue,
    dropNotificationQueue,
    bagCloseQueue,
    inductApiQueue,
    cleanUpQueue
  } = fastify.queues;   // sortEngineQueue removed -- it no longer exists as a single queue

  // Per-machine sort queues -- pulled from the Map exposed by plugins/queues.js
  const sortEngineAdapters = [...fastify.sortEngineQueuesByMachine.values()]
    .map((q) => new BullMQAdapter(q));

  createBullBoard({
    queues: [
      ...sortEngineAdapters,
      new BullMQAdapter(sortEngineDLQ),
      new BullMQAdapter(confirmEngineDLQ),
      new BullMQAdapter(confirmSortQueue),
      new BullMQAdapter(chuteMappingQueue),
      new BullMQAdapter(dropNotificationQueue),
      new BullMQAdapter(bagCloseQueue),
      new BullMQAdapter(inductApiQueue),
      new BullMQAdapter(cleanUpQueue),
    ],
    serverAdapter,
  });

  fastify.register(serverAdapter.registerPlugin(), {
    prefix: "/admin/queues", // Dashboard URL
  });

  fastify.log.info("📊 Bull Board running at /admin/queues");
});

// ===== CORS =====
fastify.register(fastifyCors, {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
});

fastify.register(require("@fastify/static"), {
  root: path.join(process.cwd(), "configfiles"),
  prefix: "/config-files/",
  decorateReply: false
});

fastify.register(require("@fastify/static"), {
  root: path.join(__dirname, "uploads"),
  prefix: "/uploads/",
  decorateReply: false
});

// ===== Static Frontend Build =====
fastify.register(fastifyStatic, {
  root: path.join(__dirname, "../wms-frontend/build"),
  prefix: "/",
});

// ===== Fallback to SPA =====
fastify.setNotFoundHandler((req, reply) => {
  reply.sendFile("index.html");
});

// scheduler to delete data before 14 days from today
cron.schedule("* 2,12,16 * * *", async () => {
  try {
    await fastify.queues.cleanUpQueue.add(
      "daily-cleanup",
      {},
      {
        jobId: `daily-cleanup-${Date.now()}`, // unique job ID
      }
    );

    logRecorder.error({message : "Cleanup job scheduled",time : new Date()})
  } catch (err) {
    console.error(err);
  }
});
fastify.ready(async (err) => {
  if (err) throw err;

  setInterval(async () => {
    try {
      await publishMetrics(fastify);
    } catch (err) {
      fastify.log.error(err);
      console.log(err)
    }
  }, 60 * 1000);
});
// ===== Start Server =====
fastify.listen({ port: 5001, host: "0.0.0.0" }, async (err, addr) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`🚀 Server running at ${addr}`);
  await resolveStaleAlarms();
});

fastify.addHook("onClose", (instance, done) => {
  clearInterval(wsPingInterval);
  done();
});