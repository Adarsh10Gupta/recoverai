const config = require("../config/env");
const connectionService = require("../services/razorpay.connection.service");

async function connect(req, res) {
  try {
    const mode = req.query.mode === "live" ? "live" : "test";
    const authorizationUrl = await connectionService.getAuthorizationUrl(req.auth.workspaceId, mode);
    return res.json({ success: true, authorizationUrl, mode });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

async function callback(req, res) {
  const frontend = config.frontendOrigin.replace(/\/$/, "");
  try {
    if (req.query.error) throw new Error(req.query.error_description || "Razorpay authorization was denied");
    const connection = await connectionService.connectFromCode({ code: req.query.code, state: req.query.state });
    return res.redirect(`${frontend}/#settings?razorpay=connected&account=${encodeURIComponent(connection.razorpay_account_id)}`);
  } catch (error) {
    console.error("Razorpay OAuth callback failed:", error);
    return res.redirect(`${frontend}/#settings?razorpay=error&message=${encodeURIComponent(error.message)}`);
  }
}

async function status(req, res) {
  try {
    const mode = req.query.mode === "live" ? "live" : "test";
    const connection = await connectionService.getConnection(req.auth.workspaceId, mode);
    return res.json({ success: true, connected: Boolean(connection), connection, mode });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to load Razorpay connection" });
  }
}

module.exports = { connect, callback, status };
