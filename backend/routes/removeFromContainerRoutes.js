// routes/removeFromContainerRoutes.js
//
// POST /v2/facility/:facilityId/installation/:installationId/removeFromContainer
//
// FK sends item_ids to remove from their chute/bag.
// Per item response — success or failure per item_id.
// No queue needed — synchronous DB ops, response per item required immediately.
//
// Flow per item_id:
//  1. Find parcel in parcels table by item_id → get wbn + chute_id
//  2. Remove wbn from bags_wbn.wbns array for that chute
//  3. Remove item_id from bags_wbn.item_ids array for that chute
//  4. Delete parcel row from parcels table
//  5. Return success/failure per item_id

const API_KEY = "mechintsorter";

async function removeFromContainerRoutes(fastify) {
  fastify.post(
    "/v2/facility/:facilityId/installation/:installationId/removeFromContainer",
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
        fastify.log.error("❌ Settings validation error:", err.message);
        return reply.code(500).send({
          success: false,
          error_response: { code: 500, reason: "SETTINGS_QUERY_ERROR", message: err.message },
        });
      }

      // ── 3. Validate payload ───────────────────────────────────────────
      const { shipments } = req.body || {};
      if (!Array.isArray(shipments) || shipments.length === 0) {
        return reply.code(400).send({
          success: false,
          error_response: {
            code: 400,
            reason: "INVALID_PAYLOAD",
            message: "'shipments' must be a non-empty array",
          },
        });
      }
      // ── 4. Process each item_id ───────────────────────────────────────
      const shipment_responses = [];

      for (const shipment of shipments) {
        const { item_id } = shipment;
        const client = await fastify.pg.connect();
      try {
        if (!item_id) {
          shipment_responses.push({
            item_id: null,
            success: false,
            error_response: {
              code: 400,
              reason: "MISSING_ITEM_ID",
              message: "item_id is required",
            },
          });
          continue;
        }
        const labelRes = await client.query(
          `
SELECT item_id
FROM sorted_bulk_data
WHERE labels @> to_jsonb(ARRAY[$1])
LIMIT 1;
      `,
          [item_id]
        );
        if (!labelRes.rows.length) {
          // await client.query("ROLLBACK");

          shipment_responses.push({
            item_id,
            success: false,
            error_response: {
              code: 404,
              reason: "LABEL_NOT_FOUND",
              message: `Label '${item_id}' not found in sorted_bulk_data.labels`,
            },
          });

          continue;
        }

        const actualItemId = labelRes.rows[0].item_id;

          await client.query("BEGIN");

          // ── Find parcel by item_id ──────────────────────────────────
          const parcelRes = await client.query(
            `SELECT wbn, chute_id FROM parcels WHERE item_id = $1 AND machine_id = $2 LIMIT 1`,
            [actualItemId,machine_id]
          );

          if (!parcelRes.rows.length) {
            await client.query("ROLLBACK");
            shipment_responses.push({
              item_id,
              success: false,
              error_response: {
                code: 404,
                reason: "NOT_FOUND",
                message: `item_id '${item_id}' not found in parcels`,
              },
            });
            continue;
          }

          const { wbn, chute_id } = parcelRes.rows[0];

          // ── Remove wbn from bags_wbn.wbns ───────────────────────────
          // wbn is stored as-is (not split), single array_remove is enough
          await client.query(
            `UPDATE bags_wbn
             SET wbns       = array_remove(wbns, $1::text),
                 updated_at = NOW()
             WHERE bag_code = $2 AND machine_id = $3`,
            [wbn, chute_id, machine_id]
          );

          // ── Remove item_id from bags_wbn.item_ids ───────────────────
          await client.query(
            `UPDATE bags_wbn
             SET item_ids   = array_remove(item_ids, $1::text),
                 updated_at = NOW()
             WHERE bag_code = $2 AND machine_id = $3`,
            [actualItemId, chute_id, machine_id]
          );

          // ── Delete parcel row from parcels table ────────────────────
          await client.query(
            `DELETE FROM parcels WHERE item_id = $1 AND machine_id = $2`,
            [actualItemId,machine_id]
          );
          const apiResponse = { item_id, success: true };
          await client.query(
            `
            INSERT INTO remove_shipment (payload, response,created_at,machine_id)
            VALUES ($1, $2,NOW(),$3)
            `,
            [
              JSON.stringify(req.body),
              JSON.stringify(apiResponse),
              machine_id
            ]
          );

          await client.query("COMMIT");

          fastify.log.info(`✅ removeFromContainer: item_id=${item_id} wbn=${wbn} removed from chute=${chute_id}`);

          shipment_responses.push({ item_id, success: true });
        } catch (err) {
          await client.query("ROLLBACK");
          fastify.log.error(`❌ removeFromContainer error for ${item_id}:`, err.message);

          shipment_responses.push({
            item_id,
            success: false,
            error_response: {
              code: 500,
              reason: "INTERNAL_ERROR",
              message: err.message,
            },
          });
        } finally {
          client.release();
        }
      }

      return reply.code(200).send({ shipment_responses });
    }
  );
}

module.exports = removeFromContainerRoutes;