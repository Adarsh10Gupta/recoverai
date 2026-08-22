require("dotenv").config();

const crypto = require("crypto");
const http = require("http");

const secret =
  process.env.RAZORPAY_WEBHOOK_SECRET;

if (!secret) {
  throw new Error(
    "RAZORPAY_WEBHOOK_SECRET is missing"
  );
}

const payload = {
  entity: "event",

  account_id: "acc_test",

  event: "payment.captured",

  contains: ["payment"],

  payload: {
    payment: {
      entity: {
        id: "pay_test_123",
        order_id: "order_test_123",
        amount: 499900,
        currency: "INR",
        status: "captured",
      },
    },
  },

  created_at: Math.floor(
    Date.now() / 1000
  ),
};

const body = JSON.stringify(payload);

const signature = crypto
  .createHmac("sha256", secret)
  .update(body)
  .digest("hex");

const eventId =
  `evt_test_${crypto.randomUUID()}`;

const sendWebhook = ({
  signatureToSend,
  label,
}) => {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "localhost",
        port: 5000,
        path: "/api/webhooks/razorpay",
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          "Content-Length":
            Buffer.byteLength(body),

          "X-Razorpay-Signature":
            signatureToSend,

          "X-Razorpay-Event-Id":
            eventId,
        },
      },

      (response) => {
        let responseBody = "";

        response.on(
          "data",
          (chunk) => {
            responseBody += chunk;
          }
        );

        response.on(
          "end",
          () => {
            console.log(
              `\n${label}`
            );

            console.log(
              "Status:",
              response.statusCode
            );

            console.log(
              "Response:",
              responseBody
            );

            resolve();
          }
        );
      }
    );

    request.on(
      "error",
      reject
    );

    request.write(body);

    request.end();
  });
};

const main = async () => {
  console.log(
    "Testing RecoverAI webhook..."
  );

  await sendWebhook({
    signatureToSend: signature,
    label: "TEST 1 — Valid webhook",
  });

  await sendWebhook({
    signatureToSend: signature,
    label: "TEST 2 — Duplicate webhook",
  });

  await sendWebhook({
    signatureToSend:
      "invalid_signature",
    label: "TEST 3 — Invalid signature",
  });
};

main().catch((error) => {
  console.error(
    "Webhook test failed:",
    error
  );

  process.exit(1);
});
