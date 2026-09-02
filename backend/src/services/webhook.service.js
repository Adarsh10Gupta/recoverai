const crypto = require("crypto");

const config = require("../config/env");
const db = require("../db/database");

const eventStore = require("./event.store");
const connectionService = require("./razorpay.connection.service");
const orderStore = require("./order.store");
const paymentStore = require("./payment.store");
const incidentService = require("./incident.service");
const auditService = require("./audit.service");
const razorpayService = require("./razorpay.service");
const automationService = require("./automation.service");
const paymentLinkService = require("./payment-link.service");
const abandonmentService = require("./abandonment.service");


function verifySignature(
  rawBody,
  receivedSignature
) {
  const expected = crypto
    .createHmac(
      "sha256",
      config.razorpayWebhookSecret
    )
    .update(rawBody)
    .digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(
    receivedSignature || ""
  );

  return (
    a.length === b.length &&
    crypto.timingSafeEqual(a, b)
  );
}


function validateTimestamp(payload) {
  if (!payload.created_at) {
    return true;
  }

  const age = Math.abs(
    Date.now() / 1000 -
      Number(payload.created_at)
  );

  return (
    age <=
    config.webhookReplayWindowSeconds
  );
}


/**
 * Store one Razorpay payment locally.
 */
async function storeRazorpayPayment({
  payment,
  workspaceId,
  orderId = null,
}) {
  if (!payment?.id) {
    throw new Error(
      "Razorpay payment entity missing"
    );
  }

  return paymentStore.upsertPayment({
    workspaceId,

    orderId,

    razorpayPaymentId:
      payment.id,

    razorpayOrderId:
      payment.order_id || null,

    amountInSubunits:
      payment.amount,

    currency:
      payment.currency,

    status:
      payment.status,

    method:
      payment.method,

    email:
      payment.email,

    contact:
      payment.contact,

    errorCode:
      payment.error_code,

    errorDescription:
      payment.error_description,

    capturedAt:
      payment.status === "captured"
        ? new Date()
        : null,
  });
}


/**
 * Process one webhook event.
 */
async function processEvent(event) {
  const payload = event.payload;
  const eventType = event.event_type;
  const workspaceId =
    event.workspace_id;

  if (!workspaceId) {
    throw new Error(
      "Webhook event has no workspaceId"
    );
  }


  /*
   * OAuth authorization revoked.
   */
  if (
    eventType ===
    "account.app.authorization_revoked"
  ) {
    if (event.razorpay_account_id) {
      await db.query(
        `
        UPDATE razorpay_connections
        SET
          status = 'revoked',
          updated_at = NOW()
        WHERE razorpay_account_id = $1
          AND workspace_id = $2
        `,
        [
          event.razorpay_account_id,
          workspaceId,
        ]
      );
    }

    return {
      authorization: "revoked",
    };
  }


  /*
   * PAYMENT LINK EVENTS
   */
  if (eventType.startsWith("payment_link.")) {
    const link = payload.payload?.payment_link?.entity;
    if (!link?.id) throw new Error("Payment Link entity missing from webhook");
    const localLink = await db.query(`SELECT * FROM payment_links WHERE razorpay_payment_link_id=$1 AND workspace_id=$2 LIMIT 1`, [link.id, workspaceId]);
    if (eventType === "payment_link.paid" || eventType === "payment_link.partially_paid") {
      const updated = await paymentLinkService.markPaid(link.id, payload.payload?.payment?.entity?.id || link.payments?.[0]?.id || null);
      const localOrder = localLink.rows[0]?.order_id ? await orderStore.getOrderById(localLink.rows[0].order_id, workspaceId) : null;
      if (localOrder && eventType === "payment_link.paid") {
        await orderStore.updateStatus(localOrder.id, "paid", { paid_at: new Date(), captured_at: new Date() }, workspaceId);
      }
      if (localLink.rows[0]?.incident_id && eventType === "payment_link.paid") {
        await incidentService.resolveIncident(localLink.rows[0].incident_id, workspaceId);
      }
      return { paymentLinkId: link.id, status: link.status, recovered: eventType === "payment_link.paid", localLink: updated?.id || null };
    }
    if (eventType === "payment_link.expired" || eventType === "payment_link.cancelled") {
      await db.query(`UPDATE payment_links SET status=$2,updated_at=NOW() WHERE razorpay_payment_link_id=$1 AND workspace_id=$3`, [link.id, link.status || eventType.split('.')[1], workspaceId]);
      return { paymentLinkId: link.id, status: link.status };
    }
    return { paymentLinkId: link.id, ignored: true };
  }

  /*
   * RECURRING / MANDATE EVENTS
   * These are intentionally policy-driven. RecoverAI never blindly retries
   * a recurring debit; failures become incidents and the policy layer decides
   * whether another attempt is permitted or a human must take over.
   */
  if (/mandate|subscription/.test(eventType)) {
    const entity = payload.payload?.payment?.entity || payload.payload?.subscription?.entity || payload.payload?.token?.entity || {};
    if (["payment.failed","subscription.charged","subscription.halted","subscription.cancelled"].includes(eventType)) {
      const amount = Number(entity.amount || entity.amount_paid || 0);
      await incidentService.createIncident({
        workspaceId,
        type: "MANDATE_FAILURE",
        severity: "high",
        description: `Recurring payment event ${eventType} requires policy evaluation.`,
        expectedState: { recurringPayment: "successful", automatedRetry: "policy_checked" },
        actualState: { eventType, status: entity.status || "failed", amount, tokenId: entity.token_id || null },
      });
      return { incident: "MANDATE_FAILURE" };
    }
  }

  /*
   * PAYMENT EVENTS
   *
   * Handles:
   * payment.authorized
   * payment.captured
   * payment.failed
   * payment.refunded
   * etc.
   */
  if (
    eventType.startsWith("payment.")
  ) {
    const payment =
      payload.payload?.payment?.entity;

    if (!payment?.id) {
      throw new Error(
        "Payment entity missing from webhook"
      );
    }

    const localOrder =
      payment.order_id
        ? await orderStore
            .getOrderByRazorpayOrderId(
              payment.order_id,
              workspaceId
            )
        : null;


    const storedPayment =
      await storeRazorpayPayment({
        payment,
        workspaceId,
        orderId:
          localOrder?.id || null,
      });


    /*
     * Payment references an order that
     * RecoverAI doesn't know about.
     */
    if (!localOrder) {
      await incidentService.createIncident({
        workspaceId,

        paymentId:
          storedPayment.id,

        type:
          "PAYMENT_WITHOUT_ORDER",

        severity:
          "critical",

        description:
          "Razorpay payment webhook received but the corresponding local order was not found.",

        expectedState: {
          localOrder:
            payment.order_id || null,
        },

        actualState: {
          razorpayOrderId:
            payment.order_id || null,

          paymentId:
            payment.id,

          amount:
            payment.amount,

          currency:
            payment.currency,
        },
      });

      return {
        incident:
          "PAYMENT_WITHOUT_ORDER",
      };
    }


    /*
     * Validate payment amount.
     */
    if (
      Number(payment.amount) !==
      Number(
        localOrder.amountInSubunits
      )
    ) {
      await incidentService.createIncident({
        workspaceId,

        orderId:
          localOrder.id,

        paymentId:
          storedPayment.id,

        type:
          "PAYMENT_AMOUNT_MISMATCH",

        severity:
          "critical",

        description:
          "Razorpay payment amount does not match the local order amount.",

        expectedState: {
          amount:
            Number(
              localOrder.amountInSubunits
            ),
        },

        actualState: {
          amount:
            Number(payment.amount),
        },
      });
    }


    /*
     * Validate currency.
     */
    if (
      payment.currency !==
      localOrder.currency
    ) {
      await incidentService.createIncident({
        workspaceId,

        orderId:
          localOrder.id,

        paymentId:
          storedPayment.id,

        type:
          "PAYMENT_CURRENCY_MISMATCH",

        severity:
          "critical",

        description:
          "Razorpay payment currency does not match the local order currency.",

        expectedState: {
          currency:
            localOrder.currency,
        },

        actualState: {
          currency:
            payment.currency,
        },
      });
    }


    /*
     * Captured payment.
     */
    if (
      payment.status === "captured"
    ) {
      await orderStore.updateStatus(
        localOrder.id,
        "captured",
        {
          captured_at:
            new Date(),
        },
        workspaceId
      );
    }


    /*
     * Failed payment.
     */
    if (
      eventType ===
      "payment.failed"
    ) {
      await incidentService.createIncident({
        workspaceId,

        orderId:
          localOrder.id,

        paymentId:
          storedPayment.id,

        type:
          "PAYMENT_FAILED",

        severity:
          "high",

        description:
          "Razorpay reported a failed payment.",

        expectedState: {
          paymentStatus:
            "captured",
        },

        actualState: {
          paymentStatus:
            payment.status,

          errorCode:
            payment.error_code,

          errorDescription:
            payment.error_description,
        },
      });
    }


    return {
      paymentId:
        payment.id,

      orderId:
        localOrder.id,
    };
  }


  /*
   * ORDER.PAID
   *
   * IMPORTANT:
   *
   * Razorpay's order.paid webhook is not
   * sufficient by itself to populate our
   * local payments table.
   *
   * Therefore we explicitly fetch the
   * order's payments from Razorpay.
   */
  if (
    eventType ===
    "order.paid"
  ) {
    const razorpayOrder =
      payload.payload?.order?.entity;

    if (!razorpayOrder?.id) {
      throw new Error(
        "Order entity missing from order.paid webhook"
      );
    }


    const localOrder =
      await orderStore
        .getOrderByRazorpayOrderId(
          razorpayOrder.id,
          workspaceId
        );


    /*
     * Razorpay knows the order,
     * RecoverAI doesn't.
     */
    if (!localOrder) {
      await incidentService.createIncident({
        workspaceId,

        type:
          "ORDER_WITHOUT_LOCAL_RECORD",

        severity:
          "critical",

        description:
          "Razorpay order.paid event received but no local order exists.",

        expectedState: {
          localOrder:
            razorpayOrder.id,
        },

        actualState: {
          razorpayOrderId:
            razorpayOrder.id,

          amount:
            razorpayOrder.amount,

          currency:
            razorpayOrder.currency,
        },
      });

      return {
        incident:
          "ORDER_WITHOUT_LOCAL_RECORD",
      };
    }


    /*
     * Retrieve workspace-specific
     * Razorpay credentials.
     */
    const connection =
      await connectionService
        .getConnectionSecrets(
          workspaceId
        );

    const accessToken =
      connection?.accessToken;


    /*
     * Fetch all payments belonging
     * to this Razorpay order.
     */
    const payments =
      await razorpayService
        .fetchOrderPayments(
          razorpayOrder.id,
          accessToken
        );


    let storedPaymentCount = 0;


    for (
      const payment
      of payments.items || []
    ) {
      await storeRazorpayPayment({
        payment,

        workspaceId,

        orderId:
          localOrder.id,
      });

      storedPaymentCount++;
    }


    /*
     * Validate order amount.
     */
    if (
      Number(razorpayOrder.amount) !==
      Number(
        localOrder.amountInSubunits
      )
    ) {
      await incidentService.createIncident({
        workspaceId,

        orderId:
          localOrder.id,

        type:
          "AMOUNT_MISMATCH",

        severity:
          "critical",

        description:
          "Razorpay paid order amount does not match the local order amount.",

        expectedState: {
          amount:
            Number(
              localOrder.amountInSubunits
            ),
        },

        actualState: {
          amount:
            Number(
              razorpayOrder.amount
            ),
        },
      });
    }


    /*
     * Validate order currency.
     */
    if (
      razorpayOrder.currency !==
      localOrder.currency
    ) {
      await incidentService.createIncident({
        workspaceId,

        orderId:
          localOrder.id,

        type:
          "CURRENCY_MISMATCH",

        severity:
          "critical",

        description:
          "Razorpay paid order currency does not match the local order currency.",

        expectedState: {
          currency:
            localOrder.currency,
        },

        actualState: {
          currency:
            razorpayOrder.currency,
        },
      });
    }


    /*
     * The provider is authoritative here:
     * order.paid => local order paid.
     */
    await orderStore.updateStatus(
      localOrder.id,
      "paid",
      {
        paid_at:
          new Date(),
      },
      workspaceId
    );


    return {
      orderId:
        localOrder.id,

      razorpayOrderId:
        razorpayOrder.id,

      paymentCount:
        storedPaymentCount,
    };
  }


  /*
   * Unknown/non-critical event.
   */
  return {
    ignored: true,
    eventType,
  };
}


/**
 * Worker.
 */
async function processPendingEvents() {
  const event =
    await eventStore.claimNextEvent();

  if (!event) {
    return false;
  }

  console.log(
    `[WEBHOOK] PROCESSING event=${event.event_type} eventId=${event.razorpay_event_id} workspace=${event.workspace_id || "demo"}`
  );

  try {
    const result =
      await processEvent(event);

    await eventStore.markProcessed(
      event.razorpay_event_id
    );
        console.log(
      `[WEBHOOK] PROCESSED event=${event.event_type} eventId=${event.razorpay_event_id}`
    );

    await auditService.log({
      entityType:
        "WEBHOOK",

      entityId:
        null,

      action:
        "WEBHOOK_PROCESSED",

      metadata: {
        eventId:
          event.razorpay_event_id,

        eventType:
          event.event_type,

        workspaceId:
          event.workspace_id,

        result,
      },
    });
  } catch (error) {
    console.error(
  `[WEBHOOK] PROCESSING_FAILED event=${event.event_type} eventId=${event.razorpay_event_id} attempts=${event.attempts} error=${error.message}`
);

    const retryable =
      event.attempts <
      config.webhookMaxAttempts;

    await eventStore.markFailed(
      event.razorpay_event_id,
      error.message,
      retryable
    );
  }

  return true;
}


let lastAutomationRun = 0;
let lastAbandonmentScan = 0;


async function runAutomationSweep() {
  if (
    Date.now() -
      lastAutomationRun <
    30000
  ) {
    return;
  }

  lastAutomationRun =
    Date.now();

  const result =
    await db.query(
      `
      SELECT id
      FROM workspaces
      ORDER BY created_at
      `
    );

  for (
    const row
    of result.rows
  ) {
    try {
      await automationService.run(
        row.id
      );
    } catch (error) {
      console.error(
        "Automation sweep error:",
        error.message
      );
    }
  }
}


async function runAbandonmentSweep() {
  if (Date.now() - lastAbandonmentScan < config.abandonmentScanIntervalMs) return;
  lastAbandonmentScan = Date.now();
  await abandonmentService.scanAll();
}

async function startWorker() {
  const loop = async () => {
    try {
      while (
        await processPendingEvents()
      ) {}

      await runAbandonmentSweep();
      await runAutomationSweep();
    } catch (error) {
      console.error(
        "Webhook worker loop error:",
        error
      );
    } finally {
      setTimeout(
        loop,
        config.workerIntervalMs
      );
    }
  };

  loop();
}


module.exports = {
  verifySignature,
  validateTimestamp,

  saveEvent:
    eventStore.saveEvent,

  startWorker,
  processPendingEvents,
  processEvent,

  razorpayService,
};
