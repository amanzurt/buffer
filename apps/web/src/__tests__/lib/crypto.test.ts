import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "@/lib/crypto";

const KEY = "a".repeat(64); // 32 bytes en hex

describe("crypto", () => {
  it("roundtrip: encrypt → decrypt devuelve el texto original", () => {
    const plaintext = "token_super_secreto_123";
    const encoded = encrypt(plaintext, KEY);
    expect(decrypt(encoded, KEY)).toBe(plaintext);
  });

  it("dos cifrados del mismo texto producen ciphertext distintos (IV aleatorio)", () => {
    const plaintext = "mismo texto";
    const a = encrypt(plaintext, KEY);
    const b = encrypt(plaintext, KEY);
    expect(a).not.toBe(b);
    expect(decrypt(a, KEY)).toBe(plaintext);
    expect(decrypt(b, KEY)).toBe(plaintext);
  });

  it("el encoded tiene 3 partes separadas por :", () => {
    const encoded = encrypt("test", KEY);
    const parts = encoded.split(":");
    expect(parts).toHaveLength(3);
  });

  it("lanza error al descifrar con clave incorrecta", () => {
    const encoded = encrypt("texto", KEY);
    const wrongKey = "b".repeat(64);
    expect(() => decrypt(encoded, wrongKey)).toThrow();
  });
});
