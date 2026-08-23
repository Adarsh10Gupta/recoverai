const db = require("../db/database");

const mapPayment = (row) => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,

    orderId: row.order_id,

    razorpayPaymentId:
      row.razorpay_payment_id,

    razorpayOrderId:
      row.razorpay_order_id,

    amountInSubunits:
      Number(row.amount_in_subunits),

    amount:
      Number(row.amount_in_subunits) / 100,

    currency:
      row.currency,

    status:
      row.status,

    method:
      row.method,

    email:
      row.email,

    contact:
      row.contact,

    errorCode:
      row.error_code,

    errorDescription:
      row.error_description,

    capturedAt:
      row.captured_at,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
};


const upsertPayment = async ({
  orderId,
  razorpayPaymentId,
  razorpayOrderId,
  amountInSubunits,
  currency,
  status,
  method,
  email,
  contact,
  errorCode,
  errorDescription,
  capturedAt,
}) => {
  const result = await db.query(
    `
    INSERT INTO payments (
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
      captured_at,
      created_at,
      updated_at
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW()
    )

    ON CONFLICT (razorpay_payment_id)
    DO UPDATE SET
      order_id = EXCLUDED.order_id,
      razorpay_order_id = EXCLUDED.razorpay_order_id,
      amount_in_subunits = EXCLUDED.amount_in_subunits,
      currency = EXCLUDED.currency,
      status = EXCLUDED.status,
      method = EXCLUDED.method,
      email = EXCLUDED.email,
      contact = EXCLUDED.contact,
      error_code = EXCLUDED.error_code,
      error_description = EXCLUDED.error_description,
      captured_at =
        COALESCE(
          EXCLUDED.captured_at,
          payments.captured_at
        ),
      updated_at = NOW()

    RETURNING *
    `,
    [
      orderId,
      razorpayPaymentId,
      razorpayOrderId,
      amountInSubunits,
      currency,
      status,
      method || null,
      email || null,
      contact || null,
      errorCode || null,
      errorDescription || null,
      capturedAt || null,
    ]
  );

  return mapPayment(result.rows[0]);
};


const getPaymentByRazorpayId = async (
  razorpayPaymentId
) => {
  const result = await db.query(
    `
    SELECT *
    FROM payments
    WHERE razorpay_payment_id = $1
    `,
    [razorpayPaymentId]
  );

  return mapPayment(result.rows[0]);
};


const getPaymentsByOrderId = async (
  razorpayOrderId
) => {
  const result = await db.query(
    `
    SELECT *
    FROM payments
    WHERE razorpay_order_id = $1
    ORDER BY created_at ASC
    `,
    [razorpayOrderId]
  );

  return result.rows.map(mapPayment);
};


module.exports = {
  upsertPayment,
  getPaymentByRazorpayId,
  getPaymentsByOrderId,
};
