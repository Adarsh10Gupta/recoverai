const crypto = require("crypto");
const webhookService = require("../services/webhook.service");
const connectionService = require("../services/razorpay.connection.service");
const config = require("../config/env");

function verify(rawBody, signature, secret) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature || "");

  return (
    a.length === b.length &&
    crypto.timingSafeEqual(a, b)
  );
}

async function handleRazorpayWebhook(req, res) {
  const receivedAt = new Date().toISOString();

  try {
    const signature =
      req.headers["x-razorpay-signature"];

    const eventId =
      req.headers["x-razorpay-event-id"];

    if (!signature) {
      console.warn(
        `[WEBHOOK] REJECTED reason=missing_signature receivedAt=${receivedAt}`
      );

      return res.status(400).json({
        success: false,
        message: "Missing Razorpay webhook signature",
      });
    }

    if (!eventId) {
      console.warn(
        `[WEBHOOK] REJECTED reason=missing_event_id receivedAt=${receivedAt}`
      );

      return res.status(400).json({
        success: false,
        message: "Missing Razorpay event ID",
      });
    }

    const rawBody = req.body;

    const payload =
      JSON.parse(rawBody.toString("utf8"));

    const eventType =
      payload.event || "unknown";

    const paymentEntity =
      payload?.payload?.payment?.entity || null;

    const orderEntity =
      payload?.payload?.order?.entity || null;

    const paymentId =
      paymentEntity?.id || null;

    const orderId =
      paymentEntity?.order_id ||
      orderEntity?.id ||
      null;

    console.log(
      `[WEBHOOK] RECEIVED event=${eventType} eventId=${eventId} payment=${paymentId || "-"} order=${orderId || "-"}`
    );

    if (
      !webhookService.validateTimestamp(payload)
    ) {
      console.warn(
        `[WEBHOOK] REJECTED event=${eventType} eventId=${eventId} reason=replay_window`
      );

      return res.status(400).json({
        success: false,
        message:
          "Webhook timestamp outside replay window",
      });
    }

    const accountId =
  payload.account_id ||
  payload.account?.id ||
  null;

let workspaceId = null;
let secret = config.razorpayWebhookSecret;

if (accountId) {
  const connection =
    await connectionService.findByAccountId(
      accountId
    );

  if (connection) {
    /*
     * OAuth-connected merchant.
     * Use the workspace-specific webhook secret.
     */
    secret = connection.webhookSecret;
    workspaceId = connection.workspace_id;

    if (!secret) {
      console.error(
        `[WEBHOOK] REJECTED event=${payload.event} eventId=${eventId} reason=connection_webhook_secret_missing workspace=${workspaceId}`
      );

      return res.status(500).json({
        success: false,
        message:
          "Webhook secret is not configured for this connection",
      });
    }

    console.log(
      `[WEBHOOK] ACCOUNT_RESOLVED mode=oauth account=${accountId} workspace=${workspaceId}`
    );
  } else if (config.demoWorkspaceId) {
    /*
     * RecoverAI demo / legacy API credential mode.
     *
     * Razorpay includes account_id in the webhook,
     * but the demo workspace intentionally does not
     * require an OAuth connection.
     *
     * Signature verification below is still mandatory.
     */
    workspaceId =
      config.demoWorkspaceId;

    secret =
      config.razorpayWebhookSecret;

    console.log(
      `[WEBHOOK] ACCOUNT_RESOLVED mode=demo account=${accountId} workspace=${workspaceId}`
    );
  } else {
    console.warn(
      `[WEBHOOK] REJECTED event=${payload.event} eventId=${eventId} reason=unknown_razorpay_account`
    );

    return res.status(404).json({
      success: false,
      message:
        "Unknown Razorpay account",
    });
  }
} else if (config.demoWorkspaceId) {
  /*
   * Legacy/demo webhook without account_id.
   */
  workspaceId =
    config.demoWorkspaceId;

  console.log(
    `[WEBHOOK] ACCOUNT_RESOLVED mode=demo workspace=${workspaceId}`
  );
    }

    if (
      !secret ||
      !verify(
        rawBody,
        signature,
        secret
      )
    ) {
      console.warn(
        `[WEBHOOK] REJECTED event=${eventType} eventId=${eventId} reason=invalid_signature`
      );

      return res.status(400).json({
        success: false,
        message:
          "Invalid webhook signature",
      });
    }

    console.log(
      `[WEBHOOK] SIGNATURE_VERIFIED event=${eventType} eventId=${eventId}`
    );

    const saved =
      await webhookService.saveEvent({
        eventId,
        eventType: payload.event,
        payload,
        signature,
        workspaceId,
        razorpayAccountId:
          accountId,
      });

    if (!saved) {
      console.log(
        `[WEBHOOK] DUPLICATE event=${eventType} eventId=${eventId}`
      );

      return res.status(200).json({
        success: true,
        duplicate: true,
        eventId,
        eventType: payload.event,
      });
    }

    console.log(
      `[WEBHOOK] SAVED event=${eventType} eventId=${eventId} workspace=${workspaceId || "demo"}`
    );

    return res.status(200).json({
      success: true,
      accepted: true,
      eventId,
      eventType: payload.event,
      workspaceId,
    });
  } catch (error) {
    console.error(
      `[WEBHOOK] INTAKE_FAILED error=${error.message}`
    );

    return res.status(400).json({
      success: false,
      message:
        "Invalid webhook payload",
    });
  }
}

module.exports = {
  handleRazorpayWebhook,
};