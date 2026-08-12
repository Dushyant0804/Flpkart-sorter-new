const API_KEY = "mechintsorter";
const logRecorder = require("../utils/logger")
async function bulkDataRoutes(fastify) {
  fastify.post(
    "/v2/facility/:facilityId/installation/:installationId/sortationDetails",
    async (req, reply) => {
      // ── 1. API key check ──────────────────────────────────────────────
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

      // ── 2. Validate facilityId + installationId ───────────────────────
      const { facilityId, installationId } = req.params;
      try {
        const result = await fastify.pg.query(
          `SELECT facility_id, installation_id FROM settings WHERE id = 1`
        );

        if (result.rows.length === 0) {
          return reply.code(500).send({
            success: false,
            error_response: {
              code: 500,
              reason: "SETTINGS_NOT_FOUND",
              message: "Settings row not found in database",
            },
          });
        }

        const settings = result.rows[0];

        if (facilityId !== settings.facility_id) {
          return reply.code(400).send({
            success: false,
            error_response: {
              code: 400,
              reason: "INVALID_FACILITY_ID",
              message: `facilityId '${facilityId}' does not match configured value`,
            },
          });
        }

        if (installationId !== settings.installation_id) {
          return reply.code(400).send({
            success: false,
            error_response: {
              code: 400,
              reason: "INVALID_INSTALLATION_ID",
              message: `installationId '${installationId}' does not match configured value`,
            },
          });
        }
      } catch (err) {
        // fastify.log.error("Settings validation error:", err.message);
        logRecorder.bulkDataLogger.info({ message: "Settings validation failed", event: "bulk-data-route(settings-validation-failed)", data: { facilityId, installationId, error: err.message } });
        return reply.code(500).send({
          success: false,
          error_response: {
            code: 500,
            reason: "SETTINGS_QUERY_ERROR",
            message: err.message,
          },
        });
      }

      // ── 3. Validate payload ───────────────────────────────────────────
      const { sortation_data_list } = req.body || {};

      if (!Array.isArray(sortation_data_list) || sortation_data_list.length === 0) {
        return reply.code(400).send({
          success: false,
          error_response: {
            code: 400,
            reason: "INVALID_PAYLOAD",
            message: "'sortation_data_list' must be a non-empty array",
          },
        });
      }

      // ── 4. Validate each item individually, build response ───────────
      const responses = [];
      const validItems = [];

      for (const entry of sortation_data_list) {
        const item_id = entry?.item?.item_id;

        if (!item_id) {
          responses.push({
            item_id: null,
            success: false,
            error_response: {
              code: 400,
              reason: "MISSING_ITEM_ID",
              message: "item.item_id is required",
            },
          });
          continue;
        }

        if (!Array.isArray(entry.sort_code) || entry.sort_code.length === 0) {
          responses.push({
            item_id,
            success: false,
            error_response: {
              code: 400,
              reason: "MISSING_SORT_CODE",
              message: `sort_code is required and must be a non-empty array for item_id '${item_id}'`,
            },
          });
          continue;
        }

        if (!entry.timestamp || typeof entry.timestamp !== "number") {
          responses.push({
            item_id,
            success: false,
            error_response: {
              code: 400,
              reason: "MISSING_TIMESTAMP",
              message: `timestamp is required and must be a number for item_id '${item_id}'`,
            },
          });
          continue;
        }

        // Valid item — mark success and collect for queue
        responses.push({ item_id, success: true });
        validItems.push({
          item_id,
          labels:    entry.item.labels    ?? [],
          type:      entry.item.type      ?? null,
          sort_code: entry.sort_code,
          timestamp: entry.timestamp,
        });
      }

      // ── 5. Enqueue valid items as a single job ────────────────────────
      if (validItems.length > 0) {
        try {
          await fastify.queues.bulkDataQueue.add("upsertBulkData", {
            items: validItems,
          });
        } catch (err) {
          // fastify.log.error("❌ bulkData enqueue error:", err.message);
           logRecorder.bulkDataLogger.info( {message : "Bulk data queue enqueue failed",
            error: err.message,
          });
          // Mark all valid items as failed in response since we couldn't enqueue
          for (const res of responses) {
            if (res.success === true) {
              res.success = false;
              res.error_response = {
                code: 500,
                reason: "QUEUE_ERROR",
                message: err.message,
              };
            }
          }
        }
      }

      return reply.code(200).send({ sortation_data_responses: responses });
    }
  );
}

module.exports = bulkDataRoutes;