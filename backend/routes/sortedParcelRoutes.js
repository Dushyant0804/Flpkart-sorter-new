// routes/sortedPayloads.js

/**
 * Sorted Parcels (Success Payloads)
 * Table: success_payloads
 * Columns: id, wbn, payload, updated_at
 */


async function sortedParcelRoutes(fastify) {

  // ── GET PARCELS ────────────────────────────────────────────────────────────
  fastify.get("/sorted-parcels", async (req, reply) => {
    const client = await fastify.pg.connect();
    try {
      let {
        page      = 1,
        limit     = 100,
        search    = "",   // searches wbn
        item_id   = "",   // searches item_id
        status    = "",
        reason    = "",
        source    = "",
        machine_id = "",
        startTime,
        endTime,
      } = req.query;
console.log(req.query)
      page  = parseInt(page);
      limit = parseInt(limit);
      const offset = (page - 1) * limit;

      const hasWbnSearch    = search  && search.trim()  !== "";
      const hasItemIdSearch = item_id && item_id.trim() !== "";
      const hasTimeFilter   = startTime || endTime;

      // Cannot mix search + date filter
      if ((hasWbnSearch || hasItemIdSearch) && hasTimeFilter) {
        return reply.code(400).send({
          error: true,
          message: "Cannot use search and date filter together — reset first",
        });
      }

      const where  = [];
      const params = [];
      let   idx    = 1;

    // Machine filter — scopes every query to the selected machine
    if (machine_id && machine_id.trim()) {
      where.push(`machine_id = $${idx}`);
      params.push(machine_id.trim());
      idx++;
    }

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

      // Date filter
      if (startTime && endTime) {
        where.push(`created_at BETWEEN $${idx}::timestamptz AND $${idx + 1}::timestamptz`);
        params.push(startTime, endTime);
        idx += 2;
      } else if (startTime) {
        where.push(`created_at >= $${idx}::timestamptz`);
        params.push(startTime);
        idx++;
      } else if (endTime) {
        where.push(`created_at <= $${idx}::timestamptz`);
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
        `SELECT COUNT(*) FROM parcels ${whereSql}`,
        params
      );
      const total = parseInt(countRes.rows[0].count);

      // Page data
      const dataRes = await client.query(
        `SELECT
           id,
           wbn,
           item_id,
           chute_id,
           status,
           reason,
           source,
           machine_id,
           induct_time,
           inductapi_sent,
           induct_payload,
           induct_response,
           drop_time,
           drop_notification_sent,
           drop_notification_payload,
           drop_notification_response,
           created_at
         FROM sorter_audit_log
         ${whereSql}
         ORDER BY created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
      );
      // return reply.send({ total, page, limit, rows: dataRes.rows });
      return reply.send({
        success: true,
        page,
        limit,
        total,
        rows: dataRes.rows
      });
    } catch (err) {
      console.error("❌ parcels GET error:", err);
      return reply.code(500).send({ error: true, message: err.message });
    } finally {
      client.release();
    }
  });

  // ── EXPORT PARCELS CSV ─────────────────────────────────────────────────────
  fastify.get("/sorted-parcels-report/export", async (req, reply) => {
    const client = await fastify.pg.connect();
    try {
      let {
        search    = "",
        item_id   = "",
        status    = "",
        reason    = "",
        source    = "",
        machine_id = "",
        startTime,
        endTime,
      } = req.query;

      const hasWbnSearch    = search  && search.trim()  !== "";
      const hasItemIdSearch = item_id && item_id.trim() !== "";
      const hasTimeFilter   = startTime || endTime;

      if ((hasWbnSearch || hasItemIdSearch) && hasTimeFilter) {
        return reply.code(400).send({
          error: true,
          message: "Cannot use search and date filter together",
        });
      }

      const where  = [];
      const params = [];
      let   idx    = 1;

     // Machine filter — scopes the export to the selected machine
      if (machine_id && machine_id.trim() !== "") {
        where.push(`machine_id = $${idx}`);
        params.push(machine_id.trim());
        idx++;
      }

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
        where.push(`created_at BETWEEN $${idx}::timestamptz AND $${idx + 1}::timestamptz`);
        params.push(startTime, endTime);
        idx += 2;
      } else if (startTime) {
        where.push(`created_at >= $${idx}::timestamptz`);
        params.push(startTime);
        idx++;
      } else if (endTime) {
        where.push(`created_at <= $${idx}::timestamptz`);
        params.push(endTime);
        idx++;
      }
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

      const res = await client.query(
        `SELECT
           id,
           wbn,
           item_id,
           chute_id,
           status,
           reason,
           source,
           machine_id,
           inductapi_sent,
           drop_notification_sent,
           TO_CHAR(induct_time AT TIME ZONE 'Asia/Kolkata', 'DD-MM-YYYY HH24:MI:SS') AS induct_time_ist,
           TO_CHAR(drop_time   AT TIME ZONE 'Asia/Kolkata', 'DD-MM-YYYY HH24:MI:SS') AS drop_time_ist,
           TO_CHAR(created_at  AT TIME ZONE 'Asia/Kolkata', 'DD-MM-YYYY HH24:MI:SS') AS created_at_ist
         FROM sorter_audit_log
         ${whereSql}
         ORDER BY created_at DESC`,
        params
      );

      const fields = [
        "id", "wbn", "item_id", "chute_id", "status", "reason", "source",machine_id,
        "inductapi_sent", "drop_notification_sent",
        "induct_time_ist", "drop_time_ist", "created_at_ist",
      ];

      const parser = new Parser({ fields });
      const csv    = parser.parse(res.rows);

      return reply
        .header("Content-Type", "text/csv")
        .header("Content-Disposition", "attachment; filename=parcels_report.csv")
        .send(csv);

    } catch (err) {
      console.error("❌ parcels export error:", err);
      return reply.code(500).send({ error: true, message: err.message });
    } finally {
      client.release();
    }
  });
}

module.exports = sortedParcelRoutes;
