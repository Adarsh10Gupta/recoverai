const app = require("./app");
const config = require("./config/env");
const webhookService = require("./services/webhook.service");

const server = app.listen(config.port, () => {
  console.log(`RecoverAI backend running on port ${config.port}`);
  console.log(`Webhook worker interval: ${config.workerIntervalMs}ms`);
  webhookService.startWorker();
});

async function shutdown(signal) {
  console.log(`${signal}: shutting down`);
  server.close(() => process.exit(0));
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
