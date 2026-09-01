require("dotenv").config();

const crypto = require("crypto");
const https = require("https");

const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
const baseUrl = process.env.TEST_WEBHOOK_URL || "http://localhost:5000/api/webhooks/razorpay";

if (!secret) throw new Error("RAZORPAY_WEBHOOK_SECRET is missing");

const payload = {
  entity: "event",
  account_id: "acc_test",
  event: "payment.captured",
  contains: ["payment"],
  payload: {
    payment: {
      entity: {
        id: `pay_test_${Date.now()}`,
        order_id: "order_intentionally_missing",
        amount: 499900,
        currency: "INR",
        status: "captured",
        method: "card"
      }
    }
  },
  created_at: Math.floor(Date.now() / 1000)
};

const body = JSON.stringify(payload);
const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");
const eventId = `evt_test_${crypto.randomUUID()}`;

function send(signatureToSend, eventIdToSend = eventId) {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl);
    const client = url.protocol === "https:" ? https : require("http");

    const req = client.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "X-Razorpay-Signature": signatureToSend,
        "X-Razorpay-Event-Id": eventIdToSend
      }
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  console.log("Testing webhook:", baseUrl);

  console.log("\nTEST 1 — valid");
  console.log(await send(signature));

  console.log("\nTEST 2 — duplicate");
  console.log(await send(signature));

  console.log("\nTEST 3 — invalid signature");
  console.log(await send("invalid_signature", `evt_invalid_${crypto.randomUUID()}`));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
