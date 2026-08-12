// routes/parcelRoutes.js

const fp = require("fastify-plugin");
const { Parser } = require("json2csv");

async function parcelRoutes(fastify) {

  function buildWhereClause({ search, startTime, endTime, machine_id }) {
    const where = [];
    const params = [];
    let idx = 1;

    const hasSearch = search && search.trim() !== "";
    const hasStartTime = startTime && startTime.trim() !== "";
    const hasEndTime = endTime && endTime.trim() !== "";
    const hasMachineId = machine_id && machine_id.trim() !== "";

    // FIX: machine_id was accepted as a param but never actually used —
    // the filter never got added to `where`/`params`.
    if (hasMachineId) {
      where.push(`machine_id = $${idx}`);
      params.push(machine_id.trim());
      idx++;
    }

    if (hasSearch) {
      where.push(`wbn ILIKE $${idx}`);
      params.push(`%${search.trim()}%`);
      idx++;
    }

    // Date filter — only applied when no search term
    // (API contract: search and date filter are mutually exclusive)
    if (!hasSearch) {
      if (hasStartTime && hasEndTime) {
        where.push(`created_at BETWEEN $${idx} AND $${idx + 1}`);
        params.push(startTime, endTime);
        idx += 2;
      } else if (hasStartTime) {
        where.push(`created_at >= $${idx}`);
        params.push(startTime);
        idx++;
      } else if (hasEndTime) {
        where.push(`created_at <= $${idx}`);
        params.push(endTime);
        idx++;
      }
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    return { whereSql, params, nextIdx: idx };
  }

  // ── GET PARCELS ────────────────────────────────────────────────────────────
  fastify.get("/parcels", async (req, reply) => {
    const client = await fastify.pg.connect();
    try {
      let {
        page = 1,
        limit = 100,
        search = "",   // searches wbn
        wbn_key = '',
        item_id = "",   // searches item_id
        status = "",
        reason = "",
        source = "",
        machine_id = "",
        startTime,
        endTime,
      } = req.query;

      if (!machine_id || !machine_id.trim()) {
        return reply.code(400).send({
          success: false,
          error: "machine_id is required",
        });
      }
      page = parseInt(page);
      limit = parseInt(limit);
      const offset = (page - 1) * limit;

      const hasWbnSearch = search && search.trim() !== "";
      const hasItemIdSearch = item_id && item_id.trim() !== "";
      const hasWbnKeySearch = wbn_key && wbn_key.trim() !== "";
      const hasTimeFilter = startTime || endTime;

      // Cannot mix search + date filter
      if ((hasWbnSearch || hasItemIdSearch || hasWbnKeySearch) && hasTimeFilter) {
        return reply.code(400).send({
          error: true,
          message: "Cannot use search and date filter together — reset first",
        });
      }

      const where = [];
      const params = [];
      let idx = 1;

      // Filter by machine_id — mandatory, scopes every other filter below
      where.push(`machine_id = $${idx}`);
      params.push(machine_id.trim());
      idx++;

      // WBN search
      if (hasWbnSearch) {
        where.push(`wbn ILIKE $${idx}`);
        params.push(`%${search.trim()}%`);
        idx++;
      }

      // item_id search
      if (hasItemIdSearch) {
        where.push(`item_id ILIKE $${idx}`);
        params.push(`%${item_id.trim()}%`);
        idx++;
      }
      if (hasWbnKeySearch) {
        where.push(`wbn_key ILIKE $${idx}`);
        params.push(`%${wbn_key.trim()}%`);
        idx++;
      }
      // Date filter
      if (startTime && endTime) {
        where.push(`created_at BETWEEN $${idx} AND $${idx + 1}`);
        params.push(startTime, endTime);
        idx += 2;
      } else if (startTime) {
        where.push(`created_at >= $${idx}`);
        params.push(startTime);
        idx++;
      } else if (endTime) {
        where.push(`created_at <= $${idx}`);
        params.push(endTime);
        idx++;
      }

      // Dropdown filters
      if (status && status.trim() !== "") {
        where.push(`status = $${idx}`);
        params.push(status.trim());
        idx++;
      }
      if (reason && reason.trim() !== "") {
        where.push(`reason ILIKE $${idx}`);
        params.push(reason.trim());
        idx++;
      }
      if (source && source.trim() !== "") {
        where.push(`source = $${idx}`);
        params.push(source.trim());
        idx++;
      }

      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

      // Total count
      const countRes = await client.query(
        `SELECT COUNT(*) FROM primary_bin_data ${whereSql}`,
        params
      );
      const total = parseInt(countRes.rows[0].count);

      // Page data
      const dataRes = await client.query(
        `SELECT
           id,
           infeed,
           wbn,
           item_id,
           wbn_key,
           length,
           width,
           height,
           weight,
           volume,
           real_volume,
           expected_bag,
           final_bag,
           sort,
           reason,
           sorttime,
           machine_id,
           created_at
         FROM primary_bin_data
         ${whereSql}
         ORDER BY created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
      );

      return reply.send({ total, page, limit, rows: dataRes.rows });

    } catch (err) {
      console.error("❌ parcels GET error:", err);
      return reply.code(500).send({ error: true, message: err.message });
    } finally {
      client.release();
    }
  });

  // ── EXPORT PARCELS CSV ─────────────────────────────────────────────────────
  fastify.get("/parcels/export", async (req, reply) => {
    const client = await fastify.pg.connect();
    try {
      let {
        search = "",
        item_id = "",
        sort = "",
        reason = "",
        source = "",
        machine_id = "",
        startTime,
        endTime,
      } = req.query;

      if (!machine_id || !machine_id.trim()) {
        return reply.code(400).send({
          success: false,
          error: "machine_id is required",
        });
      }

      const hasWbnSearch = search && search.trim() !== "";
      const hasItemIdSearch = item_id && item_id.trim() !== "";
      const hasTimeFilter = startTime || endTime;

      if ((hasWbnSearch || hasItemIdSearch) && hasTimeFilter) {
        return reply.code(400).send({
          error: true,
          message: "Cannot use search and date filter together",
        });
      }

      const where = [];
      const params = [];
      let idx = 1;

      // Filter by machine_id — mandatory, scopes every other filter below
      where.push(`machine_id = $${idx}`);
      params.push(machine_id.trim());
      idx++;

      if (hasWbnSearch) {
        where.push(`wbn ILIKE $${idx}`);
        params.push(`%${search.trim()}%`);
        idx++;
      }

      if (hasItemIdSearch) {
        where.push(`item_id ILIKE $${idx}`);
        params.push(`%${item_id.trim()}%`);
        idx++;
      }

      if (startTime && endTime) {
        where.push(`created_at BETWEEN $${idx} AND $${idx + 1}`);
        params.push(startTime, endTime);
        idx += 2;
      } else if (startTime) {
        where.push(`created_at >= $${idx}`);
        params.push(startTime);
        idx++;
      } else if (endTime) {
        where.push(`created_at <= $${idx}`);
        params.push(endTime);
        idx++;
      }

      if (sort && sort.trim() !== "") {
        where.push(`sort = $${idx}`);
        params.push(sort.trim());
        idx++;
      }

      if (reason && reason.trim() !== "") {
        where.push(`reason ILIKE $${idx}`);
        params.push(`%${reason.trim()}%`);
        idx++;
      }

      if (source && source.trim() !== "") {
        where.push(`source = $${idx}`);
        params.push(source.trim());
        idx++;
      }

      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const res = await client.query(
        `
      SELECT
        id,
        infeed,
        wbn,
        item_id,
        expected_bag,
        final_bag,
        sort,
        reason,
        TO_CHAR(
          sorttime AT TIME ZONE 'Asia/Kolkata',
          'YYYY-MM-DD HH24:MI:SS'
        ) AS sorttime,
        machine_id,
        TO_CHAR(
          created_at AT TIME ZONE 'Asia/Kolkata',
          'YYYY-MM-DD HH24:MI:SS'
        ) AS created_at

      FROM primary_bin_data
      ${whereSql}
      ORDER BY created_at DESC
      `,
        params
      );

      // FIX: "machine_id" was listed twice — caused a duplicate column in the CSV.
      const fields = [
        "id",
        "infeed",
        "wbn",
        "item_id",
        "expected_bag",
        "final_bag",
        "sort",
        "reason",
        "machine_id",
        "sorttime",
        "created_at",
      ];

      const parser = new Parser({ fields });
      const csv = parser.parse(res.rows);

      return reply
        .header("Content-Type", "text/csv")
        .header(
          "Content-Disposition",
          "attachment; filename=parcels_report.csv"
        )
        .send(csv);

    } catch (err) {
      console.error("❌ parcels export error:", err);
      return reply.code(500).send({
        error: true,
        message: err.message,
      });
    } finally {
      client.release();
    }
  });

  // FIX: handler param was `request`, but the body used `req.query` — `req`
  // was never declared, so this route threw ReferenceError on every call.
  fastify.get("/hourly-scan-report", async (request, reply) => {
    const { machine_id } = request.query;

    if (!machine_id || !machine_id.trim()) {
      return reply.code(400).send({
        success: false,
        message: "machine_id is required",
      });
    }

    try {
      const query = `
      SELECT
        h.hr,
        LPAD(h.hr::text, 2, '0') || ':00-' ||
        LPAD(((h.hr + 1) % 24)::text, 2, '0') || ':00' AS time,
        COALESCE(COUNT(p.created_at), 0) AS scans
      FROM generate_series(0, 23) AS h(hr)
      LEFT JOIN primary_bin_data p
        ON EXTRACT(HOUR FROM p.created_at) = h.hr
        AND p.created_at::date = CURRENT_DATE
        AND p.machine_id = $1
      GROUP BY h.hr
      ORDER BY h.hr;
    `;

      const result = await fastify.pg.query(query, [machine_id.trim()]);

      return reply.send({
        success: true,
        data: result.rows,
      });

    } catch (error) {
      request.log.error(error);

      return reply.code(500).send({
        success: false,
        message: error.message,
      });

    }
  });


  // FIX: table name was "parcel" (singular, doesn't exist) and the query
  // referenced $2 while only one param was passed — both would error on
  // every call. Also added machine_id scoping to avoid cross-machine deletes.
  fastify.delete("/parcels/:id", async (req, reply) => {
    const { id } = req.params;
    const { machine_id } = req.query;
    const item_id = id;

    if (!machine_id || !machine_id.trim()) {
      return reply.code(400).send({
        success: false,
        error: "machine_id is required",
      });
    }

    await fastify.pg.query(
      "DELETE FROM parcels WHERE item_id = $1 AND machine_id = $2",
      [item_id, machine_id.trim()]
    );

    return { success: true };
  });

  fastify.get("/dashboard-summary", async (req, reply) => {
    // FIX: machine_id was never destructured/passed through, so every
    // dashboard stat card showed combined data across ALL machines
    // regardless of the navbar dropdown selection.
    const { startTime, endTime, machine_id } = req.query;

    if (!machine_id || !machine_id.trim()) {
      return reply.code(400).send({
        error: true,
        message: "machine_id is required",
      });
    }

    const { whereSql, params } = buildWhereClause({ startTime, endTime, machine_id });

    try {
      const [summaryRes, rejBreakdownRes] = await Promise.all([

        // Total counts + infeed split — single pass over the table
        fastify.pg.query(
          `SELECT
  COUNT(*) AS scanned,

  COUNT(*) FILTER (
    WHERE sort = 'SORTED'
  ) AS sorted,

COUNT(*) FILTER (
  WHERE sort != 'SORTED' AND sort != 'RECIRCULATE'
) AS rejected,

  COUNT(*) FILTER (
    WHERE sort != 'SORTED'
    AND sort != 'RECIRCULATE' 
      AND reason IS NOT NULL
      AND reason NOT IN ('null','SPLR','')
  ) AS rejected_with_reason,

  COUNT(*) FILTER (
    WHERE infeed = '01'
  ) AS infeed1_count,

  COUNT(*) FILTER (
    WHERE infeed = '02'
  ) AS infeed2_count,


COUNT(*) FILTER (
  WHERE sort = 'RECIRCULATE'
) AS recirculate_count

FROM primary_bin_data
${whereSql}`,
          params
        ),

        // Rejection breakdown by reason code
        fastify.pg.query(
          `SELECT
             reason,
             COUNT(*) AS count
           FROM primary_bin_data
           ${whereSql ? whereSql + " AND" : "WHERE"}
             sort    != 'SORTED'
             AND reason IS NOT NULL
             AND reason NOT IN ('null', 'SPLR', '')
           GROUP BY reason
           ORDER BY count DESC`,
          params
        ),
      ]);

      const s = summaryRes.rows[0];

      return reply.send({
        scanned: parseInt(s.scanned),
        sorted: parseInt(s.sorted),
        rejected: parseInt(s.rejected),
        recirculateCount: parseInt(s.recirculate_count),
        infeed1Count: parseInt(s.infeed1_count),
        infeed2Count: parseInt(s.infeed2_count),
        rejectionBreakdown: rejBreakdownRes.rows.map(r => ({
          reason: r.reason,
          count: parseInt(r.count),
        })),
      });

    } catch (err) {
      console.log(err)
      req.log.error(err, "dashboard-summary error");
      return reply.code(500).send({ error: true, message: err.message });
    }
  });
}

module.exports = parcelRoutes;