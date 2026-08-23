const express = require("express");
const cors = require("cors");

const orderRoutes =
  require("./routes/order.routes");

const webhookRoutes =
  require("./routes/webhook.routes");

const reconciliationRoutes =
  require("./routes/reconciliation.routes");


const app = express();


app.use(cors());


/*
 * IMPORTANT:
 * Razorpay webhook must receive
 * the raw body before JSON parsing.
 */

app.use(
  "/api/webhooks",
  webhookRoutes
);


app.use(express.json());


app.get(
  "/health",
  async (req, res) => {

    res.json({
      success: true,

      service:
        "RecoverAI Backend",

      status:
        "healthy",
    });
  }
);


app.use(
  "/api/orders",
  orderRoutes
);


app.use(
  "/api/reconciliation",
  reconciliationRoutes
);


module.exports = app;
