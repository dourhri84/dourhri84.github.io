// Hashing engine. Produces a HashResult (token + human-readable steps) for
// three selectable widths, per cahier des charges §I.6 / §II.4.3.
//
// - 16-bit: an educational rolling hash, deliberately simple so every step
//   (one per character) can be shown and understood by a beginner.
// - 32-bit: FNV-1a, a real, well-known non-cryptographic hash.
// - 64-bit: a real implementation of MurmurHash3 x64-128 (Cassandra's actual
//   Murmur3Partitioner takes the low 64 bits, h1, as the token), for
//   authenticity in Advanced mode.

import type { HashResult, HashWidth } from "../domain/types";

const MASK64 = (1n << 64n) - 1n;

function rotl64(x: bigint, r: bigint): bigint {
  x &= MASK64;
  return ((x << r) | (x >> (64n - r))) & MASK64;
}

function fmix64(k: bigint): bigint {
  k &= MASK64;
  k ^= k >> 33n;
  k = (k * 0xff51afd7ed558ccdn) & MASK64;
  k ^= k >> 33n;
  k = (k * 0xc4ceb9fe1a85ec53n) & MASK64;
  k ^= k >> 33n;
  return k;
}

/** Real MurmurHash3 x64-128, returns [h1, h2] as unsigned 64-bit BigInts. */
function murmur3X64_128(bytes: Uint8Array, seed = 0n): [bigint, bigint] {
  const c1 = 0x87c37b91114253d5n;
  const c2 = 0x4cf5ad432745937fn;
  let h1 = seed & MASK64;
  let h2 = seed & MASK64;
  const len = BigInt(bytes.length);
  const nblocks = Math.floor(bytes.length / 16);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  for (let i = 0; i < nblocks; i++) {
    let k1 = view.getBigUint64(i * 16, true);
    let k2 = view.getBigUint64(i * 16 + 8, true);

    k1 = (k1 * c1) & MASK64;
    k1 = rotl64(k1, 31n);
    k1 = (k1 * c2) & MASK64;
    h1 ^= k1;

    h1 = rotl64(h1, 27n);
    h1 = (h1 + h2) & MASK64;
    h1 = (h1 * 5n + 0x52dce729n) & MASK64;

    k2 = (k2 * c2) & MASK64;
    k2 = rotl64(k2, 33n);
    k2 = (k2 * c1) & MASK64;
    h2 ^= k2;

    h2 = rotl64(h2, 31n);
    h2 = (h2 + h1) & MASK64;
    h2 = (h2 * 5n + 0x38495ab5n) & MASK64;
  }

  const tailStart = nblocks * 16;
  const tailLen = bytes.length - tailStart;
  let k1 = 0n;
  let k2 = 0n;
  for (let i = tailLen - 1; i >= 0; i--) {
    const b = BigInt(bytes[tailStart + i]);
    if (i >= 8) {
      k2 ^= b << BigInt(8 * (i - 8));
    } else {
      k1 ^= b << BigInt(8 * i);
    }
  }
  if (tailLen > 8) {
    k2 = (k2 * c2) & MASK64;
    k2 = rotl64(k2, 33n);
    k2 = (k2 * c1) & MASK64;
    h2 ^= k2;
  }
  if (tailLen > 0) {
    k1 = (k1 * c1) & MASK64;
    k1 = rotl64(k1, 31n);
    k1 = (k1 * c2) & MASK64;
    h1 ^= k1;
  }

  h1 ^= len;
  h2 ^= len;
  h1 = (h1 + h2) & MASK64;
  h2 = (h2 + h1) & MASK64;
  h1 = fmix64(h1);
  h2 = fmix64(h2);
  h1 = (h1 + h2) & MASK64;
  h2 = (h2 + h1) & MASK64;

  return [h1, h2];
}

function toSigned(u: bigint, width: HashWidth): bigint {
  const mask = (1n << BigInt(width)) - 1n;
  u &= mask;
  const signBit = 1n << BigInt(width - 1);
  return u & signBit ? u - (1n << BigInt(width)) : u;
}

export function tokenBounds(width: HashWidth): { min: bigint; max: bigint } {
  const min = -(1n << BigInt(width - 1));
  const max = (1n << BigInt(width - 1)) - 1n;
  return { min, max };
}

function hash16(key: string): { hash: bigint; steps: string[] } {
  const steps: string[] = [];
  let h = 0n;
  steps.push(`start: h = 0`);
  for (const ch of key) {
    const code = BigInt(ch.codePointAt(0) ?? 0);
    h = (h * 31n + code) & 0xffffn;
    steps.push(`'${ch}' (code ${code}) -> h = (h * 31 + ${code}) mod 65536 = ${h}`);
  }
  return { hash: h, steps };
}

function hash32(key: string): { hash: bigint; steps: string[] } {
  const steps: string[] = [];
  let h = 2166136261n;
  const prime = 16777619n;
  const mask = 0xffffffffn;
  steps.push(`start (FNV offset basis): h = ${h}`);
  const bytes = new TextEncoder().encode(key);
  for (const b of bytes) {
    h = (h ^ BigInt(b)) & mask;
    h = (h * prime) & mask;
    steps.push(`byte ${b} -> h = (h XOR ${b}) * ${prime} mod 2^32 = ${h}`);
  }
  return { hash: h, steps };
}

function hash64(key: string): { hash: bigint; steps: string[] } {
  const bytes = new TextEncoder().encode(key);
  const [h1, h2] = murmur3X64_128(bytes);
  const steps = [
    `UTF-8 bytes: [${Array.from(bytes).join(", ")}]`,
    `MurmurHash3_x64_128(key, seed=0) -> h1=${h1}, h2=${h2}`,
    `Cassandra's Murmur3Partitioner uses h1 as the token source (low 64 bits).`,
  ];
  return { hash: h1, steps };
}

export function computeHash(key: string, width: HashWidth): HashResult {
  const { hash, steps } =
    width === 16 ? hash16(key) : width === 32 ? hash32(key) : hash64(key);
  let token = toSigned(hash, width);
  const { min, max } = tokenBounds(width);
  // Mirror Cassandra's reservation of Long.MIN_VALUE for internal use.
  if (token === min) token = max;
  steps.push(`token (signed ${width}-bit, range [${min}, ${max}]) = ${token}`);
  return { key, width, steps, hash, token };
}
