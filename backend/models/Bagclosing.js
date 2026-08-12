// models/Bagclosing.js

const CREATE_BAG_CLOSING_TABLE = `
  CREATE TABLE IF NOT EXISTS bag_closing (
    id                  BIGSERIAL     PRIMARY KEY,
    chute_id            VARCHAR(50)   NOT NULL,
    wbns                TEXT[]        NOT NULL DEFAULT ARRAY[]::TEXT[],
    bag_close_payload   JSONB,
    bag_close_response  JSONB,
    bag_closed_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    item_ids            TEXT[]        NOT NULL DEFAULT '{}',
    machine_id          VARCHAR(10)
  );

  CREATE INDEX IF NOT EXISTS idx_bag_closing_chute_id     ON bag_closing (chute_id);
  CREATE INDEX IF NOT EXISTS idx_bag_closing_bag_closed_at ON bag_closing (bag_closed_at DESC);
  CREATE INDEX IF NOT EXISTS idx_bag_closing_machine_id   ON bag_closing (machine_id);
`;

async function initBagClosingTable(pool) {
  try {
    await pool.query(CREATE_BAG_CLOSING_TABLE);
  } catch (err) {
    console.error("Failed to init bag_closing table:", err.message);
    throw err;
  }
}

module.exports = { initBagClosingTable };