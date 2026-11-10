import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

// Encrypts values an admin stores through the admin panel (org_config.ai_api_key today). AES-256-GCM keyed
// by CONFIG_ENCRYPTION_KEY — a dedicated secret rather than BETTER_AUTH_SECRET, so rotating sign-in keys
// doesn't strand stored keys and vice versa (the auth secret is only the dev fallback). The ciphertext
// goes nowhere but the database; admin screens get a masked tail, never the value.

const key = () => createHash("sha256").update(`trackwise-config:${process.env.CONFIG_ENCRYPTION_KEY ?? process.env.BETTER_AUTH_SECRET ?? ""}`).digest();

/** Encrypts a secret to a portable `iv.tag.ciphertext` base64 string. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(".");
}

/** Decrypts a payload from encryptSecret; null on a bad key or tampered ciphertext. */
export function decryptSecret(payload: string): string | null {
  try {
    const [iv, tag, ciphertext] = payload.split(".").map((part) => Buffer.from(part, "base64"));
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
