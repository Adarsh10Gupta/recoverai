const db = require("../db/database");

/**
 * RecoverAI Recovery Intelligence v1.
 * This is a transparent, deterministic scoring model - not an LLM.
 * It gives operators an explainable baseline until a model provider is configured.
 */
function scoreSignals({ incident, payment, order }) {
  let score = 20;
  const reasons = [];
  let action = "Manual review";

  if (incident.type === "PAYMENT_FAILED") {
    score = 58;
    reasons.push("The provider explicitly reported a failed payment.");
    action = "Reconcile and verify payment state";
    if (payment?.error_code) {
      const code = String(payment.error_code).toLowerCase();
      if (/(timeout|network|gateway|server|processing)/.test(code)) {
        score += 16;
        reasons.push("The error looks transient rather than a permanent decline.");
      }
      if (/(insufficient|fund|limit|declined|authentication)/.test(code)) {
        score -= 18;
        reasons.push("The provider error suggests a customer or authorization issue.");
        action = "Reconcile and verify payment state";
      }
    } else {
      score += 5;
      reasons.push("No permanent decline code is available.");
    }
    if (payment?.amount_in_subunits && Number(payment.amount_in_subunits) <= 100000) {
      score += 6;
      reasons.push("The payment value is within a lower-friction recovery range.");
    }
  } else if (incident.type === "LOCAL_STATE_STALE") {
    score = 92; action = "Reconcile order";
    reasons.push("Razorpay reports a paid state while the local record is stale.");
  } else if (incident.type === "AMOUNT_MISMATCH" || incident.type === "PAYMENT_AMOUNT_MISMATCH") {
    score = 8; action = "Manual investigation";
    reasons.push("An amount mismatch should never be auto-resolved.");
  } else if (incident.type === "CURRENCY_MISMATCH") {
    score = 5; action = "Manual investigation";
    reasons.push("Currency mismatches require operator verification.");
  } else if (incident.type === "PAYMENT_WITHOUT_ORDER") {
    score = 18; action = "Match payment to order";
    reasons.push("The payment exists at the provider but has no local order.");
  } else if (incident.type === "ORDER_WITHOUT_LOCAL_RECORD") {
    score = 15; action = "Match provider order";
    reasons.push("The provider order cannot be safely mapped to a local record.");
  } else if (incident.type === "PAYMENT_SIGNATURE_VERIFICATION_FAILED") {
    score = 0; action = "Security investigation";
    reasons.push("Signature verification failed; recovery must not proceed automatically.");
  } else {
    reasons.push("The incident type does not have a safe automated path.");
  }

  if (order?.status === "paid" || order?.status === "captured") {
    score = Math.min(100, score + 8);
    reasons.push("The local order has already reached a captured or paid state.");
  }
  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    action,
    reason: reasons.join(" "),
  };
}

async function scoreIncident(incidentId, workspaceId) {
  const r = await db.query(
    `SELECT i.*, p.amount_in_subunits, p.error_code, p.status AS payment_status,
            o.status AS order_status, o.amount_in_subunits AS order_amount
     FROM incidents i
     LEFT JOIN payments p ON p.id=i.payment_id AND p.workspace_id=$2
     LEFT JOIN orders o ON o.id=i.order_id AND o.workspace_id=$2
     WHERE i.id=$1 AND i.workspace_id=$2`,
    [incidentId, workspaceId]
  );
  const incident = r.rows[0];
  if (!incident) return null;
  const model = scoreSignals({
    incident,
    payment: incident.payment_id ? {
      amount_in_subunits: incident.amount_in_subunits,
      error_code: incident.error_code,
      status: incident.payment_status,
    } : null,
    order: incident.order_id ? {
      status: incident.order_status,
      amount_in_subunits: incident.order_amount,
    } : null,
  });
  const revenue = Number(incident.amount_in_subunits || incident.order_amount || 0);
  const confidence = model.score >= 75 ? 90 : model.score >= 50 ? 70 : 45;
  await db.query(
    `UPDATE incidents SET recovery_score=$1,recovery_probability=$1,recovery_confidence=$2,
       revenue_at_risk=$3,recommended_action=$4,recommendation_reason=$5
     WHERE id=$6 AND workspace_id=$7`,
    [model.score, confidence, revenue, model.action, model.reason, incidentId, workspaceId]
  );
  return { id:incident.id, type:incident.type, recovery_score:model.score, recovery_probability:model.score,
    recovery_confidence:confidence, revenue_at_risk:revenue, recommended_action:model.action,
    recommendation_reason:model.reason };
}

async function refreshWorkspace(workspaceId) {
  const r = await db.query(`SELECT id FROM incidents WHERE workspace_id=$1 AND status='open'`,[workspaceId]);
  const out=[];
  for(const row of r.rows){ const scored=await scoreIncident(row.id,workspaceId); if(scored)out.push(scored); }
  return out;
}

async function getWorkspaceInsights(workspaceId) {
  await refreshWorkspace(workspaceId);
  const r = await db.query(
    `SELECT id,type,recovery_score,recovery_probability,recovery_confidence,revenue_at_risk,
            recommended_action,recommendation_reason,detected_at
     FROM incidents WHERE workspace_id=$1 AND status='open'
     ORDER BY recovery_score DESC NULLS LAST, revenue_at_risk DESC, detected_at DESC`,
    [workspaceId]
  );
  const rows=r.rows;
  return {
    revenueAtRisk: rows.reduce((n,x)=>n+Number(x.revenue_at_risk||0),0),
    opportunities: rows.filter(x=>Number(x.recovery_score||0)>=50).length,
    highConfidence: rows.filter(x=>Number(x.recovery_score||0)>=75).length,
    incidentScores: rows
  };
}
module.exports={scoreIncident,refreshWorkspace,getWorkspaceInsights};
