require("dotenv").config();

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  try {
    console.log("\n===== LATEST ORDERS =====");

    const orders = await pool.query(`
      SELECT
        merchant_order_id,
        razorpay_order_id,
        status,
        amount_in_subunits,
        currency,
        paid_at,
        created_at
      FROM orders
      ORDER BY created_at DESC
      LIMIT 5
    `);

    console.table(orders.rows);

    console.log("\n===== LATEST PAYMENTS =====");

    const payments = await pool.query(`
      SELECT
        razorpay_payment_id,
        razorpay_order_id,
        status,
        method,
        amount_in_subunits,
        currency,
        captured_at,
        created_at
      FROM payments
      ORDER BY created_at DESC
      LIMIT 5
    `);

    console.table(payments.rows);

    console.log("\n===== LATEST WEBHOOK EVENTS =====");

    const webhooks = await pool.query(`
      SELECT
        razorpay_event_id,
        event_type,
        status,
        attempts,
        received_at,
        processed_at,
        error_message
      FROM webhook_events
      ORDER BY received_at DESC
      LIMIT 10
    `);

    console.table(webhooks.rows);

    console.log("\n===== LATEST AUDIT LOGS =====");

    const audits = await pool.query(`
      SELECT
        entity_type,
        action,
        actor,
        created_at
      FROM audit_logs
      ORDER BY created_at DESC
      LIMIT 10
    `);

    console.table(audits.rows);

    console.log("\n===== PAYMENT VERIFICATION CHECK COMPLETE =====");
  } catch (error) {
    console.error("\nDATABASE CHECK FAILED:");
    console.error(error);
  } finally {
    await pool.end();
  }
}

run();