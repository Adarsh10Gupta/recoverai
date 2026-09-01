require("dotenv").config();

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function main() {
  const result = await pool.query(`
    SELECT
      o.merchant_order_id,
      o.razorpay_order_id,
      o.amount_in_subunits,
      o.status,
      o.workspace_id,
      w.name AS workspace_name,
      w.slug AS workspace_slug
    FROM orders o
    LEFT JOIN workspaces w
      ON w.id = o.workspace_id
    ORDER BY o.created_at DESC
    LIMIT 5
  `);

  console.table(result.rows);

  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
});