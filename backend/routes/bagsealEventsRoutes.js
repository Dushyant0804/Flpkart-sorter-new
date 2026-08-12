// routes/bagClosingRoutes.js

const { Parser } = require("json2csv");

async function bagsealEventsRoutes(fastify) {

  // ── GET bag closing records ───────────────────────────────────────────────
  fastify.get("/bag-closing", async (req, reply) => {
    const client = await fastify.pg.connect();

    try {
      let {
        page = 1,
        limit = 100,
        search = "",
        wbn = "",
        machine_id = "",
        startTime,
        endTime,
      } = req.query;

      // ── machine_id is mandatory for multi-machine correctness ──────────
      // chute_id / chute_code repeats across machines (e.g. every machine
      // has its own "D005"), so without machine_id this query would mix
      // records from all 10 machines together under the same search term.
      if (!machine_id || !machine_id.trim()) {
        return reply.code(400).send({
          success: false,
          error: "machine_id is required",
        });
      }

      page = parseInt(page);
      limit = parseInt(limit);
      const offset = (page - 1) * limit;

      const where = [];
      const params = [];
      let idx = 1;

      // Filter by machine_id — mandatory, scopes every other filter below
      where.push(`machine_id = $${idx}`);
      params.push(machine_id.trim());
      idx++;   // 👈 FIX: was missing before, caused $-placeholder collision with next filter

      // Search by Chute ID
      if (search && search.trim()) {
        where.push(`chute_id ILIKE $${idx}`);
        params.push(`%${search.trim()}%`);
        idx++;
      }

      if (wbn && wbn.trim()) {
        where.push(`
          EXISTS (
            SELECT 1
            FROM unnest(wbns) AS x
            WHERE replace(trim(x), '\\', '') ILIKE '%' || $${idx} || '%'
          )
        `);
        params.push(wbn.trim().replace(/\\/g, ""));
        idx++;
      }

      // Date Filters
      if (startTime && endTime) {
        where.push(`bag_closed_at BETWEEN $${idx} AND $${idx + 1}`);
        params.push(startTime, endTime);
        idx += 2;
      } else if (startTime) {
        where.push(`bag_closed_at >= $${idx}`);
        params.push(startTime);
        idx++;
      } else if (endTime) {
        where.push(`bag_closed_at <= $${idx}`);
        params.push(endTime);
        idx++;
      }

      const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

      // Total Count
      const countResult = await client.query(
        `
        SELECT COUNT(*) AS total
        FROM bag_closing
        ${whereSql}
        `,
        params
      );

      const total = Number(countResult.rows[0].total);

      // Data
      const dataResult = await client.query(
        `
        SELECT
          id,
          chute_id,
          wbns,
          bag_close_payload,
          bag_close_response,
          machine_id,
          TO_CHAR(
            bag_closed_at AT TIME ZONE 'Asia/Kolkata',
            'DD-MM-YYYY HH24:MI:SS'
          ) AS bag_closed_at
        FROM bag_closing
        ${whereSql}
        ORDER BY bag_closing.bag_closed_at DESC
        LIMIT $${idx}
        OFFSET $${idx + 1}
        `,
        [...params, limit, offset]
      );

      return reply.send({
        success: true,
        total,
        page,
        limit,
        rows: dataResult.rows,
      });
    } catch (err) {
      console.error("❌ bag-closing GET error:", err);

      return reply.code(500).send({
        success: false,
        error: err.message,
      });
    } finally {
      client.release();
    }
  });
  // ── EXPORT bag closing CSV ─────────────────────────────────────────────────
  fastify.get("/bag-closing/export", async (req, reply) => {
    const client = await fastify.pg.connect();

    try {
      let {
        search = "",
        wbn = "",
        startTime,
        endTime,
      } = req.query;

      const where = [];
      const params = [];
      let idx = 1;
      if (machine_id && machine_id.trim()) {
      params.push(machine_id.trim());
      where.push(`machine_id = $${idx}`);
    }
 idx++;  
      // Chute ID Filter
      if (search && search.trim()) {
        where.push(`chute_id ILIKE $${idx}`);
        params.push(`%${search.trim()}%`);
        idx++;
      }
       if (wbn && wbn.trim()) {
        where.push(`
          EXISTS (
            SELECT 1
            FROM unnest(wbns) AS x
            WHERE replace(trim(x), '\\', '') ILIKE '%' || $${idx} || '%'
          )
        `);

        params.push(wbn.trim().replace(/\\/g, ""));
        idx++;
      }

      // Date Filters
      if (startTime && endTime) {
        where.push(`bag_closed_at BETWEEN $${idx} AND $${idx + 1}`);
        params.push(startTime, endTime);
        idx += 2;
      } else if (startTime) {
        where.push(`bag_closed_at >= $${idx}`);
        params.push(startTime);
        idx++;
      } else if (endTime) {
        where.push(`bag_closed_at <= $${idx}`);
        params.push(endTime);
        idx++;
      }

      const whereSql =
        where.length > 0
          ? `WHERE ${where.join(" AND ")}`
          : "";

      const result = await client.query(
        `
      SELECT
        id,
        chute_id,
        array_to_string(wbns, ', ') AS wbns,
        COALESCE(array_length(wbns, 1), 0) AS total_shipments,
        bag_close_payload,
        bag_close_response,
        machine_id,
        TO_CHAR(
          bag_closed_at AT TIME ZONE 'Asia/Kolkata',
          'DD-MM-YYYY HH24:MI:SS'
        ) AS bag_closed_at
      FROM bag_closing
      ${whereSql}
      ORDER BY bag_closing.bag_closed_at ASC
      `,
        params
      );

      const fields = [
        "id",
        "chute_id",
        "wbns",
        "total_shipments",
        "bag_close_payload",
        "bag_close_response",
        "machine_id",
        "bag_closed_at",
      ];

      const parser = new Parser({ fields });
      const csv = parser.parse(result.rows);

      return reply
        .header("Content-Type", "text/csv")
        .header(
          "Content-Disposition",
          "attachment; filename=bag_closing_report.csv"
        )
        .send(csv);

    } catch (err) {
      console.error("❌ bag-closing export error:", err);

      return reply.code(500).send({
        success: false,
        error: err.message,
      });

    } finally {
      client.release();
    }
  });

  fastify.get("/bags/countALLClosedBag", async (req, reply) => {
    try {
      const { start, end, machine_id } = req.query;
      // const client = await fastify.pg.connect();

      const sqlForAllCount =
        "SELECT COUNT(chute_id) AS total FROM bag_closing WHERE machine_id = $1";

      const sqlForAllCountFromTo =
        "SELECT COUNT(chute_id) AS total FROM bag_closing WHERE bag_closed_at >= $1 AND bag_closed_at <= $2 AND machine_id = $3";

      const sqlForAllCountFrom =
        "SELECT COUNT(chute_id) AS total FROM bag_closing WHERE bag_closed_at >= $1 AND machine_id = $2";

      const sqlForAllCountTo =
        "SELECT COUNT(chute_id) AS total FROM bag_closing WHERE bag_closed_at <= $1 AND machine_id = $2";

      const response = await fastify.pg.query(
        start && end
          ? sqlForAllCountFromTo
          : start
          ? sqlForAllCountFrom
          : end
          ? sqlForAllCountTo
          : sqlForAllCount,

        start && end
          ? [start, end, machine_id]
          : start
          ? [start, machine_id]
          : end
          ? [end,machine_id]
          : [machine_id]
      );
      reply.send(response.rows);
    } catch (err) {
      console.log(err);

      reply.code(500).send({
        error: true,
        message: err.message,
      });
    } 
  });
}

module.exports = bagsealEventsRoutes;