// config/pgConnection.js

const { Pool } = require("pg");

const pool = new Pool({
  host:               process.env.PG_HOST     || "127.0.0.1",
  port:               process.env.PG_PORT     || 5432,
  user:               process.env.PG_USER     || "postgres",
  password:           process.env.PG_PASSWORD || "your_password",
  database:           process.env.PG_DB,
  max:                40,
  idleTimeoutMillis:  30000,
});

module.exports = pool;