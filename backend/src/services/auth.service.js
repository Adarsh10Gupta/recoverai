const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("../db/database");
const config = require("../config/env");

function sign(user) {
  return jwt.sign({ sub: user.id, workspaceId: user.workspace_id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

async function signup({ name, email, password, workspaceName }) {
  const normalized = String(email).trim().toLowerCase();
  if (!name || !normalized || !password || password.length < 8) throw new Error("Name, email and an 8+ character password are required");
  const existing = await db.query(`SELECT id FROM users WHERE email=$1`, [normalized]);
  if (existing.rows[0]) throw new Error("An account with that email already exists");
  const baseSlug = (workspaceName || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "workspace";
  const slug = `${baseSlug}-${crypto.randomBytes(3).toString("hex")}`;
  const hash = await bcrypt.hash(password, 12);
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const ws = await client.query(`INSERT INTO workspaces(name,slug) VALUES($1,$2) RETURNING *`, [workspaceName || `${name}'s Workspace`, slug]);
    const user = await client.query(`INSERT INTO users(workspace_id,name,email,password_hash,role) VALUES($1,$2,$3,$4,'owner') RETURNING id,workspace_id,name,email,role,created_at`, [ws.rows[0].id, name.trim(), normalized, hash]);
    await client.query("COMMIT");
    return { user: user.rows[0], workspace: ws.rows[0], token: sign(user.rows[0]) };
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
}

async function login({ email, password }) {
  const result = await db.query(`SELECT u.id,u.workspace_id,u.name,u.email,u.role,u.password_hash,w.name AS workspace_name,w.slug AS workspace_slug FROM users u JOIN workspaces w ON w.id=u.workspace_id WHERE u.email=$1`, [String(email).trim().toLowerCase()]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) throw new Error("Invalid email or password");
  delete user.password_hash;
  return { user, workspace: { id:user.workspace_id,name:user.workspace_name,slug:user.workspace_slug }, token: sign(user) };
}

async function me(userId) {
  const result = await db.query(`SELECT u.id,u.workspace_id,u.name,u.email,u.role,w.name AS workspace_name,w.slug AS workspace_slug FROM users u JOIN workspaces w ON w.id=u.workspace_id WHERE u.id=$1`, [userId]);
  if (!result.rows[0]) throw new Error("User not found");
  const u=result.rows[0]; return { user:u, workspace:{id:u.workspace_id,name:u.workspace_name,slug:u.workspace_slug} };
}
module.exports = { signup, login, me };
