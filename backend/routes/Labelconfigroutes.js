

const API_KEY = "mechintsorter";

async function validateRequest(req, reply, fastify) {
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
    // console.log("settings", settings);

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
    fastify.log.error("Settings validation error:", err.message);
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

async function labelConfigRoutes(fastify) {
  // ── PUT: upsert label config ──────────────────────────────────────────────
  fastify.put(
    "/api/v2/facility/:facilityId/installation/:installationId/labelConfig",
    async (req, reply) => {
      const valid = await validateRequest(req, reply, fastify);
      if (!valid) return;

      const { label_configurations } = req.body || {};

      if (!Array.isArray(label_configurations) || label_configurations.length === 0) {
        return reply.code(400).send({
          success: false,
          error_response: {
            code: 400,
            reason: "INVALID_PAYLOAD",
            message: "'label_configurations' must be a non-empty array",
          },
        });
      }

      // Basic shape check
      for (const config of label_configurations) {
        if (!config.label_type || !config.label_regex) {
          return reply.code(400).send({
            success: false,
            error_response: {
              code: 400,
              reason: "INVALID_LABEL_CONFIG",
              message: "Each entry must have 'label_type' and 'label_regex'",
            },
          });
        }
      }

      try {
        const client = await fastify.pg.connect();
        try {
          await client.query("BEGIN");

          for (const config of label_configurations) {
            await client.query(
              `INSERT INTO label_configurations
                 (label_type, label_regex, label_fields, updated_at)
               VALUES ($1, $2, $3::jsonb, NOW())
               ON CONFLICT (label_type)
               DO UPDATE SET
                 label_regex  = EXCLUDED.label_regex,
                 label_fields = EXCLUDED.label_fields,
                 updated_at   = NOW()`,
              [
                config.label_type,
                config.label_regex,
                JSON.stringify(config.label_fields ?? []),
              ]
            );
          }

          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }

        return reply.code(200).send({ success: true });
      } catch (err) {
        fastify.log.error("❌ labelConfig upsert error:", err.message);
        return reply.code(500).send({
          success: false,
          error_response: {
            code: 500,
            reason: "DB_ERROR",
            message: err.message,
          },
        });
      }
    }
  );

  // ── GET: return all label configs ─────────────────────────────────────────
  fastify.get(
    "/api/v2/facility/:facilityId/installation/:installationId/labelConfig",
    async (req, reply) => {
      const valid = await validateRequest(req, reply, fastify);
      if (!valid) return;

      try {
        const result = await fastify.pg.query(
          `SELECT label_type, label_regex, label_fields
           FROM label_configurations
           ORDER BY label_type ASC`
        );

        return reply.code(200).send({
          label_configurations: result.rows.map((row) => ({
            label_type:   row.label_type,
            label_regex:  row.label_regex,
            label_fields: row.label_fields,
          })),
        });
      } catch (err) {
        fastify.log.error("❌ labelConfig GET error:", err.message);
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

module.exports = labelConfigRoutes;