const { Pool } = require("pg");
const config = require("../config/env");

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseUrl.includes("render.com")
    ? { rejectUnauthorized: false }
    : undefined,
});

pool.on("error", (error) => {
  console.error("PostgreSQL pool error:", error);
});

const query = (text, params) => pool.query(text, params);

module.exports = { pool, query };
