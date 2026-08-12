// models/AuthTable.js

const CREATE_AUTH_TABLE = `
  CREATE TABLE IF NOT EXISTS auth_table (
    id                INTEGER   NOT NULL PRIMARY KEY CHECK (id = 1),
    access_token      TEXT      NOT NULL,
    expires_in        INTEGER   NOT NULL DEFAULT 0,
    token_fetched_at  TIMESTAMP,
    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;

async function initAuthTable(pool) {
  try {
    await pool.query(CREATE_AUTH_TABLE);
  } catch (err) {
    console.error("Failed to init auth_table table:", err.message);
    throw err;
  }
}

module.exports = { initAuthTable };