const dotenv = require("dotenv");

dotenv.config();

const config = {
  port: process.env.PORT || 5000,

  razorpayKeyId: process.env.RAZORPAY_KEY_ID,

  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET,

  razorpayWebhookSecret:
    process.env.RAZORPAY_WEBHOOK_SECRET,
};

if (
  !config.razorpayKeyId ||
  !config.razorpayKeySecret ||
  !config.razorpayWebhookSecret
) {
  throw new Error(
    "Razorpay configuration is incomplete."
  );
}

module.exports = config;
