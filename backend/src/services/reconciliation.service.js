const razorpayService = require("./razorpay.service");
const orderStore = require("./order.store");
const paymentStore = require("./payment.store");
const incidentService = require("./incident.service");
const auditService = require("./audit.service");
const connectionService = require("./razorpay.connection.service");

async function reconcileOrder(
  merchantOrderId,
  workspaceId
) {
  if (!workspaceId) {
    throw new Error("workspaceId is required");
  }

  const localOrder = await orderStore.getOrder(
    merchantOrderId,
    workspaceId
  );

  if (!localOrder) {
    throw new Error("Local order not found");
  }

  const connection =
    await connectionService.getConnectionSecrets(
      workspaceId
    );

  const accessToken = connection?.accessToken;

  const razorpayOrder =
    await razorpayService.fetchOrder(
      localOrder.razorpay_order_id,
      accessToken
    );

  const payments =
    await razorpayService.fetchOrderPayments(
      localOrder.razorpay_order_id,
      accessToken
    );

  const mismatches = [];

  /*
   * ORDER AMOUNT
   */
  if (
    Number(razorpayOrder.amount) !==
    Number(localOrder.amount_in_subunits)
  ) {
    mismatches.push({
      type: "AMOUNT_MISMATCH",
      expected: Number(
        localOrder.amount_in_subunits
      ),
      actual: Number(razorpayOrder.amount),
    });
  }

  /*
   * ORDER CURRENCY
   */
  if (
    razorpayOrder.currency !==
    localOrder.currency
  ) {
    mismatches.push({
      type: "CURRENCY_MISMATCH",
      expected: localOrder.currency,
      actual: razorpayOrder.currency,
    });
  }

  /*
   * Persist every Razorpay payment belonging
   * to this order.
   */
  for (const payment of payments.items || []) {
    await paymentStore.upsertPayment({
      workspaceId,
      orderId: localOrder.id,
      razorpayPaymentId: payment.id,
      razorpayOrderId: payment.order_id,
      amountInSubunits: payment.amount,
      currency: payment.currency,
      status: payment.status,
      method: payment.method,
      email: payment.email,
      contact: payment.contact,
      errorCode: payment.error_code,
      errorDescription: payment.error_description,
      capturedAt:
        payment.status === "captured"
          ? new Date()
          : null,
    });

    /*
     * PAYMENT AMOUNT
     */
    if (
      Number(payment.amount) !==
      Number(localOrder.amount_in_subunits)
    ) {
      mismatches.push({
        type: "PAYMENT_AMOUNT_MISMATCH",
        paymentId: payment.id,
        expected: Number(
          localOrder.amount_in_subunits
        ),
        actual: Number(payment.amount),
      });
    }

    /*
     * PAYMENT CURRENCY
     */
    if (
      payment.currency !== localOrder.currency
    ) {
      mismatches.push({
        type: "PAYMENT_CURRENCY_MISMATCH",
        paymentId: payment.id,
        expected: localOrder.currency,
        actual: payment.currency,
      });
    }
  }

  /*
   * PAYMENT CAPTURED
   */
  const capturedPayment =
    (payments.items || []).find(
      (payment) => payment.status === "captured"
    );

  if (
    capturedPayment &&
    !["captured", "paid"].includes(
      localOrder.status
    )
  ) {
    await orderStore.updateStatus(
      localOrder.id,
      "captured",
      {
        captured_at: new Date(),
      },
      workspaceId
    );
  }

  /*
   * RAZORPAY ORDER PAID
   */
  if (
    razorpayOrder.status === "paid" &&
    localOrder.status !== "paid"
  ) {
    await orderStore.updateStatus(
      localOrder.id,
      "paid",
      {
        paid_at: new Date(),
      },
      workspaceId
    );
  }

  const freshOrder =
    await orderStore.getOrder(
      merchantOrderId,
      workspaceId
    );

  /*
   * If Razorpay says paid, local DB MUST say paid.
   */
  if (
    razorpayOrder.status === "paid" &&
    freshOrder.status !== "paid"
  ) {
    mismatches.push({
      type: "LOCAL_STATE_STALE",
      expected: "paid",
      actual: freshOrder.status,
    });
  }

  /*
   * Create incidents for genuine mismatches.
   */
  for (const mismatch of mismatches) {
    await incidentService.createIncident({
      workspaceId,
      orderId: localOrder.id,
      type: mismatch.type,
      severity:
        mismatch.type.includes("AMOUNT")
          ? "critical"
          : "high",
      description:
        `Reconciliation detected ${mismatch.type}.`,
      expectedState: {
        localOrder: freshOrder,
      },
      actualState: {
        razorpayOrder,
        mismatch,
      },
    });
  }

  await auditService.log({
    entityType: "ORDER",
    entityId: localOrder.id,
    action: "ORDER_RECONCILED",
    metadata: {
      merchantOrderId,
      razorpayOrderId:
        localOrder.razorpay_order_id,
      workspaceId,
      mismatchCount: mismatches.length,
    },
  });

  return {
    matched: mismatches.length === 0,
    merchantOrderId,
    localOrder: freshOrder,
    razorpayOrder,
    razorpayPayments:
      payments.items || [],
    mismatches,
  };
}

module.exports = {
  reconcileOrder,
};