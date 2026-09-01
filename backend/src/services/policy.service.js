const db = require('../db/database');

async function getPolicy(workspaceId) {
  await db.query(`INSERT INTO recovery_policies(workspace_id) VALUES($1) ON CONFLICT(workspace_id) DO NOTHING`, [workspaceId]);
  const r = await db.query(`SELECT * FROM recovery_policies WHERE workspace_id=$1`, [workspaceId]);
  return r.rows[0];
}

async function updatePolicy(workspaceId, input = {}) {
  const current = await getPolicy(workspaceId);
  const next = {
    max_retries: Number.isFinite(Number(input.maxRetries)) ? Math.max(0, Math.min(10, Number(input.maxRetries))) : current.max_retries,
    cooldown_minutes: Number.isFinite(Number(input.cooldownMinutes)) ? Math.max(0, Math.min(1440, Number(input.cooldownMinutes))) : current.cooldown_minutes,
    auto_recover_score: Number.isFinite(Number(input.autoRecoverScore)) ? Math.max(0, Math.min(100, Number(input.autoRecoverScore))) : current.auto_recover_score,
    human_approval_amount: Number.isFinite(Number(input.humanApprovalAmount)) ? Math.max(0, Number(input.humanApprovalAmount)) : current.human_approval_amount,
    stop_on_chargeback: typeof input.stopOnChargeback === 'boolean' ? input.stopOnChargeback : current.stop_on_chargeback,
    abandonment_minutes: Number.isFinite(Number(input.abandonmentMinutes)) ? Math.max(5, Math.min(1440, Number(input.abandonmentMinutes))) : current.abandonment_minutes,
    payment_link_expiry_minutes: Number.isFinite(Number(input.paymentLinkExpiryMinutes)) ? Math.max(5, Math.min(4320, Number(input.paymentLinkExpiryMinutes))) : current.payment_link_expiry_minutes,
  };
  const r = await db.query(`UPDATE recovery_policies SET max_retries=$2,cooldown_minutes=$3,auto_recover_score=$4,human_approval_amount=$5,stop_on_chargeback=$6,abandonment_minutes=$7,payment_link_expiry_minutes=$8,updated_at=NOW() WHERE workspace_id=$1 RETURNING *`, [workspaceId,next.max_retries,next.cooldown_minutes,next.auto_recover_score,next.human_approval_amount,next.stop_on_chargeback,next.abandonment_minutes,next.payment_link_expiry_minutes]);
  return r.rows[0];
}

async function checkActionAllowed(workspaceId, incident, score = 0) {
  const policy = await getPolicy(workspaceId);
  const blockers = [];
  const attempts = await db.query(`SELECT COUNT(*)::int AS count FROM recovery_actions WHERE incident_id=$1 AND workspace_id=$2 AND status IN ('running','completed')`, [incident.id, workspaceId]);
  if (attempts.rows[0].count >= policy.max_retries) blockers.push(`Maximum retry/action limit reached (${policy.max_retries}).`);
  const cooldown = await db.query(`SELECT created_at FROM recovery_actions WHERE incident_id=$1 AND workspace_id=$2 ORDER BY created_at DESC LIMIT 1`, [incident.id, workspaceId]);
  if (cooldown.rows[0] && Date.now() - new Date(cooldown.rows[0].created_at).getTime() < policy.cooldown_minutes * 60000) blockers.push(`Cooldown active for ${policy.cooldown_minutes} minutes.`);
  const amount = Number(incident.revenue_at_risk || 0) / 100;
  if (policy.human_approval_amount > 0 && amount > Number(policy.human_approval_amount)) blockers.push(`Human approval required above ₹${Number(policy.human_approval_amount).toLocaleString('en-IN')}.`);
  if (score < policy.auto_recover_score && incident.type === 'CHECKOUT_ABANDONED') blockers.push(`Recovery score ${score}% is below the auto-recovery threshold of ${policy.auto_recover_score}%.`);
  if (policy.stop_on_chargeback && /CHARGEBACK|DISPUTE/i.test(incident.type)) blockers.push('Automation stops on chargeback/dispute incidents.');
  return { allowed: blockers.length === 0, blockers, policy };
}

module.exports = { getPolicy, updatePolicy, checkActionAllowed };
