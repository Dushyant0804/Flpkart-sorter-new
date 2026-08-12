

const CREATE_CHUTE_THRESHOLDS_TABLE = `
  CREATE TABLE IF NOT EXISTS chute_thresholds (
    chute_id    VARCHAR(50)   NOT NULL PRIMARY KEY,
    max_weight  JSONB,
    max_volume  JSONB,
    max_items   JSONB,
    type        VARCHAR(50),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
  );
`;

/**
 * Runs on server start — creates the table if it doesn't exist yet.
 * @param {import('pg').Pool} pool
 */
async function initChuteThresholdsTable(pool) {
  try {
    await pool.query(CREATE_CHUTE_THRESHOLDS_TABLE);
    // console.log("chute_thresholds table ready");
  } catch (err) {
    console.error("Failed to init chute_thresholds table:", err.message);
    throw err;
  }
}

module.exports = { initChuteThresholdsTable };