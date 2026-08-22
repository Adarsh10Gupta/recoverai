const express = require("express");

const orderController = require("../controllers/order.controller");

const router = express.Router();

router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Order routes are working",
  });
});

router.post("/", orderController.createOrder);

router.post("/verify", orderController.verifyPayment);

module.exports = router;
