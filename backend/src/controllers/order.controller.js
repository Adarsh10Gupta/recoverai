const crypto = require("crypto");
const paymentService = require("../services/payment.service");
const razorpayService = require("../services/razorpay.service");
const orderStore = require("../services/order.store");


const verifyPayment = async (req, res) => {
  try {
    const {
      merchantOrderId,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    if (
      !merchantOrderId ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing payment verification fields",
      });
    }

    const result = paymentService.verifyPaymentSignature({
      merchantOrderId,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });

    if (!result.verified) {
      return res.status(400).json({
        success: false,
        verified: false,
        message: result.reason,
      });
    }

    return res.status(200).json({
      success: true,
      verified: true,
      message: "Payment signature verified successfully",
      paymentId: razorpay_payment_id,
      order: result.order,
    });
  } catch (error) {
    console.error("Payment verification failed:", error);

    return res.status(500).json({
      success: false,
      verified: false,
      message: "Payment verification failed",
    });
  }
};

const createOrder = async (req, res) => {
  try {
    console.log("Incoming order request:", {
      body: req.body,
      contentType: req.headers["content-type"],
      origin: req.headers.origin,
    });

    const { amount, currency = "INR" } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be greater than 0",
      });
    }

    const amountInSubunits = Math.round(amount * 100);

    const merchantOrderId = `merchant_${crypto.randomUUID()}`;

    const receipt = `recoverai_${Date.now()}`;

    const order = await razorpayService.createOrder({
      amount: amountInSubunits,
      currency,
      receipt,
    });

    orderStore.saveOrder({
      merchantOrderId,
      razorpayOrderId: order.id,
      amount,
      amountInSubunits: order.amount,
      currency: order.currency,
      status: "created",
      createdAt: new Date().toISOString(),
    });

    return res.status(201).json({
      success: true,
      order: {
        id: order.id,
        merchantOrderId,
        amount,
        amountInSubunits: order.amount,
        currency: order.currency,
        status: order.status,
        receipt: order.receipt,
      },
    });
  } catch (error) {
    console.error("Razorpay order creation failed:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create Razorpay order",
      error: error.error?.description || error.message,
    });
  }
};

module.exports = {
  createOrder,
  verifyPayment,
};
