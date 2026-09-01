const auth = require("../services/auth.service");
async function signup(req,res){try{return res.status(201).json({success:true,...await auth.signup(req.body)})}catch(e){return res.status(400).json({success:false,message:e.message})}}
async function login(req,res){try{return res.json({success:true,...await auth.login(req.body)})}catch(e){return res.status(401).json({success:false,message:e.message})}}
async function me(req,res){try{return res.json({success:true,...await auth.me(req.auth.sub)})}catch(e){return res.status(404).json({success:false,message:e.message})}}
module.exports={signup,login,me};
