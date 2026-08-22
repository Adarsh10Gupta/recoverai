const crypto = require("crypto");

const config = require("../config/env");
const orderStore = require("./order.store");

const verifyPaymentSignature = ({
  merchantOrderId,
  paymentId,
  signature,
}) => {
  const order = orderStore.getOrder(merchantOrderId);

  if (!order) {
    return {
      verified: false,
      reason: "Order not found",
    };
  }

  const payload = `${order.razorpayOrderId}|${paymentId}`;

  const expectedSignature = crypto
    .createHmac("sha256", config.razorpayKeySecret)
    .update(payload)
    .digest("hex");

  const expectedBuffer = Buffer.from(
    expectedSignature,
    "utf8"
  );

  const receivedBuffer = Buffer.from(
    signature,
    "utf8"
  );

  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !crypto.timingSafeEqual(
      expectedBuffer,
      receivedBuffer
    )
  ) {
    return {
      verified: false,
      reason: "Invalid payment signature",
    };
  }

  order.status = "verified";
  order.verifiedAt = new Date().toISOString();

  return {
    verified: true,
    order,
  };
};

module.exports = {
  verifyPaymentSignature,
};
