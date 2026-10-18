import { describe, expect, it } from "vitest";
import {
  decryptSigningSecret,
  encryptSigningSecret,
} from "../../../server/security/secret-box";

describe("signing secret encryption", () => {
  it("encrypts and decrypts a signing secret without storing plaintext", () => {
    const secret = "signing-secret-for-test";
    const encrypted = encryptSigningSecret(secret);

    expect(encrypted).toMatch(/^v1:/);
    expect(encrypted).not.toContain(secret);
    expect(decryptSigningSecret(encrypted)).toBe(secret);
  });

  it("can read a legacy plaintext value until it is rotated", () => {
    expect(decryptSigningSecret("legacy-secret")).toBe("legacy-secret");
  });
});
