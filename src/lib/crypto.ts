// ============================================================
// Password hashing — the plain password NEVER leaves the device.
// Primary: bcrypt (cost 10). Fallback if bcrypt fails at runtime:
// iterated salted SHA-256 in pure JS. Only the hash + salt are
// stored in the Supabase `public.users` SQL table. No email
// verification, no auth.users, no supabase.auth.* calls.
// ============================================================
import * as Crypto from "expo-crypto";
import bcrypt from "bcryptjs";

export interface HashedPassword {
  algorithm: "bcrypt" | "sha256-pbkdf2";
  salt: string; // hex
  hash: string; // bcrypt string or hex digest
}

function randomSaltHex(bytes = 16): string {
  try {
    const arr = Crypto.getRandomBytes(bytes);
    return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    let out = "";
    for (let i = 0; i < bytes * 2; i++) out += Math.floor(Math.random() * 16).toString(16);
    return out;
  }
}

/** Pure-JS SHA-256 (no native deps) — used only by the fallback path. */
function sha256(msgHex: string): string {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x232e4b6c, 0x23389d05, 0x33f49111, 0x365ce85d, 0x87c4000e, 0x98fb49a1,
    0xa1f0a805, 0xb7c2466b, 0xa4781d6a, 0xbd3af3b5, 0x48b62c1b, 0x6b2fa72b, 0x8eb44a7c, 0xa5f1408f,
    0x917eee3e, 0xb2c4e5e0, 0x697ff7a5, 0x7a9b6f93, 0x8a3b7c9d, 0x91a2b3c4, 0xa5b6c7d8, 0xb9c0d1e2
  ];
  const bytes: number[] = [];
  for (let i = 0; i < msgHex.length; i += 2) bytes.push(parseInt(msgHex.substr(i, 2), 16));
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push((bitLen / Math.pow(2, i * 8)) & 0xff);

  let h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  const w = new Array(64);
  for (let off = 0; off < bytes.length; off += 64) {
    for (let i = 0; i < 16; i++)
      w[i] = ((bytes[off + i * 4] << 24) | (bytes[off + i * 4 + 1] << 16) | (bytes[off + i * 4 + 2] << 8) | bytes[off + i * 4 + 3]) >>> 0;
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h = h.map((x, i) => (x + [a, b, c, d, e, f, g, hh][i]) >>> 0);
  }
  return h.map((x) => x.toString(16).padStart(8, "0")).join("");
}

const utf8ToHex = (s: string) =>
  Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, "0")).join("");

function pbkdf2(saltHex: string, plain: string, iterations = 1000): string {
  let digest = sha256(saltHex + utf8ToHex(plain));
  for (let i = 1; i < iterations; i++) digest = sha256(digest + saltHex);
  return digest;
}

/** Hash a plain-text password with a random salt. */
export async function hashPassword(plain: string): Promise<HashedPassword> {
  const salt = randomSaltHex();
  try {
    const hash = await bcrypt.hash(plain, 10);
    return { algorithm: "bcrypt", salt, hash };
  } catch {
    return { algorithm: "sha256-pbkdf2", salt, hash: pbkdf2(salt, plain) };
  }
}

/** Verify a plain password against a stored hash record. */
export async function verifyPassword(plain: string, stored: HashedPassword): Promise<boolean> {
  try {
    if (stored.algorithm === "bcrypt") return await bcrypt.compare(plain, stored.hash);
    return pbkdf2(stored.salt, plain) === stored.hash;
  } catch {
    return false;
  }
}
