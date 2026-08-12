// plugins/queues.js
const fp = require("fastify-plugin");
const { Queue } = require("bullmq");
const IORedis = require("ioredis");
const redisConnection = require("../config/redisConnection");
require("dotenv").config();

module.exports = fp(async function queuesPlugin(fastify, opts) {
  const connection = new IORedis({
    host: redisConnection.host,
    port: redisConnection.port,
    maxRetriesPerRequest: null,
  });


  // MAIN SORT QUEUE
  const sortEngineJobOptions = {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 86400, count: 1000 },
  };

// PER-MACHINE SORT QUEUES — har machine_id ke liye alag Queue instance,
  // isolation ke liye. Lazily created on first job for that machine.
  const sortEngineQueuesByMachine = new Map(); // machine_id -> Queue
  try {
    const machineRes = await fastify.pg.query(
      `SELECT DISTINCT machine_id FROM settings WHERE machine_id IS NOT NULL`
    );
    for (const row of machineRes.rows) {
      getSortEngineQueue(row.machine_id);   // force-create, ignore return
    }
    console.log(`🐂 Pre-created ${machineRes.rows.length} per-machine sortEngine queues`);
  } catch (err) {
    console.error("⚠️ Failed to pre-create per-machine sort queues:", err.message);
  }

  function getSortEngineQueue(machine_id) {
    if (!machine_id) {
      throw new Error("getSortEngineQueue- machine_id is required");
    }
    if (!sortEngineQueuesByMachine.has(machine_id)) {
      const queue = new Queue(`sortEngineQueue-${machine_id}`, {
        connection,
        defaultJobOptions: sortEngineJobOptions,
        streams: { events: { maxLen: 1000 } },
      });
      sortEngineQueuesByMachine.set(machine_id, queue);
      console.log(`🐂 Created sortEngineQueue for machine_id=${machine_id}`);
    }
    return sortEngineQueuesByMachine.get(machine_id);
  }
  // CONFIRMATION QUEUE for data deleting
  const confirmSortQueue = new Queue("confirmSortQueue", {
    connection,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: {
        age: 86400, // keep for 24 hours
        count: 1000, // keep up to 1000 jobs
      },
      removeOnFail: {
        age: 86400, // keep for 24 hours
        count: 1000, // keep up to 1000 jobs
      },
    },
    streams: {
      events: {
        maxLen: 1000,
      },
    },
  });


  const chuteMappingQueue  = new Queue("chutemappingqueue", {
    connection,
    defaultJobOptions: {
      attempts: 4,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: {
        age: 86400, // keep for 24 hours
        count: 1000, // keep up to 1000 jobs
      },
      removeOnFail: {
        age: 86400, // keep for 24 hours
        count: 1000, // keep up to 1000 jobs
      },
    },
    streams: {
      events: {
        maxLen: 1000,
      },
    },
  });
  const chuteThresholdQueue  = new Queue("chutethresholdqueue", {
    connection,
    defaultJobOptions: {
      attempts: 4,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: {
        age: 86400, // keep for 24 hours
        count: 1000, // keep up to 1000 jobs
      },
      removeOnFail: {
        age: 86400, // keep for 24 hours
        count: 1000, // keep up to 1000 jobs
      },
    },
    streams: {
      events: {
        maxLen: 1000,
      },
    },
  });
  const bulkDataQueue = new Queue("bulkDataQueue", {
    connection,
    defaultJobOptions: {
      attempts: 4,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: {
        age: 86400, // keep for 24 hours
        count: 1000, // keep up to 1000 jobs
      },
      removeOnFail: {
        age: 86400, // keep for 24 hours
        count: 1000, // keep up to 1000 jobs
      },
    },
    streams: {
      events: {
        maxLen: 1000,
      },
    },
  });

  const dropNotificationQueue = new Queue("dropNotificationQueue", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: {
      age: 86400, // keep for 24 hours
      count: 1000, // keep up to 1000 jobs
    },
    removeOnFail: {
      age: 86400, // keep for 24 hours
      count: 1000, // keep up to 1000 jobs
    },
  },
  streams: {
    events: {
      maxLen: 1000,
    },
  },
});

const bagCloseQueue = new Queue("bagCloseQueue", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: {
      age : 86400,
      count : 1000
    },
    removeOnFail: {
      age: 86400,
      count: 1000
    },
  },
  streams: {
    events: {
      maxLen: 1000,
    },
  },
});


const inductApiQueue = new Queue("inductApiQueue", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  },
  streams: {
    events: {
      maxLen: 1000,
    },
  },
});

const cleanUpQueue = new Queue("data-cleanup", {
connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: 20,
    removeOnFail: 20,
  },
});


  // OPTIONAL DLQ queues (if you want separate queues)
  const sortEngineDLQ = new Queue("sortEngineDLQ", { connection });
  const confirmEngineDLQ = new Queue("confirmEngineDLQ", { connection });

  fastify.decorate("queues", {
    // sortEngineQueue,
    confirmSortQueue,
    chuteMappingQueue,
    sortEngineDLQ,
    confirmEngineDLQ,
    chuteThresholdQueue,
    bulkDataQueue,
    dropNotificationQueue,
    bagCloseQueue,
    inductApiQueue,
    cleanUpQueue
  });
    fastify.decorate("getSortEngineQueue", getSortEngineQueue);
  fastify.decorate("sortEngineQueuesByMachine", sortEngineQueuesByMachine);

  fastify.addHook("onClose", async () => {
    for (const queue of sortEngineQueuesByMachine.values()) {
      try { await queue.close(); } catch (_) {}
    }
  });

  console.log("🐂 BullMQ Queues registered (per-machine sortEngineQueue enabled)");
});
