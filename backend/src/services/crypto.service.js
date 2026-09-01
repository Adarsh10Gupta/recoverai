const crypto = require("crypto");
const config = require("../config/env");

function key() {
  return Buffer.from(config.encryptionKey, "hex");
}

function encrypt(value) {
  if (value == null) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), ciphertext.toString("hex")].join(".");
}

function decrypt(value) {
  if (!value) return null;
  const [ivHex, tagHex, dataHex] = String(value).split(".");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function randomSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

module.exports = { encrypt, decrypt, hash, randomSecret };
