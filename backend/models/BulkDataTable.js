// models/BulkDataTable.js

const CREATE_BULK_DATA_TABLE = `
  CREATE TABLE IF NOT EXISTS bulk_data (
    item_id      VARCHAR(100)              PRIMARY KEY,
    labels       JSONB                     NOT NULL DEFAULT '[]',
    type         VARCHAR(50),
    sort_code    JSONB                     NOT NULL DEFAULT '[]',
    timestamp    BIGINT                    NOT NULL,
    received_at  TIMESTAMPTZ               NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_bulk_data_item_id     ON bulk_data (item_id);
  CREATE INDEX IF NOT EXISTS idx_bulk_data_labels_gin  ON bulk_data USING GIN (labels);
  CREATE INDEX IF NOT EXISTS idx_bulk_data_received_at ON bulk_data (received_at);
`;

async function initBulkDataTable(pool) {
  try {
    await pool.query(CREATE_BULK_DATA_TABLE);
  } catch (err) {
    console.error("Failed to init bulk_data table:", err.message);
    throw err;
  }
}

module.exports = { initBulkDataTable };