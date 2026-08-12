

const CREATE_LABEL_CONFIGURATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS label_configurations (
    label_type    VARCHAR(50)  NOT NULL PRIMARY KEY,
    label_regex   TEXT         NOT NULL,
    label_fields  JSONB        NOT NULL DEFAULT '[]',
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  );
`;

async function initLabelConfigurationsTable(pool) {
  try {
    await pool.query(CREATE_LABEL_CONFIGURATIONS_TABLE);
    // console.log("label_configurations table ready");
  } catch (err) {
    console.error("Failed to init label_configurations table:", err.message);
    throw err;
  }
}

module.exports = { initLabelConfigurationsTable };