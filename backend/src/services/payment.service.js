const crypto = require("crypto");

const config = require("../config/env");

const orderStore = require("./order.store");
const paymentStore = require("./payment.store");
const auditService = require("./audit.service");
const incidentService = require("./incident.service");
const razorpayService = require("./razorpay.service");


const verifyPaymentSignature = async ({
  merchantOrderId,
  paymentId,
  signature,
}) => {
  const order =
    await orderStore.getOrder(
      merchantOrderId
    );

  if (!order) {
    return {
      verified: false,
      reason: "Order not found",
    };
  }


  const payload =
    `${order.razorpayOrderId}|${paymentId}`;


  const expectedSignature =
    crypto
      .createHmac(
        "sha256",
        config.razorpayKeySecret
      )
      .update(payload)
      .digest("hex");


  const expectedBuffer =
    Buffer.from(
      expectedSignature,
      "utf8"
    );

  const receivedBuffer =
    Buffer.from(
      signature || "",
      "utf8"
    );


  if (
    expectedBuffer.length !==
      receivedBuffer.length ||
    !crypto.timingSafeEqual(
      expectedBuffer,
      receivedBuffer
    )
  ) {
    await auditService.log({
      entityType: "PAYMENT",
      entityId: paymentId,
      action: "SIGNATURE_VERIFICATION_FAILED",
      metadata: {
        merchantOrderId,
      },
    });

    return {
      verified: false,
      reason: "Invalid payment signature",
    };
  }


  const razorpayPayment =
    await razorpayService.fetchPayment(
      paymentId
    );


  if (
    razorpayPayment.order_id !==
    order.razorpayOrderId
  ) {
    await incidentService.createIncident({
      orderId: order.id,
      type: "PAYMENT_ORDER_MISMATCH",
      severity: "critical",
      description:
        "Payment does not belong to the expected Razorpay order.",
      expectedState: {
        razorpayOrderId:
          order.razorpayOrderId,
      },
      actualState: {
        razorpayOrderId:
          razorpayPayment.order_id,
      },
    });

    return {
      verified: false,
      reason:
        "Payment does not belong to this order",
    };
  }


  if (
    Number(razorpayPayment.amount) !==
    Number(order.amountInSubunits)
  ) {
    await incidentService.createIncident({
      orderId: order.id,
      type: "AMOUNT_MISMATCH",
      severity: "critical",
      description:
        "Payment amount does not match order amount.",
      expectedState: {
        amountInSubunits:
          order.amountInSubunits,
      },
      actualState: {
        amountInSubunits:
          razorpayPayment.amount,
      },
    });

    return {
      verified: false,
      reason: "Payment amount mismatch",
    };
  }


  const capturedAt =
    razorpayPayment.status ===
    "captured"
      ? new Date().toISOString()
      : null;


  await paymentStore.upsertPayment({
    orderId: order.id,

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

    capturedAt,
  });


  const verifiedAt =
    new Date().toISOString();


  const newStatus =
    razorpayPayment.status ===
    "captured"
      ? "captured"
      : "verified";


  const updatedOrder =
    await orderStore.updateOrderStatus({
      razorpayOrderId:
        order.razorpayOrderId,

      status: newStatus,

      verifiedAt,

      capturedAt,
    });


  await auditService.log({
    entityType: "PAYMENT",
    entityId: paymentId,
    action: "PAYMENT_SIGNATURE_VERIFIED",
    metadata: {
      merchantOrderId,
      razorpayOrderId:
        order.razorpayOrderId,
      razorpayStatus:
        razorpayPayment.status,
    },
  });


  return {
    verified: true,
    order: updatedOrder,
    payment: razorpayPayment,
  };
};


module.exports = {
  verifyPaymentSignature,
};
