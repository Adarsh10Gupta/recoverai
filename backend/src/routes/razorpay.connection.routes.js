const express = require("express");
const controller = require("../controllers/razorpay.connection.controller");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.get("/connect", requireAuth, controller.connect);
router.get("/status", requireAuth, controller.status);
router.get("/oauth/callback", controller.callback);
module.exports = router;
