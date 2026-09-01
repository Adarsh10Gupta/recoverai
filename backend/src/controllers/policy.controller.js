const policy = require('../services/policy.service');
async function get(req,res){try{return res.json({success:true,policy:await policy.getPolicy(req.auth.workspaceId)})}catch(e){return res.status(500).json({success:false,message:e.message})}}
async function update(req,res){try{return res.json({success:true,policy:await policy.updatePolicy(req.auth.workspaceId,req.body)})}catch(e){return res.status(400).json({success:false,message:e.message})}}
module.exports={get,update};
