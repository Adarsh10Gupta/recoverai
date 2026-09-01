const db = require('../db/database');
const paymentLink = require('../services/payment-link.service');
const recovery = require('../services/recovery.service');
async function list(req,res){try{return res.json({success:true,paymentLinks:await paymentLink.list(req.auth.workspaceId)})}catch(e){return res.status(500).json({success:false,message:e.message})}}
async function createForIncident(req,res){try{const r=await recovery.recoverIncident(req.params.incidentId,req.auth.workspaceId);return res.json(r)}catch(e){return res.status(400).json({success:false,message:e.message})}}
module.exports={list,createForIncident};
