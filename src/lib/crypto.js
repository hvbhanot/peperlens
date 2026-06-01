import crypto from "crypto";

// AES-256-GCM symmetric encryption for the user's Ollama API key.
// The key never leaves the server in plaintext; it is decrypted only at the
// moment of an Ollama request inside the /api/explain route handler.

const ALGO = "aes-256-gcm";

function getKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ENCRYPTION_KEY is not set (need 64 hex chars / 32 bytes).");
  }
  const buf = Buffer.from(raw, "hex");
  if (buf.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY must be 32 bytes encoded as 64 hex characters. Run `npm run keygen`."
    );
  }
  return buf;
}

// Returns base64( iv[12] | authTag[16] | ciphertext ).
export function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decrypt(payload) {
  const data = Buffer.from(payload, "base64");
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const enc = data.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
