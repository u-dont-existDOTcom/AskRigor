import { lookup } from "node:dns/promises";
import type { IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

export const ALLOWED_UPSTREAM_HOSTS = new Set([
  "eutils.ncbi.nlm.nih.gov",
  "www.ebi.ac.uk",
  "europepmc.org",
  "clinicaltrials.gov",
  "api.crossref.org",
  "rep-api.forrt.org",
  "www.googleapis.com",
  "generativelanguage.googleapis.com",
  "api.unpaywall.org",
]);

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 4;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const MAX_DISCOVERED_DOCUMENT_BYTES = 30 * 1024 * 1024;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export class UpstreamHttpError extends Error {
  public readonly status: number;
  public readonly reason: string | undefined;

  constructor(status: number, reason?: string) {
    super(`Upstream request failed with status ${status}`);
    this.status = status;
    this.reason = reason;
  }
}

export interface UpstreamFetchOptions
  extends Omit<RequestInit, "redirect" | "signal"> {
  timeoutMs?: number;
  maxRetries?: 0;
  beforeAttempt?: () => void;
}

const validateUpstreamUrl = (value: string): URL => {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid upstream URL");
  }

  if (url.protocol !== "https:") {
    throw new Error("Upstream URL must use HTTPS");
  }

  if (!ALLOWED_UPSTREAM_HOSTS.has(url.hostname)) {
    throw new Error("Upstream host is not allowlisted");
  }

  if (url.username || url.password) {
    throw new Error("Upstream URL must not include credentials");
  }

  return url;
};

const retryDelay = (retry: number): number => Math.min(250 * 2 ** retry, 4_000);

const sleep = (milliseconds: number, signal: AbortSignal): Promise<void> => {
  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);

    signal.addEventListener("abort", onAbort, { once: true });
  });
};

const responseText = async (response: Response): Promise<string> => {
  const contentLength = response.headers.get("content-length");
  const declaredLength = contentLength === null ? Number.NaN : Number(contentLength);

  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error("Upstream response exceeds 10 MB limit");
  }

  const reader = response.body?.getReader();

  if (!reader) {
    return "";
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("Upstream response exceeds 10 MB limit");
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(body);
};

const providerErrorReason = (body: string): string | undefined => {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const error = (parsed as Record<string, unknown>).error;
    if (typeof error !== "object" || error === null) return undefined;
    const record = error as Record<string, unknown>;
    const direct = record.reason;
    if (typeof direct === "string" && direct.length <= 100) return direct;
    const errors = record.errors;
    if (!Array.isArray(errors) || errors.length === 0) return undefined;
    const reason = errors[0] && typeof errors[0] === "object" && errors[0] !== null
      ? (errors[0] as Record<string, unknown>).reason
      : undefined;
    return typeof reason === "string" && reason.length <= 100 ? reason : undefined;
  } catch {
    return undefined;
  }
};

export const fetchText = async (
  url: string,
  { timeoutMs, maxRetries, beforeAttempt, ...init }: UpstreamFetchOptions = {},
): Promise<string> => {
  const upstreamUrl = validateUpstreamUrl(url);
  const signal = AbortSignal.timeout(timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const retryLimit = maxRetries === 0 ? 0 : MAX_RETRIES;

  for (let retry = 0; retry <= retryLimit; retry += 1) {
    beforeAttempt?.();
    const response = await fetch(upstreamUrl, {
      ...init,
      redirect: "error",
      signal,
    });

    if (RETRYABLE_STATUSES.has(response.status) && retry < retryLimit) {
      await response.body?.cancel();
      await sleep(retryDelay(retry), signal);
      continue;
    }

    if (!response.ok) {
      let reason: string | undefined;
      try {
        reason = providerErrorReason(await responseText(response));
      } catch {
        await response.body?.cancel();
      }
      throw new UpstreamHttpError(response.status, reason);
    }

    return responseText(response);
  }

  throw new Error("Upstream request exhausted retries");
};

export const fetchJson = async <T = unknown>(
  url: string,
  options?: UpstreamFetchOptions,
): Promise<T> => {
  const text = await fetchText(url, options);

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Invalid upstream JSON response");
  }
};

export interface DiscoveredDocumentFetchRuntime {
  resolveAddresses?: (hostname: string) => Promise<readonly string[]>;
  requestDocument?: (
    url: URL,
    vettedAddresses: readonly string[],
    options: { timeoutMs: number; maximumBytes: number }
  ) => Promise<DiscoveredDocumentHttpResponse>;
  /** Test-only compatibility hook. Production uses the DNS-pinned HTTPS requester. */
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  maximumBytes?: number;
  maximumRedirects?: number;
}

export interface DiscoveredDocumentHttpResponse {
  status: number;
  headers: Headers;
  bytes: Uint8Array;
}

export interface FetchedDiscoveredDocument {
  finalUrl: string;
  contentType?: string;
  contentLength: number;
  redirects: string[];
  bytes: Uint8Array;
}

/**
 * Fetches a document URL supplied by a trusted discovery provider. The caller
 * cannot supply arbitrary URLs through the public API: Unpaywall chooses the
 * candidate. Every redirect is rechecked and private/reserved destinations are
 * rejected before a request is sent.
 */
export async function fetchDiscoveredDocument(
  value: string,
  runtime: DiscoveredDocumentFetchRuntime = {}
): Promise<FetchedDiscoveredDocument> {
  const resolver = runtime.resolveAddresses ?? defaultResolveAddresses;
  const maximumBytes = boundedPositiveInteger(
    runtime.maximumBytes ?? MAX_DISCOVERED_DOCUMENT_BYTES,
    "document byte limit"
  );
  const maximumRedirects = boundedNonnegativeInteger(
    runtime.maximumRedirects ?? 5,
    "redirect limit"
  );
  const timeoutMs = boundedPositiveInteger(
    runtime.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    "document timeout"
  );
  const redirects: string[] = [];
  let current = validateDiscoveredDocumentUrl(value);

  for (let redirect = 0; redirect <= maximumRedirects; redirect += 1) {
    const vettedAddresses = await publicDestinationAddresses(current, resolver);
    const response = runtime.fetch === undefined
      ? await (runtime.requestDocument ?? requestPinnedDocument)(
        current,
        vettedAddresses,
        { timeoutMs, maximumBytes }
      )
      : await requestWithInjectedFetch(runtime.fetch, current, timeoutMs, maximumBytes);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirect === maximumRedirects) {
        throw new Error("Discovered document exceeded redirect limit");
      }
      const location = response.headers.get("location");
      if (location === null) {
        throw new Error("Discovered document redirect omitted location");
      }
      current = validateDiscoveredDocumentUrl(new URL(location, current).toString());
      redirects.push(current.toString());
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new UpstreamHttpError(response.status);
    }
    return {
      finalUrl: current.toString(),
      ...(response.headers.get("content-type") === null
        ? {}
        : { contentType: response.headers.get("content-type")! }),
      contentLength: response.bytes.byteLength,
      redirects,
      bytes: response.bytes
    };
  }
  throw new Error("Discovered document retrieval failed");
}

async function requestWithInjectedFetch(
  fetcher: typeof globalThis.fetch,
  url: URL,
  timeoutMs: number,
  maximumBytes: number
): Promise<DiscoveredDocumentHttpResponse> {
  const response = await fetcher(url, {
    method: "GET",
    headers: {
      Accept: "application/pdf,application/octet-stream;q=0.8"
    },
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs)
  });
  const shouldRead = response.status >= 200 && response.status < 300;
  const bytes = shouldRead
    ? await responseBytes(response, maximumBytes)
    : new Uint8Array();
  if (!shouldRead) await response.body?.cancel();
  return { status: response.status, headers: response.headers, bytes };
}

async function requestPinnedDocument(
  url: URL,
  vettedAddresses: readonly string[],
  options: { timeoutMs: number; maximumBytes: number }
): Promise<DiscoveredDocumentHttpResponse> {
  let lastError: unknown;
  for (const address of vettedAddresses) {
    try {
      return await requestPinnedAddress(url, address, options);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("No vetted document address was available");
}

function requestPinnedAddress(
  url: URL,
  address: string,
  options: { timeoutMs: number; maximumBytes: number }
): Promise<DiscoveredDocumentHttpResponse> {
  const originalHostname = url.hostname.replace(/^\[|\]$/gu, "");
  return new Promise((resolve, reject) => {
    const request = httpsRequest({
      protocol: "https:",
      hostname: address,
      port: 443,
      method: "GET",
      path: `${url.pathname}${url.search}`,
      headers: {
        Accept: "application/pdf,application/octet-stream;q=0.8",
        Host: url.host
      },
      ...(isIP(originalHostname) === 0 ? { servername: originalHostname } : {}),
      rejectUnauthorized: true,
      signal: AbortSignal.timeout(options.timeoutMs)
    }, (response) => {
      void (async () => {
        const status = response.statusCode ?? 0;
        const headers = headersFromIncoming(response);
        const bytes = status >= 200 && status < 300
          ? await incomingResponseBytes(response, options.maximumBytes)
          : new Uint8Array();
        if (status < 200 || status >= 300) response.resume();
        resolve({ status, headers, bytes });
      })().catch(reject);
    });
    request.once("error", reject);
    request.end();
  });
}

function headersFromIncoming(response: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(response.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else {
      headers.set(name, value);
    }
  }
  return headers;
}

async function incomingResponseBytes(
  response: IncomingMessage,
  maximumBytes: number
): Promise<Uint8Array> {
  const rawLength = response.headers["content-length"];
  const declared = Number(Array.isArray(rawLength) ? rawLength[0] : rawLength);
  if (Number.isFinite(declared) && declared > maximumBytes) {
    response.destroy();
    throw new Error("Discovered document exceeds byte limit");
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const rawChunk of response) {
    const chunk = typeof rawChunk === "string"
      ? new TextEncoder().encode(rawChunk)
      : new Uint8Array(rawChunk);
    total += chunk.byteLength;
    if (total > maximumBytes) {
      response.destroy();
      throw new Error("Discovered document exceeds byte limit");
    }
    chunks.push(chunk);
  }
  return joinByteChunks(chunks, total);
}

function validateDiscoveredDocumentUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Discovered document URL was invalid");
  }
  if (url.protocol !== "https:") {
    throw new Error("Discovered document URL must use HTTPS");
  }
  if (url.username || url.password || url.port.length > 0) {
    throw new Error("Discovered document URL cannot contain credentials or a custom port");
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/u, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.length === 0
  ) {
    throw new Error("Discovered document destination was not public");
  }
  return url;
}

async function publicDestinationAddresses(
  url: URL,
  resolver: (hostname: string) => Promise<readonly string[]>
): Promise<readonly string[]> {
  const hostname = url.hostname.replace(/^\[|\]$/gu, "");
  const addresses = isIP(hostname) === 0 ? await resolver(hostname) : [hostname];
  if (addresses.length === 0 || addresses.some((address) => !isPublicIp(address))) {
    throw new Error("Discovered document destination resolved outside the public internet");
  }
  return addresses;
}

async function defaultResolveAddresses(hostname: string): Promise<readonly string[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map(({ address }) => address);
}

function isPublicIp(address: string): boolean {
  if (isIP(address) === 4) {
    const parts = address.split(".").map(Number);
    const [a = 0, b = 0, c = 0] = parts;
    return !(
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    if (normalized.startsWith("::ffff:")) {
      return isPublicIp(normalized.slice("::ffff:".length));
    }
    return !(
      normalized === "::" || normalized === "::1" ||
      normalized.startsWith("fc") || normalized.startsWith("fd") ||
      /^fe[89ab]/u.test(normalized) ||
      normalized.startsWith("ff") ||
      normalized.startsWith("2001:db8:")
    );
  }
  return false;
}

async function responseBytes(
  response: Response,
  maximumBytes: number
): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximumBytes) {
    await response.body?.cancel();
    throw new Error("Discovered document exceeds byte limit");
  }
  const reader = response.body?.getReader();
  if (reader === undefined) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new Error("Discovered document exceeds byte limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return joinByteChunks(chunks, total);
}

function joinByteChunks(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function boundedPositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid ${label}`);
  return value;
}

function boundedNonnegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${label}`);
  return value;
}
