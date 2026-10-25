import { isIP } from "node:net";

export interface TokenBucketLimiter {
  readonly size: number;
  consume(key: string): boolean;
}

export interface ConcurrencyLimiter {
  readonly inFlight: number;
  tryAcquire(): (() => void) | undefined;
}

export interface TokenBucketOptions {
  capacity: number;
  refillTokensPerMinute: number;
  maxKeys: number;
  idleTtlMs: number;
  now?: () => number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
  lastSeenAt: number;
}

type HeaderValue = string | string[] | undefined;

export interface ClientIpRequest {
  headers: Record<string, HeaderValue>;
  socket: { remoteAddress?: string };
}

export type TrustedClientIpHeader = "cf-connecting-ip";

export function createConcurrencyLimiter(maxInFlight: number): ConcurrencyLimiter {
  validatePositiveInteger(maxInFlight, "maxInFlight");
  let inFlight = 0;

  return {
    get inFlight() {
      return inFlight;
    },
    tryAcquire() {
      if (inFlight >= maxInFlight) return undefined;
      inFlight += 1;
      let released = false;

      return () => {
        if (released) return;
        released = true;
        inFlight -= 1;
      };
    }
  };
}

export function createTokenBucketLimiter(
  options: TokenBucketOptions
): TokenBucketLimiter {
  validatePositiveInteger(options.capacity, "capacity");
  validateNonnegativeNumber(options.refillTokensPerMinute, "refillTokensPerMinute");
  validatePositiveInteger(options.maxKeys, "maxKeys");
  validatePositiveNumber(options.idleTtlMs, "idleTtlMs");
  const now = options.now ?? Date.now;
  const buckets = new Map<string, Bucket>();
  const refillPerMillisecond = options.refillTokensPerMinute / 60_000;

  return {
    get size() {
      return buckets.size;
    },
    consume(key: string): boolean {
      const currentTime = now();
      if (!Number.isFinite(currentTime)) {
        throw new Error("Token bucket clock must return a finite number");
      }

      evictOldestExpired(buckets, currentTime, options.idleTtlMs);
      const existing = buckets.get(key);
      const expired = existing !== undefined &&
        currentTime - existing.lastSeenAt > options.idleTtlMs;
      const bucket = existing === undefined || expired
        ? { tokens: options.capacity, updatedAt: currentTime, lastSeenAt: currentTime }
        : refill(existing, currentTime, options.capacity, refillPerMillisecond);

      if (existing !== undefined) buckets.delete(key);
      while (buckets.size >= options.maxKeys) {
        const oldestKey = buckets.keys().next().value as string | undefined;
        if (oldestKey === undefined) break;
        buckets.delete(oldestKey);
      }

      const allowed = bucket.tokens >= 1;
      if (allowed) bucket.tokens -= 1;
      bucket.lastSeenAt = currentTime;
      buckets.set(key, bucket);
      return allowed;
    }
  };
}

export function resolveClientIp(
  request: ClientIpRequest,
  trustedHeader?: TrustedClientIpHeader
): string {
  if (trustedHeader !== undefined) {
    const forwarded = request.headers[trustedHeader];
    if (typeof forwarded === "string" && !forwarded.includes(",")) {
      const normalized = normalizeIp(forwarded.trim(), false);
      if (normalized !== undefined) return normalized;
    }
  }

  return normalizeIp(request.socket.remoteAddress?.trim() ?? "", true) ?? "unknown";
}

/** A client address in canonical form (an IPv4-mapped IPv6 address as IPv4), or undefined when it is not one. */
export function normalizeClientIp(value: string): string | undefined {
  return normalizeIp(value.trim(), false);
}

/**
 * The key a per-address limit counts an address under: an IPv4 address as it is, an IPv6 address by its /64 prefix
 * (such as 2001:db8:0:1::/64), since one subscriber usually holds a whole /64 and could otherwise take a fresh
 * address for every request.
 */
export function addressLimitKey(ip: string): string {
  if (isIP(ip) !== 6) return ip;
  let address = ip.toLowerCase();
  // An IPv4 tail (::ffff:192.0.2.1 is IPv4 already; others such as 64:ff9b::192.0.2.1) as two groups.
  const tail = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u.exec(address);
  if (tail !== null) {
    const [a, b, c, d] = tail.slice(1).map(Number) as [number, number, number, number];
    address = `${address.slice(0, tail.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [left, right] = address.includes("::") ? address.split("::") as [string, string] : [address, undefined];
  const head = left === "" ? [] : left.split(":");
  const rest = right === undefined || right === "" ? [] : right.split(":");
  const groups = right === undefined ? head : [...head, ...Array<string>(8 - head.length - rest.length).fill("0"), ...rest];
  return `${groups.slice(0, 4).map((group) => Number.parseInt(group, 16).toString(16)).join(":")}::/64`;
}

function refill(
  bucket: Bucket,
  currentTime: number,
  capacity: number,
  refillPerMillisecond: number
): Bucket {
  const elapsed = Math.max(0, currentTime - bucket.updatedAt);
  return {
    tokens: Math.min(capacity, bucket.tokens + elapsed * refillPerMillisecond),
    updatedAt: Math.max(bucket.updatedAt, currentTime),
    lastSeenAt: bucket.lastSeenAt
  };
}

function evictOldestExpired(
  buckets: Map<string, Bucket>,
  currentTime: number,
  idleTtlMs: number
): void {
  const oldest = buckets.entries().next().value as [string, Bucket] | undefined;
  if (oldest !== undefined && currentTime - oldest[1].lastSeenAt > idleTtlMs) {
    buckets.delete(oldest[0]);
  }
}

function normalizeIp(value: string, allowScope: boolean): string | undefined {
  const scopeIndex = value.indexOf("%");
  if (scopeIndex !== -1 && !allowScope) return undefined;
  const address = scopeIndex === -1 ? value : value.slice(0, scopeIndex);
  const version = isIP(address);
  if (version === 4) return address;
  if (version !== 6) return undefined;

  const hostname = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(hostname);
  if (mapped === null) return hostname;

  const high = Number.parseInt(mapped[1]!, 16);
  const low = Number.parseInt(mapped[2]!, 16);
  return [high >>> 8, high & 0xff, low >>> 8, low & 0xff].join(".");
}

function validatePositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function validateNonnegativeNumber(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a nonnegative finite number`);
  }
}

function validatePositiveNumber(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number`);
  }
}
