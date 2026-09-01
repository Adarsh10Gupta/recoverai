const crypto = require("crypto");
const webhookService = require("../services/webhook.service");
const connectionService = require("../services/razorpay.connection.service");
const config = require("../config/env");

function verify(rawBody, signature, secret) {
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function handleRazorpayWebhook(req,res){
  try {
    const signature=req.headers["x-razorpay-signature"];
    const eventId=req.headers["x-razorpay-event-id"];
    if(!signature)return res.status(400).json({success:false,message:"Missing Razorpay webhook signature"});
    if(!eventId)return res.status(400).json({success:false,message:"Missing Razorpay event ID"});
    const rawBody=req.body;
    const payload=JSON.parse(rawBody.toString("utf8"));
    if(!webhookService.validateTimestamp(payload))return res.status(400).json({success:false,message:"Webhook timestamp outside replay window"});

    const accountId=payload.account_id || payload.account?.id || null;
    let workspaceId=null;
    let secret=config.razorpayWebhookSecret;
    if(accountId){
      const connection=await connectionService.findByAccountId(accountId);
      if(!connection)return res.status(404).json({success:false,message:"Unknown Razorpay account"});
      secret=connection.webhookSecret;
      workspaceId=connection.workspace_id;
      if(!secret)return res.status(500).json({success:false,message:"Webhook secret is not configured for this connection"});
    }
    if(!secret || !verify(rawBody,signature,secret))return res.status(400).json({success:false,message:"Invalid webhook signature"});

    const saved=await webhookService.saveEvent({eventId,eventType:payload.event,payload,signature,workspaceId,razorpayAccountId:accountId});
    if(!saved)return res.status(200).json({success:true,duplicate:true,eventId,eventType:payload.event});
    return res.status(200).json({success:true,accepted:true,eventId,eventType:payload.event,workspaceId});
  } catch(error){
    console.error("Webhook intake failed:",error);
    return res.status(400).json({success:false,message:"Invalid webhook payload"});
  }
}

module.exports={handleRazorpayWebhook};
