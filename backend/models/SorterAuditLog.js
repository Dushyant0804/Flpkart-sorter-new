// models/SorterAuditLog.js

const CREATE_SORTER_AUDIT_LOG_TABLE = `
  CREATE TABLE IF NOT EXISTS sorter_audit_log (
    id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
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
    CONSTRAINT sorter_audit_log_item_unique UNIQUE (item_id, machine_id)
  );
`;

async function initSorterAuditLogTable(pool) {
  try {
    await pool.query(CREATE_SORTER_AUDIT_LOG_TABLE);
  } catch (err) {
    console.error("Failed to init sorter_audit_log table:", err.message);
    throw err;
  }
}

module.exports = { initSorterAuditLogTable };