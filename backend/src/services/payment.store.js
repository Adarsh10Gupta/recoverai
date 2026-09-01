const db = require("../db/database");

async function upsertPayment(payment) {
  let workspaceId =
    payment.workspaceId || null;

  // Safely derive workspace from the local order.
  if (!workspaceId && payment.orderId) {
    const result = await db.query(
      `
      SELECT workspace_id
      FROM orders
      WHERE id = $1
      LIMIT 1
      `,
      [payment.orderId]
    );

    workspaceId =
      result.rows[0]?.workspace_id || null;
  }

  // Never silently assign a payment to the first workspace.
  if (!workspaceId) {
    throw new Error(
      "workspaceId is required for payment storage"
    );
  }

  const result = await db.query(
    `
    INSERT INTO payments (
      workspace_id,
      order_id,
      razorpay_payment_id,
      razorpay_order_id,
      amount_in_subunits,
      currency,
      status,
      method,
      email,
      contact,
      error_code,
      error_description,
      captured_at
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,
      $8,$9,$10,$11,$12,$13
    )

    ON CONFLICT (razorpay_payment_id)
    DO UPDATE SET
      workspace_id =
        COALESCE(
          payments.workspace_id,
          EXCLUDED.workspace_id
        ),

      order_id =
        COALESCE(
          EXCLUDED.order_id,
          payments.order_id
        ),

      razorpay_order_id =
        EXCLUDED.razorpay_order_id,

      amount_in_subunits =
        EXCLUDED.amount_in_subunits,

      currency =
        EXCLUDED.currency,

      status =
        EXCLUDED.status,

      method =
        EXCLUDED.method,

      email =
        EXCLUDED.email,

      contact =
        EXCLUDED.contact,

      error_code =
        EXCLUDED.error_code,

      error_description =
        EXCLUDED.error_description,

      captured_at =
        EXCLUDED.captured_at,

      updated_at = NOW()

    RETURNING *
    `,
    [
      workspaceId,
      payment.orderId || null,
      payment.razorpayPaymentId,
      payment.razorpayOrderId || null,
      payment.amountInSubunits,
      payment.currency,
      payment.status,
      payment.method || null,
      payment.email || null,
      payment.contact || null,
      payment.errorCode || null,
      payment.errorDescription || null,
      payment.capturedAt || null,
    ]
  );

  return result.rows[0];
}

async function getPaymentByRazorpayId(id) {
  const result = await db.query(
    `
    SELECT *
    FROM payments
    WHERE razorpay_payment_id = $1
    LIMIT 1
    `,
    [id]
  );

  return result.rows[0] || null;
}

module.exports = {
  upsertPayment,
  getPaymentByRazorpayId,
};