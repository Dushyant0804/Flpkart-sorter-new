// models/PreviousBulkDataTable.js

const CREATE_PREVIOUS_BULK_DATA_TABLE = `
  CREATE TABLE IF NOT EXISTS previous_bulk_data (
    id           SERIAL                    PRIMARY KEY,
    item_id      VARCHAR(100)              NOT NULL,
    labels       JSONB                     NOT NULL DEFAULT '[]',
    type         VARCHAR(50),
    sort_code    JSONB                     NOT NULL DEFAULT '[]',
    timestamp    BIGINT                    NOT NULL,
    replaced_at  TIMESTAMPTZ               NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_previous_bulk_data_item_id     ON previous_bulk_data (item_id);
  CREATE INDEX IF NOT EXISTS idx_previous_bulk_data_replaced_at ON previous_bulk_data (replaced_at);
`;

async function initPreviousBulkDataTable(pool) {
  try {
    await pool.query(CREATE_PREVIOUS_BULK_DATA_TABLE);
  } catch (err) {
    console.error("Failed to init previous_bulk_data table:", err.message);
    throw err;
  }
}

module.exports = { initPreviousBulkDataTable };