// models/Bagswbn.js

const CREATE_BAGS_WBN_TABLE = `
  CREATE TABLE IF NOT EXISTS bags_wbn (
    id            BIGSERIAL     PRIMARY KEY,
    bag_code      VARCHAR(50)   NOT NULL,
    wbns          TEXT[]        DEFAULT ARRAY[]::TEXT[],
    item_ids      TEXT[],
    first_drop_at TIMESTAMPTZ,
    updated_at    TIMESTAMPTZ   DEFAULT NOW(),
    machine_id    VARCHAR(10),
    CONSTRAINT uq_bags_wbn_bag_machine UNIQUE (bag_code, machine_id)
  );

  CREATE INDEX IF NOT EXISTS idx_bags_wbn_bag_code ON bags_wbn (bag_code);
  CREATE INDEX IF NOT EXISTS idx_bags_wbn_wbns     ON bags_wbn USING GIN (wbns);
`;

async function initBagsWbnTable(pool) {
  try {
    await pool.query(CREATE_BAGS_WBN_TABLE);
  } catch (err) {
    console.error("Failed to init bags_wbn table:", err.message);
    throw err;
  }
}

module.exports = { initBagsWbnTable };