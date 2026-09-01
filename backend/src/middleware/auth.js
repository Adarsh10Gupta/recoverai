const jwt = require("jsonwebtoken");
const config = require("../config/env");
function requireAuth(req,res,next){const header=req.headers.authorization||"";const token=header.startsWith("Bearer ")?header.slice(7):null;if(!token)return res.status(401).json({success:false,message:"Authentication required"});try{req.auth=jwt.verify(token,config.jwtSecret);next();}catch{return res.status(401).json({success:false,message:"Session expired or invalid"});}}
module.exports={requireAuth};
