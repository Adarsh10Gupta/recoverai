const db = require("../db/database");

const mapOrder = (row) => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,

    merchantOrderId:
      row.merchant_order_id,

    razorpayOrderId:
      row.razorpay_order_id,

    amountInSubunits:
      Number(row.amount_in_subunits),

    amount:
      Number(row.amount_in_subunits) / 100,

    currency:
      row.currency,

    receipt:
      row.receipt,

    status:
      row.status,

    verifiedAt:
      row.verified_at,

    capturedAt:
      row.captured_at,

    paidAt:
      row.paid_at,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
};


const saveOrder = async (order) => {
  const result = await db.query(
    `
    INSERT INTO orders (
      merchant_order_id,
      razorpay_order_id,
      amount_in_subunits,
      currency,
      receipt,
      status,
      created_at,
      updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())

    ON CONFLICT (merchant_order_id)
    DO UPDATE SET
      razorpay_order_id = EXCLUDED.razorpay_order_id,
      amount_in_subunits = EXCLUDED.amount_in_subunits,
      currency = EXCLUDED.currency,
      receipt = EXCLUDED.receipt,
      status = EXCLUDED.status,
      updated_at = NOW()

    RETURNING *
    `,
    [
      order.merchantOrderId,
      order.razorpayOrderId,
      order.amountInSubunits,
      order.currency,
      order.receipt,
      order.status,
    ]
  );

  return mapOrder(result.rows[0]);
};


const getOrder = async (merchantOrderId) => {
  const result = await db.query(
    `
    SELECT *
    FROM orders
    WHERE merchant_order_id = $1
    `,
    [merchantOrderId]
  );

  return mapOrder(result.rows[0]);
};


const getOrderByRazorpayOrderId = async (
  razorpayOrderId
) => {
  const result = await db.query(
    `
    SELECT *
    FROM orders
    WHERE razorpay_order_id = $1
    `,
    [razorpayOrderId]
  );

  return mapOrder(result.rows[0]);
};


const updateOrderStatus = async ({
  razorpayOrderId,
  status,
  verifiedAt = null,
  capturedAt = null,
  paidAt = null,
}) => {
  const result = await db.query(
    `
    UPDATE orders
    SET
      status = $2,

      verified_at =
        COALESCE($3::timestamptz, verified_at),

      captured_at =
        COALESCE($4::timestamptz, captured_at),

      paid_at =
        COALESCE($5::timestamptz, paid_at),

      updated_at = NOW()

    WHERE razorpay_order_id = $1

    RETURNING *
    `,
    [
      razorpayOrderId,
      status,
      verifiedAt,
      capturedAt,
      paidAt,
    ]
  );

  return mapOrder(result.rows[0]);
};


module.exports = {
  saveOrder,
  getOrder,
  getOrderByRazorpayOrderId,
  updateOrderStatus,
};
