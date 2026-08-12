// routes/configFileUpdate.js

const API_KEY = "mechintsorter";

async function chuteMappingsRoutes(fastify) {
  fastify.post(
    "/v2/facility/:facilityId/installation/:installationId/configFileUpdate",
    async (req, reply) => {
      // ── 1. API key check ──────────────────────────────────────────────
      // const apiKey = req.headers["x-api-key"];
      // if (apiKey !== API_KEY) {
      //   return reply.code(401).send({
      //     success: false,
      //     error_response: {
      //       code: 401,
      //       reason: "UNAUTHORIZED",
      //       message: "Invalid or missing x-api-key header",
      //     },
      //   });
      // }

      // ── 2. Resolve machine_id from facilityId + installationId ─────────
      // settings now has ONE ROW PER MACHINE — find which machine this
      // facility/installation combination belongs to.
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
        fastify.log.error("Settings validation error:", err.message);
        return reply.code(500).send({
          success: false,
          error_response: {
            code: 500,
            reason: "SETTINGS_QUERY_ERROR",
            message: err.message,
          },
        });
      }

      // ── 3. Payload validation ─────────────────────────────────────────
      const { mapping } = req.body || {};

      if (!Array.isArray(mapping) || mapping.length === 0) {
        return reply.code(400).send({
          success: false,
          error_response: {
            code: 400,
            reason: "INVALID_PAYLOAD",
            message: "'mapping' must be a non-empty array",
          },
        });
      }

      // Basic shape check — each entry must have chute_id + sort_code_list
      for (const chute of mapping) {
        if (!chute.chute_id || !Array.isArray(chute.sort_code_list)) {
          return reply.code(400).send({
            success: false,
            error_response: {
              code: 400,
              reason: "INVALID_MAPPING_ENTRY",
              message: `Each mapping entry must have 'chute_id' and 'sort_code_list'. Offending entry: ${JSON.stringify(chute)}`,
            },
          });
        }
      }

      // ── 4. Enqueue the job — machine_id travels with the job now ───────
      try {
        await fastify.queues.chuteMappingQueue.add("upsertChuteMapping", {
          mapping,
          machine_id,
        });
        return reply.code(200).send({ success: true });
      } catch (err) {
        fastify.log.error("❌ configFileUpdate enqueue error:", err);
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
};

module.exports = chuteMappingsRoutes;
