// models/Parcels.js

const CREATE_PARCELS_TABLE = `
  CREATE TABLE IF NOT EXISTS parcels (
    id                          BIGSERIAL     PRIMARY KEY,
    wbn                         TEXT          NOT NULL UNIQUE,
    item_id                     VARCHAR(100),
    chute_id                    VARCHAR(50),
    expected_chute_id           VARCHAR(50),
    final_chute_id              VARCHAR(50),
    status                      VARCHAR(50),
    reason                      VARCHAR(100),
    source                      VARCHAR(20),
    induct_time                 TIMESTAMP,
    inductapi_sent              BOOLEAN       NOT NULL DEFAULT FALSE,
    induct_payload              JSONB,
    induct_response             JSONB,
    drop_time                   TIMESTAMPTZ,
    drop_notification_sent      BOOLEAN       NOT NULL DEFAULT FALSE,
    drop_notification_payload   JSONB,
    drop_notification_response  JSONB,
    created_at                  TIMESTAMP     NOT NULL DEFAULT NOW(),
    machine_id                  VARCHAR(10),
    CONSTRAINT parcels_item_machine_unique UNIQUE (item_id, machine_id)
  );

  CREATE INDEX IF NOT EXISTS idx_parcels_wbn        ON parcels (wbn);
  CREATE INDEX IF NOT EXISTS idx_parcels_item_id    ON parcels (item_id);
  CREATE INDEX IF NOT EXISTS idx_parcels_created_at ON parcels (created_at DESC);
`;

async function initParcelsTable(pool) {
  try {
    await pool.query(CREATE_PARCELS_TABLE);
  } catch (err) {
    console.error("Failed to init parcels table:", err.message);
    throw err;
  }
}

module.exports = { initParcelsTable };