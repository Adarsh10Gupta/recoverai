const express=require("express");
const c=require("../controllers/dashboard.controller");
const {requireAuth}=require("../middleware/auth");
const r=express.Router(); r.use(requireAuth);
r.get("/summary",c.summary); r.get("/incidents",c.incidents); r.get("/payments",c.payments);
r.get("/orders",c.orders); r.get("/audit",c.audit); r.get("/incident/:id",c.incident);
r.get("/intelligence",c.intelligencePage); r.get("/automation",c.automationPage); r.post("/automation",c.toggleAutomation);
module.exports=r;
