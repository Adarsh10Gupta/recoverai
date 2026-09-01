const express = require("express");
const controller = require("../controllers/webhook.controller");

const router = express.Router();

router.post(
  "/razorpay",
  express.raw({ type: "application/json" }),
  controller.handleRazorpayWebhook
);

module.exports = router;
