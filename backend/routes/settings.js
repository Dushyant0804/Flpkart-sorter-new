

const axios = require("axios");

async function settingsRoutes(fastify) {



// ── GET Settings ──────────────────────────────────────────────────────────
fastify.get("/settings-get", async (req, reply) => {

  const { machine_id } = req.query;

  // machine_id is required
  if (!machine_id) {
    return reply.code(400).send({
      error: "machine_id is required"
    });
  }

  try {

    const res = await fastify.pg.query(
      `SELECT
           sorter_name, state, center_name,
           facility_id, installation_id,
           client_id, client_secret, grant_type,
           target_client_id, fk_client_id,
           fk_host_url, authn_ip,
           created_at, updated_at
       FROM settings
       WHERE machine_id = $1`,
      [machine_id]
    );

    console.log(
      `⚙️ Settings GET - machine_id: ${machine_id}, rows: ${res.rows.length}`
    );

    if (!res.rows.length) {
      return reply.code(404).send({
        error: "Settings not found",
        machine_id
      });
    }

    return reply.send(res.rows[0]);

  } catch (err) {

    console.error("❌ Error fetching settings:", err);

    return reply.code(500).send({
      error: "Failed to fetch settings"
    });
  }
});


// ── PUT Update Settings ───────────────────────────────────────────────────
fastify.put("/settings-update", async (req, reply) => {

  const {
    sorter_name,
    state,
    center_name,
    facilityId,
    installationId,
    client_id,
    client_secret,
    grant_type,
    target_client_id,
    fk_client_id,
    fk_host_url,
    authn_ip,
    machine_id
  } = req.body;

  // machine_id is required
  if (!machine_id) {
    return reply.code(400).send({
      error: "machine_id is required"
    });
  }

  try {

    const result = await fastify.pg.query(
      `UPDATE settings SET
         sorter_name      = $1,
         state            = $2,
         center_name      = $3,
         "facilityId"     = $4,
         "installationId" = $5,
         client_id        = $6,
         client_secret    = $7,
         grant_type       = $8,
         target_client_id = $9,
         fk_client_id     = $10,
         fk_host_url      = $11,
         authn_ip         = $12,
         updated_at       = NOW()
       WHERE machine_id = $13
       RETURNING *`,
      [
        sorter_name ?? null,
        state ?? null,
        center_name ?? null,
        facilityId ?? null,
        installationId ?? null,
        client_id ?? null,
        client_secret ?? null,
        grant_type ?? null,
        target_client_id ?? null,
        fk_client_id ?? null,
        fk_host_url ?? null,
        authn_ip ?? null,
        machine_id
      ]
    );

    console.log(
      `⚙️ Settings UPDATE - machine_id: ${machine_id}, rows: ${result.rows.length}`
    );

    if (!result.rows.length) {
      return reply.code(404).send({
        error: "Settings row not found",
        machine_id
      });
    }

    return reply.send(result.rows[0]);

  } catch (err) {

    console.error("❌ Error updating settings:", err);

    return reply.code(500).send({
      error: "Failed to update settings"
    });
  }
});


// ── POST Push settings to Node-RED ────────────────────────────────────────
fastify.post("/settings-push-nodered", async (req, reply) => {

  const { machine_id } = req.query;

  // machine_id is required
  if (!machine_id) {
    return reply.code(400).send({
      error: "machine_id is required"
    });
  }

  try {

    const res = await fastify.pg.query(
      `SELECT *
       FROM settings
       WHERE machine_id = $1`,
      [machine_id]
    );

    console.log(
      `⚙️ Settings PUSH - machine_id: ${machine_id}, rows: ${res.rows.length}`
    );

    if (!res.rows.length) {
      return reply.code(404).send({
        error: "Settings not found",
        machine_id
      });
    }

    try {

      await axios.post(
        process.env.NODE_RED_URL
          ? `${process.env.NODE_RED_URL}/settings-update`
          : "http://127.0.0.1:1880/settings-update",
        res.rows[0],
        {
          timeout: 3000,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );

      console.log(
        `✅ Settings pushed to Node-RED for machine ${machine_id}`
      );

      return reply.send({
        success: true
      });

    } catch (nrErr) {

      console.error(
        "❌ Node-RED push failed:",
        nrErr.message
      );

      return reply.code(502).send({
        success: false,
        error: "Node-RED not reachable"
      });
    }

  } catch (err) {

    console.error(
      "❌ Push route error:",
      err
    );

    return reply.code(500).send({
      error: "Failed to push settings"
    });
  }
});


// ── GET Machine List ───────────────────────────────────────────────────────
fastify.get("/machineList", async (req, reply) => {
  try {
    const res = await fastify.pg.query(
      `SELECT DISTINCT machine_id, installation_id
       FROM settings
       WHERE machine_id IS NOT NULL
       ORDER BY machine_id`
    );

    return res.rows.map((r) => ({
      machine_id: r.machine_id,
      installation_id: r.installation_id,
    }));

    // Or simply: return res.rows;
  } catch (err) {
    fastify.log.error(
      "Failed to fetch machine list:",
      err.message
    );

    return reply.code(500).send({
      error: true,
      message: err.message,
    });
  }
});

}

module.exports = settingsRoutes;

