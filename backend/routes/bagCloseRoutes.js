// routes/bagCloseRoutes.js
//
// PUT /v2/facility/:facilityId/installation/:installationId/chuteStatus
//
// FK sends chute_ids to close → enqueue to bagCloseQueue → respond success/failure

const API_KEY = "mechintsorter";
const logRecorder = require("../utils/logger");

async function bagCloseRoutes(fastify) {
  fastify.put(
    "/v2/facility/:facilityId/installation/:installationId/chuteStatus",
    async (req, reply) => {
      // ── 1. API key check ────────────────────────────────────────────
      // if (req.headers["x-api-key"] !== API_KEY) {
      //   return reply.code(401).send({
      //     success: false,
      //     error_response: {
      //       code: 401,
      //       reason: "UNAUTHORIZED",
      //       message: "Invalid or missing x-api-key header",
      //     },
      //   });
      // }

      // ── 2. Validate facilityId + installationId ─────────────────────
      const { facilityId, installationId } = req.params;
       let machine_id;
      try {
         const result = await fastify.pg.query(
          `SELECT machine_id FROM settings WHERE facility_id = $1 AND installation_id = $2`,
          [facilityId, installationId]
        );
        if (result.rows.length === 0) {
          return reply.code(400).send({
            success: false,
            error_response: {
              code: 400,
              reason: "MACHINE_NOT_FOUND",
              message: `No machine found for facilityId '${facilityId}' and installationId '${installationId}'`,
            },
          });
        }

      machine_id = result.rows[0].machine_id;
      } catch (err) {
        // fastify.log.error("❌ Settings validation error:", err.message);
        logRecorder.bagLogger.info({ message: "Settings validation failed", event: "bag-close-route(settings-validation-failed)", data: { facilityId, installationId, error: err.message } });
        return reply.code(500).send({
          success: false,
          error_response: { code: 500, reason: "SETTINGS_QUERY_ERROR", message: err.message },
        });
      }

      // ── 3. Validate payload ─────────────────────────────────────────
      const { chute_ids } = req.body || {};
      logRecorder.bagLogger.info({ message: "Bag close request received", event: "bag-close-route(request-received)", data: { facilityId, installationId, chute_ids } });

      if (!Array.isArray(chute_ids) || chute_ids.length === 0) {
        logRecorder.bagLogger.info({ message: "Invalid bag close payload", event: "bag-close-route(invalid-payload)", data: { facilityId, installationId, chute_ids } });
        return reply.code(400).send({
          success: false,
          error_response: {
            code: 400,
            reason: "INVALID_PAYLOAD",
            message: "'chute_ids' must be a non-empty array",
          },
        });
      }

      // ── 4. Enqueue bag close job ────────────────────────────────────
      try {
        await fastify.queues.bagCloseQueue.add("bagClose", {
          chute_ids,
          request_payload: req.body,
          machine_id
        });
        logRecorder.bagLogger.info({ message: "Bag close job queued successfully", event: "bag-close-route(job-queued)", data: { facilityId, installationId, chute_ids } });
        return reply.code(200).send({ success: true });
      } catch (err) {
        // fastify.log.error("❌ bagClose enqueue error:", err.message);
        logRecorder.bagLogger.info({ message: "Failed to enqueue bag close job", event: "bag-close-route(queue-failed)", data: { facilityId, installationId, chute_ids, error: err.message } });
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

module.exports = bagCloseRoutes;