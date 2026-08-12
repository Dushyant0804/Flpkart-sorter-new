async function healthCheckRoute(fastify, options) {

fastify.get(
  "/v2/facility/:facilityId/installation/:installationId/health",
  async (request, reply) => {
    const { facilityId, installationId } = request.params;

    // Validate settings record exists
    const result = await fastify.pg.query(
      `SELECT facility_id, installation_id
      FROM settings
      WHERE facility_id = $1
        AND installation_id = $2`,
      [facilityId, installationId]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({
        success: false,
        error_response: {
          code: 404,
          reason: "Incorrect parameter",
          message: "Incorrect facilityId and InstallationId",
        },
      });
    }

    const services = {
      postgres: "UNHEALTHY",
      redis: "UNHEALTHY",
      queue_system: "UNHEALTHY",
    };

    let client;

    try {
      // PostgreSQL health check
      client = await request.server.pg.connect();
      await client.query("SELECT 1");
      services.postgres = "HEALTHY";

      // Redis health check
      const redisResponse = await request.server.redis.ping();

      if (redisResponse !== "PONG") {
        throw new Error("Redis ping failed");
      }

      services.redis = "HEALTHY";

      // Queue health check
      const queues = Object.values(request.server.queues || {});

      for (const queue of queues) {
        if (queue && typeof queue.getJobCounts === "function") {
          await queue.getJobCounts();
        }
      }

      services.queue_system = "HEALTHY";

      return reply.code(200).send({
        success: true,
        data: services,
      });
    } catch (err) {
      request.log.error(err);

      let reason = "SERVICE_UNAVAILABLE";

      if (services.postgres === "UNHEALTHY") {
        reason = "POSTGRES_DOWN";
      } else if (services.redis === "UNHEALTHY") {
        reason = "REDIS_DOWN";
      } else if (services.queue_system === "UNHEALTHY") {
        reason = "QUEUE_SYSTEM_DOWN";
      }

      return reply.code(503).send({
        success: false,
        data: services,
        error_response: {
          code: 503,
          reason,
          message: err.message,
        },
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  }
);

}

module.exports = healthCheckRoute;