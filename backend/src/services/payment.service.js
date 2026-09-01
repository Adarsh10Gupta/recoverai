const crypto = require("crypto");

const config = require("../config/env");
const orderStore = require("./order.store");
const paymentStore = require("./payment.store");
const auditService = require("./audit.service");
const incidentService = require("./incident.service");
const razorpayService = require("./razorpay.service");


async function verifyPaymentSignature({
  merchantOrderId,
  paymentId,
  signature,
  workspaceId,
}) {
  if (!workspaceId) {
    return {
      verified: false,
      reason: "Workspace is required",
    };
  }

  /*
   * Find the local order inside the
   * correct workspace.
   */
  const order = await orderStore.getOrder(
    merchantOrderId,
    workspaceId
  );

  if (!order) {
    return {
      verified: false,
      reason: "Order not found",
    };
  }


  /*
   * Verify Razorpay checkout signature.
   *
   * Razorpay signs:
   *
   * razorpay_order_id|razorpay_payment_id
   */
  const payload =
    `${order.razorpayOrderId}|${paymentId}`;

  const expected = crypto
    .createHmac(
      "sha256",
      config.razorpayKeySecret
    )
    .update(payload)
    .digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature || "");

  if (
    a.length !== b.length ||
    !crypto.timingSafeEqual(a, b)
  ) {
    await incidentService.createIncident({
      workspaceId,
      orderId: order.id,

      type:
        "PAYMENT_SIGNATURE_VERIFICATION_FAILED",

      severity: "critical",

      description:
        "Checkout payment signature verification failed.",

      expectedState: {
        signature: "valid",
      },

      actualState: {
        signature: "invalid",
        paymentId,
      },
    });

    await auditService.log({
      entityType: "ORDER",
      entityId: order.id,

      action:
        "SIGNATURE_VERIFICATION_FAILED",

      metadata: {
        paymentId,
        workspaceId,
      },
    });

    return {
      verified: false,
      reason: "Invalid payment signature",
    };
  }


  /*
   * Signature is valid.
   *
   * Now fetch the authoritative payment
   * object directly from Razorpay.
   */
  let razorpayPayment;

  try {
    razorpayPayment =
      await razorpayService.fetchPayment(
        paymentId
      );
  } catch (error) {
    console.error(
      "Failed to fetch Razorpay payment:",
      error
    );

    return {
      verified: false,
      reason:
        "Payment signature verified, but Razorpay payment could not be fetched",
    };
  }


  /*
   * Make absolutely sure the payment
   * belongs to this order.
   */
  if (
    razorpayPayment.order_id !==
    order.razorpayOrderId
  ) {
    await incidentService.createIncident({
      workspaceId,
      orderId: order.id,

      type:
        "PAYMENT_ORDER_MISMATCH",

      severity: "critical",

      description:
        "Razorpay payment does not belong to the expected order.",

      expectedState: {
        razorpayOrderId:
          order.razorpayOrderId,
      },

      actualState: {
        razorpayOrderId:
          razorpayPayment.order_id,
        paymentId,
      },
    });

    return {
      verified: false,
      reason:
        "Payment does not belong to this order",
    };
  }


  /*
   * Validate payment amount.
   */
  if (
    Number(razorpayPayment.amount) !==
    Number(order.amountInSubunits)
  ) {
    await incidentService.createIncident({
      workspaceId,
      orderId: order.id,

      type:
        "PAYMENT_AMOUNT_MISMATCH",

      severity: "critical",

      description:
        "Razorpay payment amount does not match the local order amount.",

      expectedState: {
        amount:
          Number(order.amountInSubunits),
      },

      actualState: {
        amount:
          Number(razorpayPayment.amount),
      },
    });

    return {
      verified: false,
      reason:
        "Payment amount does not match order amount",
    };
  }


  /*
   * Validate currency.
   */
  if (
    razorpayPayment.currency !==
    order.currency
  ) {
    await incidentService.createIncident({
      workspaceId,
      orderId: order.id,

      type:
        "PAYMENT_CURRENCY_MISMATCH",

      severity: "critical",

      description:
        "Razorpay payment currency does not match the local order currency.",

      expectedState: {
        currency: order.currency,
      },

      actualState: {
        currency:
          razorpayPayment.currency,
      },
    });

    return {
      verified: false,
      reason:
        "Payment currency does not match order currency",
    };
  }


  /*
   * Store the actual Razorpay payment
   * in our local database.
   *
   * This is the part that was missing
   * from your previous implementation.
   */
  const storedPayment =
    await paymentStore.upsertPayment({
      workspaceId,

      orderId:
        order.id,

      razorpayPaymentId:
        razorpayPayment.id,

      razorpayOrderId:
        razorpayPayment.order_id,

      amountInSubunits:
        razorpayPayment.amount,

      currency:
        razorpayPayment.currency,

      status:
        razorpayPayment.status,

      method:
        razorpayPayment.method,

      email:
        razorpayPayment.email,

      contact:
        razorpayPayment.contact,

      errorCode:
        razorpayPayment.error_code,

      errorDescription:
        razorpayPayment.error_description,

      capturedAt:
        razorpayPayment.status === "captured"
          ? new Date()
          : null,
    });


  /*
   * Update local order state.
   */
  const isCaptured =
    razorpayPayment.status === "captured";


  const updatedOrder =
    await orderStore.updateStatus(
      order.id,

      isCaptured
        ? "paid"
        : "verified",

      {
        verified_at:
          new Date(),

        captured_at:
          isCaptured
            ? new Date()
            : null,

        paid_at:
          isCaptured
            ? new Date()
            : null,
      },

      workspaceId
    );


  await auditService.log({
    entityType: "ORDER",

    entityId: order.id,

    action:
      "PAYMENT_SIGNATURE_VERIFIED",

    metadata: {
      paymentId,

      razorpayPaymentId:
        razorpayPayment.id,

      paymentStatus:
        razorpayPayment.status,

      workspaceId,
    },
  });


  return {
    verified: true,

    order:
      updatedOrder,

    payment:
      storedPayment,
  };
}


module.exports = {
  verifyPaymentSignature,
};