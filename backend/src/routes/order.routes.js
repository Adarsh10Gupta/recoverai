const express = require("express");
const controller = require("../controllers/order.controller");

const router = express.Router();

router.get("/test", (req, res) => {
  res.json({ success: true, message: "Order routes are working" });
});

router.post("/", controller.createOrder);
router.post("/verify", controller.verifyPayment);

module.exports = router;
