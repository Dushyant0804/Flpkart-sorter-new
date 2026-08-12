// routes/chuteClosingConfigRoutes.js

const API_KEY = "mechintsorter";

async function chuteClosingConfigRoutes(fastify) {
  fastify.get(
    "/api/v2/facility/:facilityId/installation/:installationId/chuteClosingConfig",
    async (req, reply) => {
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

      const { facilityId, installationId } = req.params;
      try {
        const result = await fastify.pg.query(
          `SELECT "facilityId", "installationId" FROM settings WHERE id = 1`
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

        if (facilityId !== settings.facilityId) {
          return reply.code(400).send({
            success: false,
            error_response: {
              code: 400,
              reason: "INVALID_FACILITY_ID",
              message: `facilityId '${facilityId}' does not match configured value`,
            },
          });
        }

        if (installationId !== settings.installationId) {
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
        fastify.log.error("❌ Settings validation error:", err.message);
        return reply.code(500).send({
          success: false,
          error_response: {
            code: 500,
            reason: "SETTINGS_QUERY_ERROR",
            message: err.message,
          },
        });
      }

      const { chuteIds } = req.query;

      if (!chuteIds || chuteIds.trim() === "") {
        return reply.code(400).send({
          success: false,
          error_response: {
            code: 400,
            reason: "MISSING_CHUTE_IDS",
            message: "'chuteIds' query param is required (comma separated)",
          },
        });
      }

      const chuteIdList = chuteIds
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);

      if (chuteIdList.length === 0) {
        return reply.code(400).send({
          success: false,
          error_response: {
            code: 400,
            reason: "INVALID_CHUTE_IDS",
            message: "'chuteIds' must contain at least one valid id",
          },
        });
      }
      try {
        const placeholders = chuteIdList.map((_, i) => `$${i + 1}`).join(", ");
        const result = await fastify.pg.query(
          `SELECT chute_id, max_weight, max_volume, max_items, type
           FROM chute_thresholds
           WHERE chute_id IN (${placeholders})`,
          chuteIdList
        );
        const response = {};
        for (const row of result.rows) {
          response[row.chute_id] = {
            closing_threshold: {
              max_weight: row.max_weight,
              max_volume: row.max_volume,
              max_items:  row.max_items,
            },
            type: row.type,
          };
        }

        for (const id of chuteIdList) {
          if (!response[id]) {
            response[id] = null; 
          }
        }

        return reply.code(200).send(response);
      } catch (err) {
        fastify.log.error("chuteClosingConfig query error:", err.message);
        return reply.code(500).send({
          success: false,
          error_response: {
            code: 500,
            reason: "DB_QUERY_ERROR",
            message: err.message,
          },
        });
      }
    }
  );
}

module.exports = chuteClosingConfigRoutes;