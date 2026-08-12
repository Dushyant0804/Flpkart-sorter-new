// models/Sortedbulkdata.js

const CREATE_SORTED_BULK_DATA_TABLE = `
  CREATE TABLE IF NOT EXISTS sorted_bulk_data (
    item_id      VARCHAR(100)              PRIMARY KEY,
    labels       JSONB                     NOT NULL DEFAULT '[]',
    type         VARCHAR(50),
    sort_code    JSONB                     NOT NULL DEFAULT '[]',
    timestamp    BIGINT                    NOT NULL,
    received_at  TIMESTAMPTZ               NOT NULL,
    moved_at     TIMESTAMPTZ               NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_sorted_bulk_data_item_id  ON sorted_bulk_data (item_id);
  CREATE INDEX IF NOT EXISTS idx_sorted_bulk_data_moved_at ON sorted_bulk_data (moved_at DESC);
`;

async function initSortedBulkDataTable(pool) {
  try {
    await pool.query(CREATE_SORTED_BULK_DATA_TABLE);
  } catch (err) {
    console.error("Failed to init sorted_bulk_data table:", err.message);
    throw err;
  }
}

module.exports = { initSortedBulkDataTable };