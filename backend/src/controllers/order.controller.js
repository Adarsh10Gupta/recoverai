const crypto = require("crypto");

const config = require("../config/env");
const razorpayService = require("../services/razorpay.service");
const orderStore = require("../services/order.store");
const paymentService = require("../services/payment.service");
const auditService = require("../services/audit.service");

function resolveWorkspaceId(req) {
  // Authenticated customer request.
  if (req.auth?.workspaceId) {
    return {
      workspaceId: req.auth.workspaceId,
      source: "authenticated",
    };
  }

  // Public RecoverAI demo request.
  if (config.demoWorkspaceId) {
    return {
      workspaceId: config.demoWorkspaceId,
      source: "demo",
    };
  }

  throw new Error(
    "No workspace context available. Configure DEMO_WORKSPACE_ID."
  );
}

async function createOrder(req, res) {
  try {
    const { amount, currency = "INR" } = req.body;

    if (
      !Number.isFinite(Number(amount)) ||
      Number(amount) <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Amount must be greater than 0",
      });
    }

    const {
      workspaceId,
      source,
    } = resolveWorkspaceId(req);

    const amountInSubunits = Math.round(
      Number(amount) * 100
    );

    const merchantOrderId =
      `merchant_${crypto.randomUUID()}`;

    const receipt =
      `recoverai_${Date.now()}`;

    const razorpayOrder =
      await razorpayService.createOrder({
        amount: amountInSubunits,
        currency,
        receipt,
      });

    const localOrder =
      await orderStore.saveOrder({
        merchantOrderId,
        razorpayOrderId: razorpayOrder.id,
        amount: Number(amount),
        amountInSubunits,
        currency: razorpayOrder.currency,
        receipt,
        status: "created",
        workspaceId,
      });

    await auditService.log({
      entityType: "ORDER",
      entityId: localOrder.id,
      action: "ORDER_CREATED",
      metadata: {
        merchantOrderId,
        razorpayOrderId: razorpayOrder.id,
        amountInSubunits,
        workspaceId,
        source,
      },
    });

    return res.status(201).json({
      success: true,
      order: {
        id: razorpayOrder.id,
        merchantOrderId,
        amount: Number(amount),
        amountInSubunits,
        currency: razorpayOrder.currency,
        status: razorpayOrder.status,
        receipt,
      },
    });
  } catch (error) {
    console.error("Order creation failed:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create Razorpay order",
      error:
        error.error?.description ||
        error.message,
    });
  }
}

async function verifyPayment(req, res) {
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
        verified: false,
        message:
          "Missing payment verification fields",
      });
    }

    const {
      workspaceId,
    } = resolveWorkspaceId(req);

    const result =
      await paymentService.verifyPaymentSignature({
        merchantOrderId,
        paymentId: razorpay_payment_id,
        signature: razorpay_signature,
        workspaceId,
      });

    if (!result.verified) {
      return res.status(400).json({
        success: false,
        verified: false,
        message: result.reason,
      });
    }

    return res.json({
      success: true,
      verified: true,
      message:
        "Payment signature verified successfully",
      paymentId: razorpay_payment_id,
      order: result.order,
    });
  } catch (error) {
    console.error(
      "Payment verification failed:",
      error
    );

    return res.status(500).json({
      success: false,
      verified: false,
      message:
        "Payment verification failed",
      error: error.message,
    });
  }
}

module.exports = {
  createOrder,
  verifyPayment,
};