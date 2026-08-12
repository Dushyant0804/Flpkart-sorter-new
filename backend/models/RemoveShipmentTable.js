// models/RemoveShipmentTable.js

const CREATE_REMOVE_SHIPMENT_TABLE = `
  CREATE TABLE IF NOT EXISTS remove_shipment (
    id          BIGSERIAL                 PRIMARY KEY,
    payload     JSONB,
    response    JSONB,
    created_at  TIMESTAMP,
    machine_id  VARCHAR(10)
  );

  CREATE INDEX IF NOT EXISTS idx_remove_shipment_machine_id ON remove_shipment (machine_id);
`;

async function initRemoveShipmentTable(pool) {
  try {
    await pool.query(CREATE_REMOVE_SHIPMENT_TABLE);
  } catch (err) {
    console.error("Failed to init remove_shipment table:", err.message);
    throw err;
  }
}

module.exports = { initRemoveShipmentTable };