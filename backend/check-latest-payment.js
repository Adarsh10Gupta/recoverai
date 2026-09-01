require("dotenv").config();

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const result = await pool.query(`
    SELECT
      o.merchant_order_id,
      o.razorpay_order_id,
      o.status AS order_status,
      o.workspace_id,

      p.id AS local_payment_id,
      p.razorpay_payment_id,
      p.razorpay_order_id AS payment_razorpay_order_id,
      p.status AS payment_status,
      p.amount_in_subunits,
      p.currency,
      p.method,
      p.captured_at

    FROM orders o

    LEFT JOIN payments p
      ON p.order_id = o.id

    WHERE o.razorpay_order_id = 'order_TWMexbuZ1dhysL'

    ORDER BY p.created_at DESC;
  `);

  console.table(result.rows);
}

main()
  .catch(console.error)
  .finally(() => pool.end());