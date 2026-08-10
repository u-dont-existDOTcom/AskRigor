export const ALLOWED_UPSTREAM_HOSTS = new Set([
  "eutils.ncbi.nlm.nih.gov",
  "www.ebi.ac.uk",
  "europepmc.org",
  "clinicaltrials.gov",
  "api.crossref.org",
  "www.googleapis.com",
]);

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 4;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
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
