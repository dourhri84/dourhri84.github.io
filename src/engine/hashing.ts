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

/** MurmurHash3 x64-128 exactly as implemented by Apache Cassandra
 * (MurmurHash.hash3_x64_128, including its signed-tail quirk); returns [h1, h2] as unsigned 64-bit BigInts. */
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
    // Cassandra compatibility: org.apache.cassandra.utils.MurmurHash reads tail
    // bytes as *signed* Java bytes, i.e. `(long) key.get(i) << n` sign-extends
    // any byte >= 0x80. This deviates from reference MurmurHash3 but defines
    // the real Murmur3Partitioner tokens (e.g. for non-ASCII UTF-8 keys), so
    // it is reproduced here on purpose.
    const b = BigInt((bytes[tailStart + i] << 24) >> 24);
    if (i >= 8) {
      k2 = (k2 ^ (b << BigInt(8 * (i - 8)))) & MASK64;
    } else {
      k1 = (k1 ^ (b << BigInt(8 * i))) & MASK64;
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

function hash64(key: string, keyBytes?: Uint8Array, bytesLabel = "UTF-8 bytes"): { hash: bigint; steps: string[] } {
  const bytes = keyBytes ?? new TextEncoder().encode(key);
  const [h1, h2] = murmur3X64_128(bytes);
  const steps = [
    `${bytesLabel}: [${Array.from(bytes).join(", ")}]`,
    `MurmurHash3_x64_128(key, seed=0) -> h1=${h1}, h2=${h2}`,
    `Cassandra's Murmur3Partitioner uses h1 as the token source (low 64 bits).`,
  ];
  return { hash: h1, steps };
}

export function computeHash(
  key: string,
  width: HashWidth,
  keyBytes?: Uint8Array,
  bytesLabel?: string,
): HashResult {
  const { hash, steps } =
    width === 16 ? hash16(key) : width === 32 ? hash32(key) : hash64(key, keyBytes, bytesLabel);
  let token = toSigned(hash, width);
  const { min, max } = tokenBounds(width);
  // Murmur3Partitioner maps an empty key to the minimum token.
  if (width === 64 && keyBytes && keyBytes.length === 0) token = min;
  // Mirror Cassandra's reservation of Long.MIN_VALUE for internal use.
  if (token === min) token = max;
  steps.push(`token (signed ${width}-bit, range [${min}, ${max}]) = ${token}`);
  return { key, width, steps, hash, token };
}

// ---------------------------------------------------------------------------
// Partition-key serialization (CQL native protocol, "[value]" encodings).
// Cassandra hashes the *serialized* partition key, not its textual form:
//   text -> UTF-8, int -> 4-byte big-endian two's complement, float -> IEEE-754
//   single, boolean -> 1 byte, uuid/timeuuid -> 16 bytes, date -> unsigned
//   32-bit days with 2^31 = 1970-01-01, timestamp -> 8-byte ms since epoch,
//   time -> 8-byte ns since midnight, double -> IEEE-754 double,
//   bigint -> 8-byte big-endian two's complement.
// A composite partition key is encoded as CompositeType:
//   for each component: <uint16 length><bytes><0x00 end-of-component>.
// CassLab's non-CQL educational types are mapped to their closest CQL type
// ("real" -> double, "datetime" -> timestamp).
// ---------------------------------------------------------------------------

export interface PartitionKeyComponent {
  type: string;
  value: string | number | boolean | null;
}

function bigEndian(size: number, writer: (v: DataView) => void): Uint8Array {
  const buf = new Uint8Array(size);
  writer(new DataView(buf.buffer));
  return buf;
}

export function serializeCqlValue(type: string, value: string | number | boolean | null): Uint8Array {
  const v = value ?? "";
  switch (type) {
    case "int":
      return bigEndian(4, (d) => d.setInt32(0, Number(v) | 0));
    case "bigint": {
      let n: bigint;
      try {
        n = BigInt(String(v).trim() || "0");
      } catch {
        return new TextEncoder().encode(String(v));
      }
      return bigEndian(8, (d) => d.setBigInt64(0, BigInt.asIntN(64, n)));
    }
    case "float":
      return bigEndian(4, (d) => d.setFloat32(0, Number(v)));
    case "real":
    case "double":
      return bigEndian(8, (d) => d.setFloat64(0, Number(v)));
    case "boolean":
      return new Uint8Array([v === true || String(v).toLowerCase() === "true" ? 1 : 0]);
    case "uuid":
    case "timeuuid": {
      const hex = String(v).replace(/-/g, "");
      if (!/^[0-9a-fA-F]{32}$/.test(hex)) return new TextEncoder().encode(String(v));
      return Uint8Array.from(hex.match(/../g)!.map((h) => parseInt(h, 16)));
    }
    case "date": {
      const ms = Date.parse(`${String(v).slice(0, 10)}T00:00:00Z`);
      if (Number.isNaN(ms)) return new TextEncoder().encode(String(v));
      const days = Math.floor(ms / 86400000);
      return bigEndian(4, (d) => d.setUint32(0, (days + 2 ** 31) >>> 0));
    }
    case "datetime":
    case "timestamp": {
      const s = String(v);
      const ms = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
      if (Number.isNaN(ms)) return new TextEncoder().encode(s);
      return bigEndian(8, (d) => d.setBigInt64(0, BigInt(ms)));
    }
    case "time": {
      const m = String(v).match(/^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?$/);
      if (!m) return new TextEncoder().encode(String(v));
      const ns =
        ((BigInt(m[1]) * 60n + BigInt(m[2])) * 60n + BigInt(m[3] ?? 0)) * 1_000_000_000n +
        BigInt((m[4] ?? "").padEnd(9, "0") || 0);
      return bigEndian(8, (d) => d.setBigInt64(0, ns));
    }
    default:
      return new TextEncoder().encode(String(v));
  }
}

/** Bytes that Cassandra hashes for a (possibly composite) partition key. */
export function serializePartitionKey(components: PartitionKeyComponent[]): Uint8Array {
  const parts = components.map((c) => serializeCqlValue(c.type, c.value));
  if (parts.length === 1) return parts[0];
  const total = parts.reduce((n, p) => n + 2 + p.length + 1, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out[o++] = (p.length >> 8) & 0xff;
    out[o++] = p.length & 0xff;
    out.set(p, o);
    o += p.length;
    out[o++] = 0;
  }
  return out;
}

/** Murmur3Partitioner token of a (possibly composite) partition key. */
export function computePartitionToken(components: PartitionKeyComponent[]): bigint {
  const label = components.map((c) => String(c.value ?? "")).join("|");
  return computeHash(label, 64, serializePartitionKey(components)).token;
}

/** Hash result for a row's partition key: type-aware serialization in the
 * 64-bit (Cassandra-compatible) mode, the textual key for the educational
 * 16/32-bit modes. */
export function computePartitionHash(
  components: PartitionKeyComponent[],
  width: HashWidth,
): HashResult {
  const label = components.map((c) => String(c.value ?? "")).join("|");
  if (width !== 64) return computeHash(label, width);
  const single = components.length === 1;
  const label64 = single
    ? `Serialized ${components[0].type} bytes`
    : `Serialized composite partition key bytes (CompositeType: <len><bytes><0x00> per component)`;
  return computeHash(label, 64, serializePartitionKey(components), label64);
}
