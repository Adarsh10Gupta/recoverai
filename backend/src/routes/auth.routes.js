const express=require("express"); const c=require("../controllers/auth.controller"); const {requireAuth}=require("../middleware/auth"); const r=express.Router();
r.post("/signup",c.signup); r.post("/login",c.login); r.get("/me",requireAuth,c.me); module.exports=r;
