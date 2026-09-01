const db=require("../db/database");
const intelligence=require("../services/recovery.intelligence.service");
const automation=require("../services/automation.service");

async function summary(req,res){
 const w=req.auth.workspaceId;
 const [inc,pay,ord,rec,events]=await Promise.all([
  db.query(`SELECT COUNT(*) FILTER(WHERE status='open')::int AS open, COUNT(*) FILTER(WHERE severity='critical' AND status='open')::int AS critical, COUNT(*)::int AS total FROM incidents WHERE workspace_id=$1`,[w]),
  db.query(`SELECT COUNT(*)::int AS total, COALESCE(SUM(amount_in_subunits),0)::bigint AS volume, COUNT(*) FILTER(WHERE status='captured')::int AS captured FROM payments WHERE workspace_id=$1`,[w]),
  db.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER(WHERE status='paid')::int AS paid FROM orders WHERE workspace_id=$1`,[w]),
  db.query(`SELECT COUNT(*) FILTER(WHERE status='completed')::int AS completed, COUNT(*)::int AS total FROM recovery_actions WHERE workspace_id=$1`,[w]),
  db.query(`SELECT COUNT(*)::int AS total FROM webhook_events WHERE workspace_id=$1`,[w])
 ]);
 const rate=rec.rows[0].total?Math.round(rec.rows[0].completed/rec.rows[0].total*100):100;
 const verified=await db.query(`SELECT COALESCE(SUM(i.revenue_at_risk),0)::bigint AS amount, COUNT(*)::int AS incidents FROM incidents i WHERE i.workspace_id=$1 AND i.status='resolved' AND EXISTS (SELECT 1 FROM recovery_actions ra WHERE ra.incident_id=i.id AND ra.workspace_id=$1 AND ra.status='completed' AND COALESCE((ra.result->>'resolved')::boolean,false)=true)`,[w]);
 res.json({success:true,summary:{incidents:inc.rows[0],payments:pay.rows[0],orders:ord.rows[0],recovery:{...rec.rows[0],rate},webhooks:events.rows[0],verifiedRecovered:{amount:Number(verified.rows[0].amount),incidents:verified.rows[0].incidents}}});
}
async function incidents(req,res){await intelligence.refreshWorkspace(req.auth.workspaceId);const r=await db.query(`SELECT i.*,o.merchant_order_id,o.razorpay_order_id FROM incidents i LEFT JOIN orders o ON o.id=i.order_id AND o.workspace_id=$1 WHERE i.workspace_id=$1 ORDER BY i.detected_at DESC LIMIT 100`,[req.auth.workspaceId]);res.json({success:true,incidents:r.rows});}
async function payments(req,res){const r=await db.query(`SELECT * FROM payments WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100`,[req.auth.workspaceId]);res.json({success:true,payments:r.rows});}
async function orders(req,res){const r=await db.query(`SELECT * FROM orders WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100`,[req.auth.workspaceId]);res.json({success:true,orders:r.rows});}
async function audit(req,res){const r=await db.query(`SELECT * FROM audit_logs WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 150`,[req.auth.workspaceId]);res.json({success:true,logs:r.rows});}
async function incident(req,res){const r=await db.query(`SELECT i.*,o.merchant_order_id,o.razorpay_order_id FROM incidents i LEFT JOIN orders o ON o.id=i.order_id AND o.workspace_id=$2 WHERE i.id=$1 AND i.workspace_id=$2`,[req.params.id,req.auth.workspaceId]);if(!r.rows[0])return res.status(404).json({success:false,message:"Incident not found"});const a=await db.query(`SELECT * FROM recovery_actions WHERE incident_id=$1 AND workspace_id=$2 ORDER BY created_at DESC`,[req.params.id,req.auth.workspaceId]);const l=await db.query(`SELECT * FROM audit_logs WHERE workspace_id=$2 AND (entity_id=$1 OR (entity_type='INCIDENT' AND metadata->>'incidentId'=$1)) ORDER BY created_at ASC`,[req.params.id,req.auth.workspaceId]);res.json({success:true,incident:r.rows[0],recoveryActions:a.rows,timeline:l.rows});}
async function intelligencePage(req,res){res.json({success:true,insights:await intelligence.getWorkspaceInsights(req.auth.workspaceId)});}
async function automationPage(req,res){res.json({success:true,automation:await automation.getSettings(req.auth.workspaceId)});}
async function toggleAutomation(req,res){res.json({success:true,automation:await automation.toggle(req.auth.workspaceId,req.body.enabled)});}
module.exports={summary,incidents,payments,orders,audit,incident,intelligencePage,automationPage,toggleAutomation};
