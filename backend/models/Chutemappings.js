// models/Chutemappings.js

const MACHINE_IDS = ["m01", "m02", "m03", "m04", "m05"];

function createTableSql(tableName) {
  return `
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id              SERIAL                     PRIMARY KEY,
      chute_id        VARCHAR(50)                NOT NULL UNIQUE,
      strategy        VARCHAR(100),
      bag_code        JSONB                      NOT NULL DEFAULT '[]',
      sort_code_list  JSONB                      NOT NULL DEFAULT '[]',
      chute_code      TEXT,
      created_at      TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ                NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_${tableName}_chute_id
      ON ${tableName} (chute_id);
  `;
}

/**
 * Creates one chute_mappings_<machine_id> table PER machine
 * (e.g. chute_mappings_m01, chute_mappings_m02, ...) — matches how
 * sortEngineWorker.js / dropNotificationWorker.js / bagCloseWorker.js
 * query `chute_mappings_${machine_id}` per machine.
 * @param {import('pg').Pool} pool
 */
async function initChuteMappingsTable(pool) {
  try {
    for (const machine_id of MACHINE_IDS) {
      const tableName = `chute_mappings_${machine_id}`;
      await pool.query(createTableSql(tableName));
    }
  } catch (err) {
    console.log("Failed to init chute_mappings_<machine_id> tables:", err.message);
    throw err;
  }
}

module.exports = { initChuteMappingsTable, MACHINE_IDS };