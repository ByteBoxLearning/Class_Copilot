import "server-only";
import crypto from "crypto";

// Small AES-256-GCM helper for encrypting secrets (API keys) stored in the
// database. The key is derived from AUTH_SECRET, so no new env var is needed.
// Format: base64(iv).base64(authTag).base64(ciphertext).
//
// AUTH_SECRET is REQUIRED — there is NO "dev-secret" fallback, so secrets are
// never encrypted under a predictable key. Derived lazily so a missing secret
// only fails when crypto is actually used (not at module import / build time).
function secretKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set — required for secret encryption.");
  return crypto.createHash("sha256").update(secret).digest(); // 32 bytes
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(blob: string): string {
  const [iv, tag, enc] = blob.split(".").map((s) => Buffer.from(s, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
