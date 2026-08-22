const webhookService = require("../services/webhook.service");

const handleRazorpayWebhook = (req, res) => {
  try {
    const signature =
      req.headers["x-razorpay-signature"];

    const eventId =
      req.headers["x-razorpay-event-id"];

    if (!signature) {
      return res.status(400).json({
        success: false,
        message: "Missing Razorpay webhook signature",
      });
    }

    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: "Missing Razorpay event ID",
      });
    }

    const isValid =
      webhookService.verifyWebhookSignature(
        req.body,
        signature
      );

    if (!isValid) {
      console.warn(
        "Invalid Razorpay webhook signature"
      );

      return res.status(400).json({
        success: false,
        message: "Invalid webhook signature",
      });
    }

    const result =
      webhookService.processWebhook({
        eventId,
        rawBody: req.body,
      });

    console.log(
      "Razorpay webhook received:",
      result
    );

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error(
      "Webhook processing failed:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Webhook processing failed",
    });
  }
};

module.exports = {
  handleRazorpayWebhook,
};
