const db = require('../db/database');
const config = require('../config/env');
const razorpayService = require('./razorpay.service');
const connectionService = require('./razorpay.connection.service');
const auditService = require('./audit.service');

async function createRecoveryLink({ workspaceId, order, incident, channel = 'whatsapp' }) {
  if (!workspaceId || !order) throw new Error('workspaceId and order are required');
  const policy = await db.query(`SELECT payment_link_expiry_minutes FROM recovery_policies WHERE workspace_id=$1`, [workspaceId]);
  const expiryMinutes = Number(policy.rows[0]?.payment_link_expiry_minutes || 60);
  const referenceId = `rec_${String(incident?.id || order.id).replace(/-/g,'').slice(0,30)}_${Date.now().toString(36)}`.slice(0,40);
  const expiresAt = Math.floor(Date.now()/1000) + expiryMinutes * 60;
  const connection = await connectionService.getConnectionSecrets(workspaceId);
  const link = await razorpayService.createPaymentLink({
    amount: Number(order.amountInSubunits),
    currency: order.currency,
    referenceId,
    description: `RecoverAI recovery for ${order.merchantOrderId}`,
    expireBy: expiresAt,
    customer: {},
    notes: { recoverai_incident_id: incident?.id || '', recoverai_order_id: order.id },
    accessToken: connection?.accessToken,
  });
  const r = await db.query(`INSERT INTO payment_links(workspace_id,order_id,incident_id,razorpay_payment_link_id,reference_id,short_url,amount_in_subunits,currency,status,expires_at,channel,queued_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,to_timestamp($10),$11,NOW()) RETURNING *`, [workspaceId,order.id,incident?.id || null,link.id,referenceId,link.short_url,link.amount,link.currency,link.status,expiresAt,channel]);
  await auditService.log({workspaceId,entityType:'RECOVERY_ACTION',entityId:null,action:'PAYMENT_LINK_CREATED',metadata:{workspaceId,orderId:order.id,incidentId:incident?.id || null,paymentLinkId:link.id,shortUrl:link.short_url,channel}});
  return r.rows[0];
}

async function list(workspaceId) {
  const r = await db.query(`SELECT pl.*,o.merchant_order_id,i.type AS incident_type FROM payment_links pl LEFT JOIN orders o ON o.id=pl.order_id LEFT JOIN incidents i ON i.id=pl.incident_id WHERE pl.workspace_id=$1 ORDER BY pl.created_at DESC LIMIT 100`, [workspaceId]);
  return r.rows;
}

async function markPaid(paymentLinkId, paymentId = null) {
  const r = await db.query(`UPDATE payment_links SET status='paid',paid_at=NOW(),updated_at=NOW() WHERE razorpay_payment_link_id=$1 RETURNING *`, [paymentLinkId]);
  return r.rows[0] || null;
}

module.exports = { createRecoveryLink, list, markPaid };
