import "server-only";
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

/**
 * Encrypts the AI provider key at rest (Phase D). AES-256-GCM: authenticated,
 * so a tampered ciphertext fails to decrypt rather than decrypting to junk.
 *
 * Be clear-eyed about what this buys: a key in the database is only as safe
 * as the database plus the encryption key. This keeps it out of backups,
 * logs and anyone reading the table directly; it does not protect against
 * someone who holds both DATABASE_URL and the encryption key.
 *
 * Encryption key, in order of preference:
 *   1. SETTINGS_ENCRYPTION_KEY -- a dedicated secret (32+ characters).
 *   2. Derived from AUTH_SECRET via HKDF with a purpose label, so the
 *      session-signing key and this key are never the same bytes.
 * Rotating whichever one is in use makes the stored API key unreadable --
 * the settings page then says so and asks for the key to be entered again.
 *
 * Stored format: "v1:" + base64(iv[12] | tag[16] | ciphertext).
 */

const VERSION = "v1";

function encryptionKey(): Buffer {
  const dedicated = process.env.SETTINGS_ENCRYPTION_KEY;
  if (dedicated && dedicated.length >= 32) {
    return createHash("sha256").update(dedicated).digest();
  }
  const auth = process.env.AUTH_SECRET;
  if (!auth || auth.length < 32) {
    throw new Error("No encryption key: set SETTINGS_ENCRYPTION_KEY or AUTH_SECRET (32+ characters).");
  }
  return Buffer.from(hkdfSync("sha256", auth, "one.simple", "ai-provider-key v1", 32));
}

export function encryptionKeySource(): "dedicated" | "derived" | "none" {
  const dedicated = process.env.SETTINGS_ENCRYPTION_KEY;
  if (dedicated && dedicated.length >= 32) return "dedicated";
  const auth = process.env.AUTH_SECRET;
  return auth && auth.length >= 32 ? "derived" : "none";
}

export function sealSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${Buffer.concat([iv, tag, ct]).toString("base64")}`;
}

/** Returns null (never throws) when the value cannot be decrypted. */
export function openSecret(sealed: string | null | undefined): string | null {
  if (!sealed || !sealed.startsWith(`${VERSION}:`)) return null;
  try {
    const raw = Buffer.from(sealed.slice(VERSION.length + 1), "base64");
    if (raw.length < 29) return null;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ct = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
