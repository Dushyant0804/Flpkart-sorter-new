// routes/sortedBulkDataRoutes.js

async function sortedBulkDataRoutes(fastify) {

  // ── GET sorted bulk data ──────────────────────────────────────────────────
  fastify.get("/sorted-bulk-data", async (req, reply) => {
    const client = await fastify.pg.connect();
    try {
      let {
        page      = 1,
        limit     = 100,
        search    = "",   // searches item_id
        startTime,
        endTime,
      } = req.query;

      page  = parseInt(page);
      limit = parseInt(limit);
      const offset = (page - 1) * limit;

      const hasSearch     = search && search.trim() !== "";
      const hasTimeFilter = startTime || endTime;

      if (hasSearch && hasTimeFilter) {
        return reply.code(400).send({
          error: true,
          message: "Cannot use search and date filter together — reset first",
        });
      }

      const where  = [];
      const params = [];
      let   idx    = 1;

      if (hasSearch) {
        where.push(`item_id ILIKE $${idx}`);
        params.push(`%${search.trim()}%`);
        idx++;
      }

      // Date filter on moved_at
      if (startTime && endTime) {
        where.push(`moved_at BETWEEN $${idx}::timestamptz AND $${idx + 1}::timestamptz`);
        params.push(startTime, endTime);
        idx += 2;
      } else if (startTime) {
        where.push(`moved_at >= $${idx}::timestamptz`);
        params.push(startTime);
        idx++;
      } else if (endTime) {
        where.push(`moved_at <= $${idx}::timestamptz`);
        params.push(endTime);
        idx++;
      }

      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const countRes = await client.query(
        `SELECT COUNT(*) FROM sorted_bulk_data ${whereSql}`,
        params
      );
      const total = parseInt(countRes.rows[0].count);

      const dataRes = await client.query(
        `SELECT
           item_id,
           labels,
           type,
           sort_code,
           timestamp,
           received_at,
           moved_at
         FROM sorted_bulk_data
         ${whereSql}
         ORDER BY moved_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
      );

      return reply.send({ success: true, total, page, limit, rows: dataRes.rows });

    } catch (err) {
      console.error("❌ sorted-bulk-data GET error:", err);
      return reply.code(500).send({ success: false, error: err.message });
    } finally {
      client.release();
    }
  });
}

module.exports = sortedBulkDataRoutes;