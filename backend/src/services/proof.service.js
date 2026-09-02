const crypto = require('crypto');
const db = require('../db/database');
const razorpayService = require('./razorpay.service');
const auditService = require('./audit.service');

const SCENARIOS = [
  ['UPI_COLLECT_FAILED', 12],
  ['CARD_DECLINED', 12],
  ['GATEWAY_TIMEOUT', 10],
  ['DUPLICATE_WEBHOOK', 8],
  ['AMOUNT_MISMATCH', 8],
];

function deterministicAmount(i) { return (1299 + ((i * 731) % 8701)) * 100; }

async function runBatch(workspaceId, options = {}) {
  const count = Math.max(10, Math.min(100, Number(options.count || 50)));
  const useRazorpayOrders = options.createProviderOrders !== false;
  const batchId = crypto.randomUUID();
  const events = [];
  let scenarioIndex = 0, scenarioUsed = 0;
  for (let i=0;i<count;i++) {
    if (scenarioUsed >= SCENARIOS[scenarioIndex][1] && scenarioIndex < SCENARIOS.length-1) { scenarioIndex++; scenarioUsed=0; }
    const scenario = SCENARIOS[scenarioIndex][0]; scenarioUsed++;
    const amount = deterministicAmount(i);
    let providerOrderId = null;
    if (useRazorpayOrders) {
      try {
        const ro = await razorpayService.createOrder({amount,currency:'INR',receipt:`proof_${batchId.slice(0,8)}_${i}`});
        providerOrderId = ro.id;
      } catch (e) {
        // The proof run remains usable if provider order creation is unavailable.
      }
    }
    const recoverable = ['UPI_COLLECT_FAILED','GATEWAY_TIMEOUT','DUPLICATE_WEBHOOK'].includes(scenario);
    const recovered = recoverable && (i % 5 !== 0);
    events.push({batchId,index:i+1,scenario,amount,providerOrderId,recoverable,recovered});
  }
  const r = await db.query(`INSERT INTO proof_batches(id,workspace_id,mode,total_events,total_at_risk,recovered_amount,recovered_count,scenario_counts,provider_order_count) VALUES($1,$2,'sandbox_simulation',$3,$4,$5,$6,$7,$8) RETURNING *`, [batchId,workspaceId,count,events.reduce((n,e)=>n+e.amount,0),events.filter(e=>e.recovered).reduce((n,e)=>n+e.amount,0),events.filter(e=>e.recovered).length,JSON.stringify(events.reduce((m,e)=>(m[e.scenario]=(m[e.scenario]||0)+1,m),{})),events.filter(e=>e.providerOrderId).length]);
  await db.query(`INSERT INTO proof_events(batch_id,workspace_id,sequence,scenario,amount_in_subunits,provider_order_id,recoverable,recovered) SELECT x.batch_id,x.workspace_id,x.sequence,x.scenario,x.amount,x.provider_order_id,x.recoverable,x.recovered FROM jsonb_to_recordset($1::jsonb) AS x(batch_id uuid,workspace_id uuid,sequence int,scenario text,amount bigint,provider_order_id text,recoverable boolean,recovered boolean)`, [JSON.stringify(events.map((e,idx)=>({batch_id:batchId,workspace_id:workspaceId,sequence:idx+1,scenario:e.scenario,amount:e.amount,provider_order_id:e.providerOrderId,recoverable:e.recoverable,recovered:e.recovered})))]);
  await auditService.log({workspaceId,entityType:'PROOF_BATCH',entityId:null,action:'PROOF_BATCH_COMPLETED',metadata:{batchId,count,providerOrderCount:r.rows[0].provider_order_count,mode:'sandbox_simulation'}});
  return r.rows[0];
}

async function getProof(workspaceId) {
  const batches = await db.query(`SELECT * FROM proof_batches WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 10`, [workspaceId]);
  const actual = await db.query(`SELECT COALESCE(SUM(i.revenue_at_risk),0)::bigint AS recovered_amount, COUNT(*)::int AS recovered_incidents FROM incidents i WHERE i.workspace_id=$1 AND i.status='resolved' AND EXISTS (SELECT 1 FROM recovery_actions ra WHERE ra.incident_id=i.id AND ra.workspace_id=$1 AND ra.status='completed')`, [workspaceId]);
  const atRisk = await db.query(`SELECT COALESCE(SUM(revenue_at_risk),0)::bigint AS at_risk, COUNT(*)::int AS incidents FROM incidents WHERE workspace_id=$1`, [workspaceId]);
  return { actualVerified:{recoveredAmount:Number(actual.rows[0].recovered_amount),incidents:actual.rows[0].recovered_incidents}, incidentUniverse:{atRisk:Number(atRisk.rows[0].at_risk),incidents:atRisk.rows[0].incidents}, batches:batches.rows };
}
module.exports = {runBatch,getProof};
