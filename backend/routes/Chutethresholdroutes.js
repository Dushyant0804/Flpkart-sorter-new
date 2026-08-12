

const API_KEY = "mechintsorter";

async function validateRequest(req, reply, fastify) {
  // ── API key ───────────────────────────────────────────────────────────
  // if (req.headers["x-api-key"] !== API_KEY) {
  //   reply.code(401).send({
  //     success: false,
  //     error_response: {
  //       code: 401,
  //       reason: "UNAUTHORIZED",
  //       message: "Invalid or missing x-api-key header",
  //     },
  //   });
  //   return false;
  // }


  const { facilityId, installationId } = req.params;
  try {
    const result = await fastify.pg.query(
      `SELECT "facilityId", "installationId" FROM settings WHERE id = 1`
    );

    if (result.rows.length === 0) {
      reply.code(500).send({
        success: false,
        error_response: {
          code: 500,
          reason: "SETTINGS_NOT_FOUND",
          message: "Settings row not found in database",
        },
      });
      return false;
    }

    const settings = result.rows[0];

    if (facilityId !== settings.facilityId) {
      reply.code(400).send({
        success: false,
        error_response: {
          code: 400,
          reason: "INVALID_FACILITY_ID",
          message: `facilityId '${facilityId}' does not match configured value`,
        },
      });
      return false;
    }

    if (installationId !== settings.installationId) {
      reply.code(400).send({
        success: false,
        error_response: {
          code: 400,
          reason: "INVALID_INSTALLATION_ID",
          message: `installationId '${installationId}' does not match configured value`,
        },
      });
      return false;
    }
  } catch (err) {
    fastify.log.error("❌ Settings validation error:", err.message);
    reply.code(500).send({
      success: false,
      error_response: {
        code: 500,
        reason: "SETTINGS_QUERY_ERROR",
        message: err.message,
      },
    });
    return false;
  }

  return true;
}

function validateThreshold(closing_threshold) {
  if (!closing_threshold || typeof closing_threshold !== "object") {
    return "'closing_threshold' is required";
  }
  if (
    closing_threshold.max_weight == null &&
    closing_threshold.max_volume == null &&
    closing_threshold.max_items == null
  ) {
    return "'closing_threshold' must have at least one of max_weight, max_volume, max_items";
  }
  return null;
}

async function chuteThresholdRoutes(fastify) {

  fastify.put(
    "/api/v2/facility/:facilityId/installation/:installationId/applyChuteConfigForAll",
    async (req, reply) => {
      const valid = await validateRequest(req, reply, fastify);
      if (!valid) return;

      const { closing_threshold, type } = req.body || {};

      const thresholdError = validateThreshold(closing_threshold);
      if (thresholdError) {
        return reply.code(400).send({
          success: false,
          error_response: {
            code: 400,
            reason: "INVALID_PAYLOAD",
            message: thresholdError,
          },
        });
      }

      try {
        await fastify.queues.chuteThresholdQueue.add("upsertChuteThreshold", {
          scope: "ALL",           
          chute_ids: null,
          closing_threshold,
          type: type ?? null,
        });

        return reply.code(200).send({ success: true });
      } catch (err) {
        fastify.log.error("applyChuteConfigForAll enqueue error:", err.message);
        return reply.code(500).send({
          success: false,
          error_response: {
            code: 500,
            reason: "QUEUE_ERROR",
            message: err.message,
          },
        });
      }
    }
  );

  fastify.put(
    "/api/v2/facility/:facilityId/installation/:installationId/applyChuteConfig",
    async (req, reply) => {
      const valid = await validateRequest(req, reply, fastify);
      if (!valid) return;

      const { chute_ids, closing_threshold, type } = req.body || {};

      if (!Array.isArray(chute_ids) || chute_ids.length === 0) {
        return reply.code(400).send({
          success: false,
          error_response: {
            code: 400,
            reason: "INVALID_PAYLOAD",
            message: "'chute_ids' must be a non-empty array",
          },
        });
      }

      const thresholdError = validateThreshold(closing_threshold);
      if (thresholdError) {
        return reply.code(400).send({
          success: false,
          error_response: {
            code: 400,
            reason: "INVALID_PAYLOAD",
            message: thresholdError,
          },
        });
      }

      try {
        await fastify.queues.chuteThresholdQueue.add("upsertChuteThreshold", {
          scope: "SPECIFIC",      
          chute_ids,
          closing_threshold,
          type: type ?? null,
        });

        return reply.code(200).send({ success: true });
      } catch (err) {
        fastify.log.error("applyChuteConfig enqueue error:", err.message);
        return reply.code(500).send({
          success: false,
          error_response: {
            code: 500,
            reason: "QUEUE_ERROR",
            message: err.message,
          },
        });
      }
    }
  );
}

module.exports = chuteThresholdRoutes;