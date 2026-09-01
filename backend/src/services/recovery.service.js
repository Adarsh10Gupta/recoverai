const db = require("../db/database");
const reconciliationService = require("./reconciliation.service");
const razorpayService = require("./razorpay.service");
const orderStore = require("./order.store");
const paymentStore = require("./payment.store");
const auditService = require("./audit.service");
const incidentService = require("./incident.service");
const connectionService = require("./razorpay.connection.service");
const policyService = require("./policy.service");
const paymentLinkService = require("./payment-link.service");
const intelligence = require("./recovery.intelligence.service");


async function recoverIncident(
  incidentId,
  workspaceId
) {
  if (!workspaceId) {
    throw new Error("workspaceId is required");
  }

  const incident =
    await incidentService.getIncident(
      incidentId,
      workspaceId
    );

  if (!incident) {
    throw new Error("Incident not found");
  }

  if (incident.status === "resolved") {
    return {
      success: true,
      message: "Incident is already resolved",
      incident,
    };
  }

  const scored = incident.recovery_score == null ? await intelligence.scoreIncident(incidentId, workspaceId) : null;
  const score = Number(scored?.recovery_score ?? incident.recovery_score ?? 0);
  const policyCheck = await policyService.checkActionAllowed(workspaceId, incident, score);
  if (!policyCheck.allowed && incident.type !== "LOCAL_STATE_STALE") {
    await auditService.log({workspaceId,entityType:"INCIDENT",entityId:incidentId,action:"RECOVERY_BLOCKED_BY_POLICY",metadata:{blockers:policyCheck.blockers,score}});
    return { success:true, resolved:false, policyBlocked:true, blockers:policyCheck.blockers, incidentId };
  }

  const actionType = incident.type === "CHECKOUT_ABANDONED"
    ? "PAYMENT_LINK_RECOVERY"
    : incident.type === "MANDATE_FAILURE"
      ? "MANDATE_POLICY_REVIEW"
      : incident.order_id
        ? "RECONCILE_ORDER"
        : incident.payment_id
          ? "INVESTIGATE_UNMATCHED_PAYMENT"
          : "INVESTIGATE_INCIDENT";

  const actionResult = await db.query(
    `
    INSERT INTO recovery_actions (
      incident_id,
      workspace_id,
      action_type,
      status,
      attempt
    )
    VALUES ($1,$2,$3,'running',1)
    RETURNING *
    `,
    [
      incidentId,
      workspaceId,
      actionType,
    ]
  );

  const action = actionResult.rows[0];

  try {
    let result;
    let resolved = false;

    if (incident.type === "CHECKOUT_ABANDONED") {
      const order = await orderStore.getOrderById(incident.order_id, workspaceId);
      if (!order) throw new Error("Order associated with abandoned checkout not found");
      const link = await paymentLinkService.createRecoveryLink({workspaceId, order, incident, channel:"whatsapp"});
      result = { action:"PAYMENT_LINK_QUEUED", paymentLinkId:link.id, razorpayPaymentLinkId:link.razorpay_payment_link_id, shortUrl:link.short_url, channel:"whatsapp", messageStatus:"queued", expiresAt:link.expires_at };
      resolved = false;
    } else if (incident.type === "MANDATE_FAILURE") {
      result = { action:"HUMAN_ESCALATION_REQUIRED", reason:"Recurring debit recovery is policy constrained. No silent retry was executed.", stoppingRules:["Respect retry window","Pre-debit notification required before eligible retry","Stop after max attempts or revoked mandate","Human approval for escalated cases"] };
      resolved = false;
    }

    /*
     * ORDER INCIDENT
     */
    else if (incident.order_id) {
      const order =
        await orderStore.getOrderById(
          incident.order_id,
          workspaceId
        );

      if (!order) {
        throw new Error(
          "Order associated with incident not found"
        );
      }

      result =
        await reconciliationService.reconcileOrder(
          order.merchant_order_id,
          workspaceId
        );

      resolved = result.matched;
    }

    /*
     * PAYMENT INCIDENT
     */
    else if (incident.payment_id) {
      const paymentResult =
        await db.query(
          `
          SELECT *
          FROM payments
          WHERE id = $1
            AND workspace_id = $2
          `,
          [
            incident.payment_id,
            workspaceId,
          ]
        );

      const payment =
        paymentResult.rows[0];

      if (!payment) {
        throw new Error(
          "Payment associated with incident not found"
        );
      }

      const connection =
        await connectionService
          .getConnectionSecrets(
            workspaceId
          );

      const razorpayPayment =
        await razorpayService.fetchPayment(
          payment.razorpay_payment_id,
          connection?.accessToken
        );

      let localOrder = null;

      if (razorpayPayment.order_id) {
        localOrder =
          await orderStore
            .getOrderByRazorpayOrderId(
              razorpayPayment.order_id,
              workspaceId
            );
      }

      if (localOrder) {
        await paymentStore.upsertPayment({
          workspaceId,
          orderId: localOrder.id,
          razorpayPaymentId:
            razorpayPayment.id,
          razorpayOrderId:
            razorpayPayment.order_id,
          amountInSubunits:
            razorpayPayment.amount,
          currency:
            razorpayPayment.currency,
          status:
            razorpayPayment.status,
          method:
            razorpayPayment.method,
          email:
            razorpayPayment.email,
          contact:
            razorpayPayment.contact,
          errorCode:
            razorpayPayment.error_code,
          errorDescription:
            razorpayPayment.error_description,
          capturedAt:
            razorpayPayment.status ===
            "captured"
              ? new Date()
              : null,
        });

        await db.query(
          `
          UPDATE incidents
          SET order_id = $1
          WHERE id = $2
            AND workspace_id = $3
          `,
          [
            localOrder.id,
            incidentId,
            workspaceId,
          ]
        );

        result =
          await reconciliationService
            .reconcileOrder(
              localOrder.merchant_order_id,
              workspaceId
            );

        resolved = result.matched;
      } else {
        result = {
          action:
            "MANUAL_REVIEW_REQUIRED",
          reason:
            "No local order could be matched to the Razorpay payment.",
          razorpayPayment: {
            id: razorpayPayment.id,
            order_id:
              razorpayPayment.order_id,
            amount:
              razorpayPayment.amount,
            currency:
              razorpayPayment.currency,
            status:
              razorpayPayment.status,
          },
        };
      }
    }

    /*
     * INCIDENT WITHOUT ORDER/PAYMENT
     */
    else {
      result = {
        action:
          "MANUAL_REVIEW_REQUIRED",
        reason:
          "Incident has no order or payment association.",
      };
    }

    await db.query(
      `
      UPDATE recovery_actions
      SET
        status = 'completed',
        result = $2,
        completed_at = NOW()
      WHERE id = $1
        AND workspace_id = $3
      `,
      [
        action.id,
        result,
        workspaceId,
      ]
    );

    if (resolved) {
      await incidentService.resolveIncident(
        incidentId,
        workspaceId
      );
    }

    await auditService.log({
      entityType: "INCIDENT",
      entityId: incidentId,
      action: resolved
        ? "RECOVERY_COMPLETED"
        : "RECOVERY_REQUIRES_REVIEW",
      metadata: {
        recoveryActionId:
          action.id,
        actionType,
        resolved,
        workspaceId,
      },
    });

    return {
      success: true,
      incidentId,
      recoveryActionId: action.id,
      resolved,
      result,
    };
  } catch (error) {
    await db.query(
      `
      UPDATE recovery_actions
      SET
        status = 'failed',
        error = $2,
        completed_at = NOW()
      WHERE id = $1
        AND workspace_id = $3
      `,
      [
        action.id,
        error.message,
        workspaceId,
      ]
    );

    await auditService.log({
      entityType: "INCIDENT",
      entityId: incidentId,
      action: "RECOVERY_FAILED",
      metadata: {
        recoveryActionId:
          action.id,
        error:
          error.message,
        workspaceId,
      },
    });

    throw error;
  }
}


async function listActions(
  incidentId,
  workspaceId
) {
  if (!workspaceId) {
    throw new Error("workspaceId is required");
  }

  const result = await db.query(
    `
    SELECT *
    FROM recovery_actions
    WHERE incident_id = $1
      AND workspace_id = $2
    ORDER BY created_at DESC
    `,
    [
      incidentId,
      workspaceId,
    ]
  );

  return result.rows;
}


module.exports = {
  recoverIncident,
  listActions,
};