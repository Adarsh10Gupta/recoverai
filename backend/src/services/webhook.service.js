const crypto = require("crypto");

const config = require("../config/env");
const eventStore = require("./event.store");
const orderStore = require("./order.store");

const verifyWebhookSignature = (
  rawBody,
  receivedSignature
) => {
  const expectedSignature = crypto
    .createHmac(
      "sha256",
      config.razorpayWebhookSecret
    )
    .update(rawBody)
    .digest("hex");

  const expectedBuffer = Buffer.from(
    expectedSignature,
    "utf8"
  );

  const receivedBuffer = Buffer.from(
    receivedSignature || "",
    "utf8"
  );

  if (
    expectedBuffer.length !== receivedBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    expectedBuffer,
    receivedBuffer
  );
};

const processWebhook = ({
  eventId,
  rawBody,
}) => {
  const rawText = rawBody.toString("utf8");

  const payload = JSON.parse(rawText);

  const eventType = payload.event;

  const isNewEvent = eventStore.saveEvent(
    eventId,
    {
      eventId,
      eventType,
      rawBody: rawText,
      receivedAt: new Date().toISOString(),
      status: "received",
    }
  );

  if (!isNewEvent) {
    return {
      duplicate: true,
      eventId,
      eventType,
    };
  }

  if (eventType === "payment.captured") {
    const payment =
      payload.payload?.payment?.entity;

    const razorpayOrderId =
      payment?.order_id;

    const order =
      orderStore.getOrderByRazorpayOrderId(
        razorpayOrderId
      );

    if (order) {
      order.status = "captured";
      order.capturedAt =
        new Date().toISOString();
      order.paymentId = payment.id;
    }
  }

  if (eventType === "order.paid") {
    const razorpayOrder =
      payload.payload?.order?.entity;

    const order =
      orderStore.getOrderByRazorpayOrderId(
        razorpayOrder?.id
      );

    if (order) {
      order.status = "paid";
      order.paidAt =
        new Date().toISOString();
    }
  }

  return {
    duplicate: false,
    eventId,
    eventType,
  };
};

module.exports = {
  verifyWebhookSignature,
  processWebhook,
};
