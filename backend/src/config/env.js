const dotenv = require("dotenv");

dotenv.config();

const required = [
  "DATABASE_URL",
  "JWT_SECRET",
  "ENCRYPTION_KEY",
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

if (!/^[0-9a-fA-F]{64}$/.test(process.env.ENCRYPTION_KEY)) {
  throw new Error(
    "ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes)"
  );
}

module.exports = {
  port: Number(process.env.PORT || 5000),

  databaseUrl: process.env.DATABASE_URL,

  razorpayKeyId: process.env.RAZORPAY_KEY_ID || "",
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || "",
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || "",

  frontendOrigin:
    process.env.FRONTEND_ORIGIN || "http://localhost:5173",

  workerIntervalMs:
    Number(process.env.WEBHOOK_WORKER_INTERVAL_MS || 2000),

  webhookMaxAttempts:
    Number(process.env.WEBHOOK_MAX_ATTEMPTS || 5),

  webhookReplayWindowSeconds:
    Number(process.env.WEBHOOK_REPLAY_WINDOW_SECONDS || 600),

  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",

  encryptionKey: process.env.ENCRYPTION_KEY,

  razorpayOAuthClientId:
    process.env.RAZORPAY_OAUTH_CLIENT_ID || "",

  razorpayOAuthClientSecret:
    process.env.RAZORPAY_OAUTH_CLIENT_SECRET || "",

  razorpayOAuthRedirectUri:
    process.env.RAZORPAY_OAUTH_REDIRECT_URI || "",

  razorpayOAuthMode:
    process.env.RAZORPAY_OAUTH_MODE === "live"
      ? "live"
      : "test",

  publicWebhookUrl:
    process.env.PUBLIC_WEBHOOK_URL || "",

  webhookAlertEmail:
    process.env.WEBHOOK_ALERT_EMAIL || "",

  // Dedicated workspace used ONLY by the public demo store.
  demoWorkspaceId:
    process.env.DEMO_WORKSPACE_ID || "",

  abandonmentScanIntervalMs:
    Number(process.env.ABANDONMENT_SCAN_INTERVAL_MS || 30000),
};