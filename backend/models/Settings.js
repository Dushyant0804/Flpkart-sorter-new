// models/Settings.js

const CREATE_SETTINGS_TABLE = `
  CREATE TABLE IF NOT EXISTS settings (
    id               SERIAL                    PRIMARY KEY,
    sorter_name      VARCHAR(255),
    state            VARCHAR(255),
    center_name      VARCHAR(255),
    facility_id      VARCHAR(255),
    installation_id  VARCHAR(255),
    client_id        VARCHAR(255),
    client_secret    VARCHAR(255),
    grant_type       VARCHAR(255),
    target_client_id VARCHAR(255),
    fk_client_id     VARCHAR(255),
    fk_host_url      VARCHAR(255),
    authn_ip         VARCHAR(255),
    expires_at       TIMESTAMPTZ,
    created_at       TIMESTAMP                 DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP                 DEFAULT CURRENT_TIMESTAMP,
    machine_id       VARCHAR(10)
  );

  CREATE INDEX IF NOT EXISTS idx_settings_facility_id     ON settings (facility_id);
  CREATE INDEX IF NOT EXISTS idx_settings_installation_id ON settings (installation_id);
  CREATE INDEX IF NOT EXISTS idx_settings_machine_id      ON settings (machine_id);
`;

/**
 * NOTE: no auto-seed here — settings is now ONE ROW PER MACHINE (facility_id,
 * installation_id, client_id, etc. differ per row), so there's no single
 * sensible "default row" to insert automatically. Each machine's row must
 * be inserted manually (or via a settings-management route/UI) after this
 * table is created.
 * @param {import('pg').Pool} pool
 */
async function initSettingsTable(pool) {
  try {
    await pool.query(CREATE_SETTINGS_TABLE);
  } catch (err) {
    console.error("Failed to init settings table:", err.message);
    throw err;
  }
}

module.exports = { initSettingsTable };