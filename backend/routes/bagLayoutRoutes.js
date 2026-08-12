// routes/bags.js
const fp = require("fastify-plugin");

async function bagLayoutRoutes(fastify) {
  const pool = fastify.pg;

  // ── GET /bags/summary ────────────────────────────────────────────────────────
fastify.get("/bags/summary", async (req, reply) => {
  try {
    const { machine_id } = req.query;

    if (!machine_id || !String(machine_id).trim()) {
      return reply.code(400).send({
        success: false,
        error: "machine_id is required",
      });
    }

    // Generate D001 -> D065
    const allBags = [];
    for (let i = 1; i <= 65; i++) {
      allBags.push(`D${String(i).padStart(3, "0")}`);
    }

    // Fetch counts from bags_wbn (NEW SOURCE) — scoped to this machine
    const { rows } = await pool.query(
      `
      SELECT
        bag_code,
        COALESCE(array_length(wbns, 1), 0) AS count
      FROM bags_wbn
      WHERE bag_code ~ '^D\\d{3}$'
        AND machine_id = $1
    `,
      [machine_id.trim()]
    );

    const map = {};
    for (const r of rows) {
      map[r.bag_code] = Number(r.count) || 0;
    }

    // Normalize: ensure all 65 bags exist
    const result = allBags.map(code => ({
      bag_code: code,
      count: map[code] || 0
    }));

    return reply.send({
      success: true,
      total: result.length,
      bags: result
    });

  } catch (err) {
    fastify.log.error("GET /bags/summary error:", err);
    return reply.code(500).send({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /bags/:bag_code/wbns
 * Returns WBNS list for a single bag (tooltip / modal)
 */
fastify.get("/bags/:bag_code/wbns", async (req, reply) => {
  try {
    const bagCode = String(req.params.bag_code || "").toUpperCase();
    const { machine_id } = req.query;

    if (!/^D\d{3}$/.test(bagCode)) {
      return reply.code(400).send({
        success: false,
        error: "Invalid bag_code. Expected format D001–D065"
      });
    }

    if (!machine_id || !String(machine_id).trim()) {
      return reply.code(400).send({
        success: false,
        error: "machine_id is required",
      });
    }

    // Fetch from bags_wbn (NEW SOURCE) — scoped to this machine
    const { rows } = await pool.query(
      `
     SELECT
  bag_code,
  COALESCE(wbns, '{}'::text[]) AS wbns,
  COALESCE(item_ids, '{}'::text[]) AS item_ids,
  first_drop_at,
  updated_at
FROM bags_wbn
WHERE bag_code = $1
  AND machine_id = $2
LIMIT 1
      `,
      [bagCode, machine_id.trim()]
    );

    // Bag exists but has no runtime entry yet
    if (rows.length === 0) {
      return reply.send({
        success: true,
        bag_code: bagCode,
        wbns: [],
        count: 0,
        first_drop_at: null
      });
    }

    return reply.send({
      success: true,
      bag_code: rows[0].bag_code,
      wbns: rows[0].wbns,
      item_ids: rows[0].item_ids,
      count: rows[0].wbns.length,
      first_drop_at: rows[0].first_drop_at,
      updated_at: rows[0].updated_at
    });

  } catch (err) {
    fastify.log.error("GET /bags/:bag_code/wbns error:", err);
    return reply.code(500).send({
      success: false,
      error: err.message
    });
  }
});

// ── DELETE /bags/:id ─────────────────────────────────────────────────────────
// NOTE: this uses the "bags" table, not "bags_wbn" — appears unused by
// BagsLayout.js (which only calls /bags/clear-bag). Left unmodified since
// I don't know its actual caller or whether "bags" is machine-scoped too —
// confirm before deciding whether it needs machine_id.
fastify.delete("/bags/:id", async (req, reply) => {
  const id = Number(req.params.id);
  if (!id) {
    return reply.code(400).send({ success: false, error: "Invalid bag id" });
  }

  try {
    const res = await pool.query(
      `DELETE FROM bags WHERE id=$1`,
      [id]
    );

    if (res.rowCount === 0) {
      return reply.code(404).send({ success: false, error: "Bag not found" });
    }

    return reply.send({ success: true });
  } catch (err) {
    fastify.log.error("DELETE /bags error:", err);
    return reply.code(500).send({ success: false, error: err.message });
  }
});

// ONE AND ALL BAG CLEAR API — machine_id is now REQUIRED for both branches,
// since bag_code (D001, D002...) is shared/collides across all machines.
fastify.delete("/bags/clear-bag/:id?", async (req, reply) => {
  const { id } = req.params;
  const { machine_id } = req.query;

  if (!machine_id || !String(machine_id).trim()) {
    return reply.code(400).send({
      success: false,
      error: "machine_id is required",
    });
  }
  const machineId = machine_id.trim();

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // ===================== CLEAR ALL (for this machine only) =====================
    if (!id) {
      // FIX: was `pool.query(...)` — ran OUTSIDE this transaction on a
      // separate connection, so a later failure + ROLLBACK would NOT undo
      // this update. Now uses `client.query` like everything else here.
      const res = await client.query(
        `UPDATE bags_wbn
    SET
      wbns = '{}'::text[],
      item_ids = '{}'::text[],
      first_drop_at = NULL
    WHERE machine_id = $1`,
        [machineId]
      );

      await client.query(
        `DELETE FROM parcels WHERE machine_id = $1`,
        [machineId]
      );

      await client.query("COMMIT");

      // FIX: message previously claimed "except D050" but no such
      // exclusion existed in the query — D050 was being cleared too.
      // If D050 (exception chute) should actually be preserved, add
      // `AND bag_code <> 'D050'` to both queries above and restore this
      // wording. As written now, the message matches the actual behavior.
      return reply.send({
        success: true,
        message: `All bags cleared successfully for ${machineId}`,
        updated: res.rowCount,
      });
    }

    // ===================== CLEAR SINGLE BAG (for this machine only) =====================
    const res = await client.query(
      `
      UPDATE bags_wbn
      SET
        wbns = '{}'::text[],
        item_ids = '{}'::text[],
        first_drop_at = NULL
      WHERE bag_code = $1
        AND machine_id = $2
      `,
      [id, machineId]
    );

    if (res.rowCount === 0) {
      await client.query("ROLLBACK");

      return reply.code(404).send({
        success: false,
        error: "Bag not found",
      });
    }

    await client.query(
      `
      DELETE FROM parcels
      WHERE chute_id = $1
        AND machine_id = $2
      `,
      [id, machineId]
    );

    await client.query("COMMIT");

    return reply.send({
      success: true,
      message: `Bag ${id} cleared successfully`,
    });

  } catch (err) {
    console.log(err)
    await client.query("ROLLBACK");
    fastify.log.error(err);

    return reply.code(500).send({
      success: false,
      error: err.message,
    });
  } finally {
    client.release();
  }
});

// Used by SorterDashboard.js's BagParcelChart — now scoped to the selected machine.
fastify.get("/bags/getBagParcelChart", async (req, reply) => {
  try {
    const { machine_id } = req.query;

    if (!machine_id || !String(machine_id).trim()) {
      return reply.code(400).send({
        error: true,
        message: "machine_id is required",
      });
    }

    const client = await pool.connect();
    const sql = `
      SELECT bag_code AS bag, COALESCE(array_length(wbns, 1), 0) AS parcels
      FROM bags_wbn
      WHERE machine_id = $1
      ORDER BY bag_code ASC
    `;
    const response = await client.query(sql, [machine_id.trim()]);
    client.release();
    reply.send(response.rows);
  } catch (err) {
    console.log(err);

    reply.code(500).send({
      error: true,
      message: err.message,
    });
  }
});
};

module.exports = bagLayoutRoutes;
