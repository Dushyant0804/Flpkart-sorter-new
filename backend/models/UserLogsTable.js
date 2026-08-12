// models/UserLogsTable.js

const CREATE_USER_LOGS_TABLE = `
  CREATE TABLE IF NOT EXISTS user_logs (
    id         SERIAL                    PRIMARY KEY,
    username   VARCHAR(100)              NOT NULL,
    message    VARCHAR(100)              NOT NULL,
    timestamp  TIMESTAMP                 DEFAULT CURRENT_TIMESTAMP
  );
`;

async function initUserLogsTable(pool) {
  try {
    await pool.query(CREATE_USER_LOGS_TABLE);
  } catch (err) {
    console.error("Failed to init user_logs table:", err.message);
    throw err;
  }
}

module.exports = { initUserLogsTable };