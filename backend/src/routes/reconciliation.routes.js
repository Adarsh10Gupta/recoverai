const express = require("express");

const controller =
  require("../controllers/reconciliation.controller");

const router =
  express.Router();


router.get(
  "/:merchantOrderId",
  controller.reconcile
);


router.post(
  "/:merchantOrderId/recover",
  controller.recover
);


module.exports = router;
