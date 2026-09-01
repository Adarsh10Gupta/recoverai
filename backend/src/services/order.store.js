const db = require("../db/database");

const mapOrder = (row) => {
  if (!row) return null;

  return {
    id: row.id,
    merchantOrderId: row.merchant_order_id,
    razorpayOrderId: row.razorpay_order_id,
    workspaceId: row.workspace_id,

    amountInSubunits: Number(row.amount_in_subunits),
    amount: Number(row.amount_in_subunits) / 100,

    currency: row.currency,
    receipt: row.receipt,
    status: row.status,

    verifiedAt: row.verified_at,
    capturedAt: row.captured_at,
    paidAt: row.paid_at,

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};


/**
 * Save a newly-created Razorpay order.
 */
const saveOrder = async (order) => {
  if (!order.workspaceId) {
    throw new Error("workspaceId is required");
  }

  const result = await db.query(
    `
    INSERT INTO orders (
      merchant_order_id,
      razorpay_order_id,
      workspace_id,
      amount_in_subunits,
      currency,
      receipt,
      status,
      created_at,
      updated_at
    )
    VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      NOW(),
      NOW()
    )

    ON CONFLICT (merchant_order_id)
    DO UPDATE SET
      razorpay_order_id = EXCLUDED.razorpay_order_id,
      workspace_id = EXCLUDED.workspace_id,
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
      order.workspaceId,
      order.amountInSubunits,
      order.currency,
      order.receipt,
      order.status || "created",
    ]
  );

  return mapOrder(result.rows[0]);
};


/**
 * Get an order by merchant order ID inside a workspace.
 */
const getOrder = async (
  merchantOrderId,
  workspaceId
) => {
  if (!workspaceId) {
    throw new Error("workspaceId is required");
  }

  const result = await db.query(
    `
    SELECT *
    FROM orders
    WHERE merchant_order_id = $1
      AND workspace_id = $2
    LIMIT 1
    `,
    [
      merchantOrderId,
      workspaceId,
    ]
  );

  return mapOrder(result.rows[0]);
};


/**
 * Get order by local UUID.
 */
const getOrderById = async (
  id,
  workspaceId
) => {
  if (!workspaceId) {
    throw new Error("workspaceId is required");
  }

  const result = await db.query(
    `
    SELECT *
    FROM orders
    WHERE id = $1
      AND workspace_id = $2
    LIMIT 1
    `,
    [
      id,
      workspaceId,
    ]
  );

  return mapOrder(result.rows[0]);
};


/**
 * Get order by Razorpay order ID.
 *
 * This method is particularly important for webhooks.
 */
const getOrderByRazorpayOrderId = async (
  razorpayOrderId,
  workspaceId
) => {
  if (!workspaceId) {
    throw new Error("workspaceId is required");
  }

  const result = await db.query(
    `
    SELECT *
    FROM orders
    WHERE razorpay_order_id = $1
      AND workspace_id = $2
    LIMIT 1
    `,
    [
      razorpayOrderId,
      workspaceId,
    ]
  );

  return mapOrder(result.rows[0]);
};


/**
 * Generic status updater used throughout V4.
 */
const updateStatus = async (
  id,
  status,
  timestamps = {},
  workspaceId
) => {
  if (!workspaceId) {
    throw new Error("workspaceId is required");
  }

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

    WHERE id = $1
      AND workspace_id = $6

    RETURNING *
    `,
    [
      id,
      status,
      timestamps.verified_at || null,
      timestamps.captured_at || null,
      timestamps.paid_at || null,
      workspaceId,
    ]
  );

  return mapOrder(result.rows[0]);
};


/**
 * Backwards-compatible Razorpay-order-ID status updater.
 */
const updateOrderStatus = async ({
  razorpayOrderId,
  status,
  verifiedAt = null,
  capturedAt = null,
  paidAt = null,
  workspaceId,
}) => {
  if (!workspaceId) {
    throw new Error("workspaceId is required");
  }

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
      AND workspace_id = $6

    RETURNING *
    `,
    [
      razorpayOrderId,
      status,
      verifiedAt,
      capturedAt,
      paidAt,
      workspaceId,
    ]
  );

  return mapOrder(result.rows[0]);
};


module.exports = {
  saveOrder,
  getOrder,
  getOrderById,
  getOrderByRazorpayOrderId,
  updateStatus,
  updateOrderStatus,
};