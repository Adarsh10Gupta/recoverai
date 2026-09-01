const db = require('../db/database');
const policyService = require('./policy.service');
const auditService = require('./audit.service');

async function scanWorkspace(workspaceId) {
  const policy = await policyService.getPolicy(workspaceId);
  const r = await db.query(`SELECT o.* FROM orders o WHERE o.workspace_id=$1 AND o.status IN ('created','attempted') AND o.created_at < NOW() - ($2 * INTERVAL '1 minute') AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id=o.id AND p.status IN ('captured','authorized')) ORDER BY o.created_at ASC LIMIT 100`, [workspaceId, policy.abandonment_minutes]);
  let created = 0;
  for (const order of r.rows) {
    const existing = await db.query(`SELECT id FROM incidents WHERE workspace_id=$1 AND order_id=$2 AND type='CHECKOUT_ABANDONED' AND status='open' LIMIT 1`, [workspaceId,order.id]);
    if (existing.rows[0]) continue;
    await db.query(`INSERT INTO incidents(workspace_id,order_id,type,severity,status,description,expected_state,actual_state) VALUES($1,$2,'CHECKOUT_ABANDONED','medium','open',$3,$4,$5)`, [workspaceId,order.id,`Checkout stalled for more than ${policy.abandonment_minutes} minutes without a completed payment.`,{orderStatus:'paid',windowMinutes:policy.abandonment_minutes},{orderStatus:order.status,ageMinutes:Math.floor((Date.now()-new Date(order.created_at).getTime())/60000)}]);
    await auditService.log({workspaceId,entityType:'ORDER',entityId:order.id,action:'CHECKOUT_ABANDONMENT_DETECTED',metadata:{abandonmentMinutes:policy.abandonment_minutes}});
    created++;
  }
  return {created,checked:r.rows.length};
}

async function scanAll() {
  const r = await db.query(`SELECT id FROM workspaces ORDER BY created_at`);
  const out=[]; for(const row of r.rows){ try{out.push({workspaceId:row.id,...await scanWorkspace(row.id)});}catch(e){console.error('Abandonment scan error:',e.message);} }
  return out;
}
module.exports={scanWorkspace,scanAll};
