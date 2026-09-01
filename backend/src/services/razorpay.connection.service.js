const crypto = require("crypto");
const db = require("../db/database");
const config = require("../config/env");
const cryptoService = require("./crypto.service");

const AUTH_URL = "https://auth.razorpay.com/authorize";
const TOKEN_URL = "https://auth.razorpay.com/token";
const API_BASE = "https://api.razorpay.com";

function assertOAuthConfigured() {
  if (!config.razorpayOAuthClientId || !config.razorpayOAuthClientSecret || !config.razorpayOAuthRedirectUri) {
    throw new Error("Razorpay OAuth is not configured. Add the Partner OAuth client ID, client secret and redirect URI to .env.");
  }
}

function normalizeMode(mode) {
  return mode === "live" ? "live" : "test";
}

async function createState(workspaceId, mode) {
  const raw = crypto.randomBytes(32).toString("base64url");
  await db.query(
    `INSERT INTO razorpay_oauth_states(workspace_id,state_hash,mode,expires_at)
     VALUES($1,$2,$3,NOW()+INTERVAL '10 minutes')`,
    [workspaceId, cryptoService.hash(raw), normalizeMode(mode)]
  );
  return raw;
}

async function consumeState(rawState) {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT * FROM razorpay_oauth_states
       WHERE state_hash=$1 AND used_at IS NULL AND expires_at > NOW()
       FOR UPDATE`,
      [cryptoService.hash(rawState)]
    );
    if (!result.rows[0]) {
      await client.query("ROLLBACK");
      throw new Error("Invalid or expired Razorpay OAuth state");
    }
    await client.query(`UPDATE razorpay_oauth_states SET used_at=NOW() WHERE id=$1`, [result.rows[0].id]);
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

async function getAuthorizationUrl(workspaceId, mode = config.razorpayOAuthMode) {
  assertOAuthConfigured();
  const normalizedMode = normalizeMode(mode);
  const state = await createState(workspaceId, normalizedMode);
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", config.razorpayOAuthClientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", config.razorpayOAuthRedirectUri);
  url.searchParams.set("scope", "read_write");
  url.searchParams.set("state", state);
  return url.toString();
}

async function exchangeCode(code, mode) {
  assertOAuthConfigured();
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.razorpayOAuthClientId,
      client_secret: config.razorpayOAuthClientSecret,
      grant_type: "authorization_code",
      redirect_uri: config.razorpayOAuthRedirectUri,
      code: decodeURIComponent(code),
      mode: normalizeMode(mode),
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.description || body.error || "Razorpay OAuth token exchange failed");
  return body;
}

async function razorpayRequest(accessToken, path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body.error?.description || body.error || body.message || `Razorpay API request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function createWebhook({ accessToken, accountId, url, alertEmail, secret }) {
  const events = [
    "payment.authorized",
    "payment.captured",
    "payment.failed",
    "order.paid",
    "refund.created",
    "refund.failed",
  ];
  return razorpayRequest(accessToken, `/v2/accounts/${encodeURIComponent(accountId)}/webhooks`, {
    method: "POST",
    body: JSON.stringify({ url, alert_email: alertEmail, secret, events }),
  });
}

async function connectFromCode({ code, state }) {
  const stateRow = await consumeState(state);
  const tokens = await exchangeCode(code, stateRow.mode);
  if (!tokens.access_token || !tokens.razorpay_account_id) throw new Error("Razorpay did not return a usable account authorization");
  if (!config.publicWebhookUrl) throw new Error("PUBLIC_WEBHOOK_URL is required before connecting a Razorpay account");

  const ownerResult = await db.query(`SELECT email FROM users WHERE workspace_id=$1 ORDER BY created_at LIMIT 1`, [stateRow.workspace_id]);
  const alertEmail = config.webhookAlertEmail || ownerResult.rows[0]?.email || "";
  if (!alertEmail) throw new Error("A webhook alert email is required");

  const webhookSecret = cryptoService.randomSecret(32);
  let webhook = null;
  if (config.publicWebhookUrl) {
    webhook = await createWebhook({
      accessToken: tokens.access_token,
      accountId: tokens.razorpay_account_id,
      url: config.publicWebhookUrl,
      alertEmail,
      secret: webhookSecret,
    });
  }

  const result = await db.query(
    `INSERT INTO razorpay_connections(
      workspace_id,mode,razorpay_account_id,access_token_encrypted,refresh_token_encrypted,
      public_token_encrypted,access_token_expires_at,refresh_token_expires_at,
      webhook_id,webhook_secret_encrypted,webhook_url,status
    ) VALUES($1,$2,$3,$4,$5,$6,NOW()+($7 * INTERVAL '1 second'),NOW()+($8 * INTERVAL '1 second'),$9,$10,$11,'active')
    ON CONFLICT(workspace_id,mode) DO UPDATE SET
      razorpay_account_id=EXCLUDED.razorpay_account_id,
      access_token_encrypted=EXCLUDED.access_token_encrypted,
      refresh_token_encrypted=EXCLUDED.refresh_token_encrypted,
      public_token_encrypted=EXCLUDED.public_token_encrypted,
      access_token_expires_at=EXCLUDED.access_token_expires_at,
      refresh_token_expires_at=EXCLUDED.refresh_token_expires_at,
      webhook_id=EXCLUDED.webhook_id,
      webhook_secret_encrypted=EXCLUDED.webhook_secret_encrypted,
      webhook_url=EXCLUDED.webhook_url,
      status='active',updated_at=NOW()
    RETURNING id,workspace_id,mode,razorpay_account_id,status,webhook_id,webhook_url,created_at,updated_at`,
    [
      stateRow.workspace_id,
      stateRow.mode,
      tokens.razorpay_account_id,
      cryptoService.encrypt(tokens.access_token),
      cryptoService.encrypt(tokens.refresh_token),
      cryptoService.encrypt(tokens.public_token || null),
      Number(tokens.expires_in || 7776000),
      15552000,
      webhook?.id || null,
      cryptoService.encrypt(webhookSecret),
      webhook?.url || config.publicWebhookUrl,
    ]
  );
  return result.rows[0];
}

async function getConnection(workspaceId, mode = config.razorpayOAuthMode) {
  const result = await db.query(
    `SELECT id,workspace_id,mode,razorpay_account_id,status,access_token_expires_at,refresh_token_expires_at,webhook_id,webhook_url,created_at,updated_at
     FROM razorpay_connections WHERE workspace_id=$1 AND mode=$2`,
    [workspaceId, normalizeMode(mode)]
  );
  return result.rows[0] || null;
}

async function getConnectionSecrets(workspaceId, mode = config.razorpayOAuthMode) {
  const result = await db.query(`SELECT * FROM razorpay_connections WHERE workspace_id=$1 AND mode=$2`, [workspaceId, normalizeMode(mode)]);
  const row = result.rows[0];
  if (!row) return null;
  return {
    ...row,
    accessToken: cryptoService.decrypt(row.access_token_encrypted),
    refreshToken: cryptoService.decrypt(row.refresh_token_encrypted),
    publicToken: cryptoService.decrypt(row.public_token_encrypted),
    webhookSecret: cryptoService.decrypt(row.webhook_secret_encrypted),
  };
}

async function findByAccountId(accountId) {
  const result = await db.query(`SELECT * FROM razorpay_connections WHERE razorpay_account_id=$1 AND status='active' ORDER BY updated_at DESC LIMIT 1`, [accountId]);
  const row = result.rows[0];
  if (!row) return null;
  return {
    ...row,
    accessToken: cryptoService.decrypt(row.access_token_encrypted),
    refreshToken: cryptoService.decrypt(row.refresh_token_encrypted),
    publicToken: cryptoService.decrypt(row.public_token_encrypted),
    webhookSecret: cryptoService.decrypt(row.webhook_secret_encrypted),
  };
}

module.exports = { getAuthorizationUrl, connectFromCode, getConnection, getConnectionSecrets, findByAccountId, razorpayRequest };
