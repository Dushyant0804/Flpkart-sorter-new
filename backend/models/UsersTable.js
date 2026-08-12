// models/UsersTable.js

const CREATE_USERS_TABLE = `
  CREATE TABLE IF NOT EXISTS users (
    id          SERIAL                    PRIMARY KEY,
    username    VARCHAR(1000)             NOT NULL UNIQUE,
    password    VARCHAR(255)              NOT NULL,
    role        VARCHAR(50)               DEFAULT 'user',
    created_at  TIMESTAMP                 DEFAULT CURRENT_TIMESTAMP
  );
`;

async function initUsersTable(pool) {
  try {
    await pool.query(CREATE_USERS_TABLE);
  } catch (err) {
    console.error("Failed to init users table:", err.message);
    throw err;
  }
}

module.exports = { initUsersTable };