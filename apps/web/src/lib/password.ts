import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

// Password hashing with scrypt (no external dependency). Stored as "salt:hash".
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const hashBuf = Buffer.from(hash, "hex");
  const candidate = scryptSync(password, salt, 64);
  return hashBuf.length === candidate.length && timingSafeEqual(hashBuf, candidate);
}
