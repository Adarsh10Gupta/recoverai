const db = require("../db/database");
const intelligence = require("./recovery.intelligence.service");
const recovery = require("./recovery.service");

async function getSettings(workspaceId) {
  await db.query(`INSERT INTO automation_settings(workspace_id) VALUES($1) ON CONFLICT(workspace_id) DO NOTHING`,[workspaceId]);
  const r=await db.query(`SELECT * FROM automation_settings WHERE workspace_id=$1`,[workspaceId]);
  return r.rows[0];
}

async function toggle(workspaceId, enabled) {
  const r=await db.query(
    `INSERT INTO automation_settings(workspace_id,enabled) VALUES($1,$2)
     ON CONFLICT(workspace_id) DO UPDATE SET enabled=EXCLUDED.enabled,updated_at=NOW()
     RETURNING *`,[workspaceId,Boolean(enabled)]
  );
  await db.query(`INSERT INTO audit_logs(workspace_id,entity_type,action,actor,metadata)
                  VALUES($1,'AUTOMATION',$2,'user',$3)`,
    [workspaceId,enabled?"AUTOMATION_ENABLED":"AUTOMATION_DISABLED",{mode:"safe_reconcile",minScore:75}]);
  return r.rows[0];
}

async function run(workspaceId) {
  const settings=await getSettings(workspaceId);
  if(!settings.enabled)return {ran:false,reason:"disabled",processed:0};
  const scores=await intelligence.refreshWorkspace(workspaceId);
  const eligible=scores.filter(x=>x.recovery_score>=settings.min_recovery_score && ["LOCAL_STATE_STALE","CHECKOUT_ABANDONED"].includes(x.type));
  let processed=0;
  for(const x of eligible){
    const exists=await db.query(`SELECT id FROM automation_runs WHERE workspace_id=$1 AND incident_id=$2 AND created_at>NOW()-INTERVAL '10 minutes' LIMIT 1`,[workspaceId,x.id]);
    if(exists.rows[0])continue;
    try{
      const result=await recovery.recoverIncident(x.id,workspaceId);
      await db.query(`INSERT INTO automation_runs(workspace_id,incident_id,recovery_action_id,mode,status,score,result)
                      VALUES($1,$2,$3,'safe_reconcile',$4,$5,$6)`,
        [workspaceId,x.id,result.recoveryActionId,result.resolved?"completed":"review_required",x.recovery_score,result]);
      processed++;
    }catch(e){
      await db.query(`INSERT INTO automation_runs(workspace_id,incident_id,mode,status,score,result)
                      VALUES($1,$2,'safe_reconcile','failed',$3,$4)`,
        [workspaceId,x.id,x.recovery_score,{error:e.message}]);
    }
  }
  await db.query(`UPDATE automation_settings SET last_run_at=NOW(),run_count=run_count+1 WHERE workspace_id=$1`,[workspaceId]);
  return {ran:true,processed,eligible:eligible.length};
}
module.exports={getSettings,toggle,run};
