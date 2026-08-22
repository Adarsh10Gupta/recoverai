const express = require("express");

const webhookController = require(
  "../controllers/webhook.controller"
);

const router = express.Router();

router.post(
  "/razorpay",
  express.raw({
    type: "application/json",
  }),
  webhookController.handleRazorpayWebhook
);

module.exports = router;
