const { Pool } = require("pg");
const config = require("../config/env");

if (!config.databaseUrl) {
  throw new Error("DATABASE_URL is not configured.");
}

const useSSL =
  process.env.DATABASE_SSL === "true";

const pool = new Pool({
  connectionString: config.databaseUrl,

  ssl: useSSL
    ? {
        rejectUnauthorized: false,
      }
    : false,

  max: Number(process.env.DATABASE_POOL_MAX || 10),

  connectionTimeoutMillis: 10000,

  idleTimeoutMillis: 30000,
});

pool.on("error", (error) => {
  console.error(
    "Unexpected PostgreSQL pool error:",
    error
  );
});

const query = (text, params) => {
  return pool.query(text, params);
};

const getClient = () => {
  return pool.connect();
};

module.exports = {
  pool,
  query,
  getClient,
};
