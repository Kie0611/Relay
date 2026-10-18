import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const algorithm = "aes-256-gcm";
const version = "v1";

function getEncryptionKey(): Buffer {
  const configuredKey = process.env.RELAY_SECRET_ENCRYPTION_KEY;

  if (!configuredKey && process.env.NODE_ENV === "test") {
    return createHash("sha256")
      .update("relay-test-only-secret-key")
      .digest();
  }

  if (!configuredKey) {
    throw new Error("RELAY_SECRET_ENCRYPTION_KEY is not configured");
  }

  const key = Buffer.from(configuredKey, "base64");

  if (key.length !== 32) {
    throw new Error(
      "RELAY_SECRET_ENCRYPTION_KEY must decode to 32 bytes",
    );
  }

  return key;
}

export function encryptSigningSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    version,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptSigningSecret(storedSecret: string): string {
  if (!storedSecret.startsWith(`${version}:`)) {
    // Backwards compatibility for rows created before encryption was added.
    // New writes always use the encrypted format above; rotate legacy rows.
    return storedSecret;
  }

  const [, encodedIv, encodedAuthTag, encodedCiphertext] =
    storedSecret.split(":");

  if (!encodedIv || !encodedAuthTag || !encodedCiphertext) {
    throw new Error("Stored signing secret has an invalid format");
  }

  const decipher = createDecipheriv(
    algorithm,
    getEncryptionKey(),
    Buffer.from(encodedIv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(encodedAuthTag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
