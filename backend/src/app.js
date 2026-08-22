const express = require("express");
const cors = require("cors");

const orderRoutes = require(
  "./routes/order.routes"
);

const webhookRoutes = require(
  "./routes/webhook.routes"
);

const app = express();

app.use(cors());

/*
 * IMPORTANT:
 * Razorpay webhook route must receive
 * the raw request body before JSON parsing.
 */
app.use(
  "/api/webhooks",
  webhookRoutes
);

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({
    success: true,
    service: "RecoverAI Backend",
    status: "healthy",
  });
});

app.use("/api/orders", orderRoutes);

module.exports = app;
