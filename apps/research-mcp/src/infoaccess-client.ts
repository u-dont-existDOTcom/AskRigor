import { createHash } from "node:crypto";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { DiscoveredDocumentError, fetchDiscoveredDocument, type DiscoveredDocumentFetchRuntime,
  type OwnerLibraryPdf, type OwnerLibraryErrorCode } from "@askrigor/sources";
import { z } from "zod";

const MAXIMUM_BYTES = 64 * 1024 * 1024;
const TIMEOUT_MS = 120_000;
// InfoAccess turns a request away while another is running ("Try again after the current requests finish"). On 1 Nov
// 2026, 22 of 25 simultaneous requests came back busy, and 31 of the 73 papers the regression run on #389's build had
// failed came back when asked one at a time. So this server sends one request at a time to each endpoint, and waits
// out a busy answer from any other caller, for at most BUSY_WAIT_MS, within the call's deadline.
const BUSY_WAIT_MS = 45_000;
const BUSY_RETRY_MS = 3_000;
/**
 * How long after an acquire_open_full_text call starts its library route must end. The busy wait (45 s) and the
 * retrieval (120 s) could outlast the client: in #394's run 15 calls ran past the app's limit ("MCP request timed out")
 * while InfoAccess answered busy, and the AI lost all of each result, Europe PMC's and Unpaywall's included. The
 * strictest limit the repository records is Claude's 60 seconds for a tool (2026-09-26 plan; the MCP SDK's default
 * request timeout is the same), and its other tools keep their work within 40 seconds of it, as this does: the 20 left
 * cover the PDF's extraction, the result and its transfer.
 */
export const LIBRARY_CALL_DEADLINE_MS = 40_000;
// A request needs this much of the deadline left to be worth sending: InfoAccess needs time to answer and the PDF time
// to arrive, and a request given up at once would only lengthen its queue.
const MINIMUM_REQUEST_MS = 10_000;
/** The latest request to each InfoAccess endpoint, which the next waits for; each session makes its own client. */
const endpointTurns = new Map<string, Promise<void>>();
const pause = (milliseconds: number): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, milliseconds).unref?.();
});
export interface InfoAccessClient {
  /** `deadline` (epoch milliseconds) ends the whole retrieval, its waits included. */
  fetchPdf(doi: string, deadline?: number): Promise<OwnerLibraryPdf>;
}
export class InfoAccessError extends Error {
  constructor(readonly code: OwnerLibraryErrorCode) {
    // No provider response, download URL or credential enters an error message.
    super(`Owner library ${code}`);
    this.name = "InfoAccessError";
  }
}

export function infoAccessClientFromEnv(env: NodeJS.ProcessEnv = process.env): InfoAccessClient | undefined {
  const url = env.ASKRIGOR_INFOACCESS_URL;
  const token = env.ASKRIGOR_INFOACCESS_TOKEN;
  if (!url?.trim() || !token?.trim()) return undefined;
  return createInfoAccessClient({ url, token });
}

/** Free PDF retrieval only; each call owns and closes its MCP connection. */
export function createInfoAccessClient(options: {
  url: string;
  token: string;
  /** Local fake transport for deterministic tests. */
  fetch?: typeof fetch;
  documentFetchRuntime?: DiscoveredDocumentFetchRuntime;
  /** Shorter waits for deterministic tests. */
  busyWaitMs?: number;
  busyRetryMs?: number;
}): InfoAccessClient {
  const endpoint = new URL(options.url);
  if ((endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname))) || endpoint.username || endpoint.password) {
    throw new InfoAccessError("unavailable");
  }
  const busyWait = options.busyWaitMs ?? BUSY_WAIT_MS;
  const busyRetry = options.busyRetryMs ?? BUSY_RETRY_MS;
  const fetchOne = async (doi: string, signal: AbortSignal, busyUntil: number, end: number): Promise<OwnerLibraryPdf> => {
    const left = () => Math.max(1, end - Date.now());
    const client = new Client({ name: "askrigor-owner-library", version: "1.0" });
    const fetchImpl = options.fetch ?? globalThis.fetch;
    const transport = new StreamableHTTPClientTransport(endpoint, {
      requestInit: { headers: { Authorization: `Bearer ${options.token}` }, redirect: "error" },
      fetch: (url, init) => fetchImpl(url, { ...init, signal: init?.signal
        ? AbortSignal.any([init.signal, signal]) : signal })
    });
    try {
      await client.connect(transport, { signal, timeout: left() });
      const request = async () => await client.callTool({ name: "get_article_pdf", arguments: { doi } }, undefined,
        { signal, timeout: left(), maxTotalTimeout: left() }) as CallToolResult;
      let result = await request();
      while (result.isError && retrievalErrorCode(result) === "busy" && Date.now() + busyRetry < busyUntil) {
        await pause(busyRetry);
        result = await request();
      }
      const metadata = pdfMetadata(result);
      const fetched = await fetchDiscoveredDocument(metadata.url, {
        ...options.documentFetchRuntime, maximumBytes: MAXIMUM_BYTES, timeoutMs: TIMEOUT_MS, signal
      });
      if (fetched.bytes.byteLength !== metadata.size ||
          createHash("sha256").update(fetched.bytes).digest("hex") !== metadata.sha256) {
        throw new InfoAccessError("checksum_mismatch");
      }
      return { bytes: fetched.bytes, size: metadata.size, sha256: metadata.sha256 };
    } catch (error) {
      if (error instanceof InfoAccessError) throw error;
      if (signal.aborted || Date.now() >= end) throw new InfoAccessError("timeout");
      throw new InfoAccessError(error instanceof DiscoveredDocumentError && error.code === "byte_limit" ? "too_large" : "unavailable");
    } finally {
      await client.close().catch(() => undefined);
    }
  };
  return {
    fetchPdf(doi, deadline = Number.POSITIVE_INFINITY) {
      const end = Math.min(Date.now() + TIMEOUT_MS, deadline);
      // A timer, so the deadline keeps the same clock as the waits below.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(0, end - Date.now()));
      timer.unref?.();
      const signal = controller.signal;
      const lastStart = end - MINIMUM_REQUEST_MS;
      const busyUntil = Math.min(Date.now() + busyWait, end);
      const previous = endpointTurns.get(endpoint.href);
      const turn = (async () => {
        if (previous !== undefined && !await Promise.race([previous.then(() => true),
          pause(Math.max(0, Math.min(busyWait, lastStart - Date.now()))).then(() => false)])) {
          throw new InfoAccessError("busy");
        }
        if (Date.now() > lastStart) throw new InfoAccessError("timeout");
        return await fetchOne(doi, signal, busyUntil, end);
      })();
      const settled = turn.then(() => undefined, () => undefined);
      endpointTurns.set(endpoint.href, settled);
      void settled.then(() => {
        clearTimeout(timer);
        if (endpointTurns.get(endpoint.href) === settled) endpointTurns.delete(endpoint.href);
      });
      return turn;
    }
  };
}

const metadataSchema = z.object({
  url: z.string().url(), size: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/iu).transform((value) => value.toLowerCase())
});
const retrievalErrorCodeSchema = z.enum([
  "not_found", "retrieval_failed", "pdf_invalid", "too_large", "rate_limited", "timeout", "busy", "invalid_doi",
  "invalid_request", "quota_exhausted", "access_denied", "not_configured", "invalid_response", "internal_error"
]);
/** A failed result's documented code, or undefined when it gives none this client knows. */
function retrievalErrorCode(result: CallToolResult): z.output<typeof retrievalErrorCodeSchema> | undefined {
  let code = result.structuredContent?.code ??
    (result.structuredContent?.error as { code?: unknown } | undefined)?.code;
  if (code === undefined || code === null) {
    for (const block of result.content) {
      if (block.type !== "text") continue;
      // Exact provider syntax only; never interpret the message body.
      const prefix = /^Article request failed \(([^)]+)\):/u.exec(block.text);
      if (prefix === null) continue;
      code = prefix[1];
      break;
    }
  }
  const parsed = retrievalErrorCodeSchema.safeParse(code);
  return parsed.success ? parsed.data : undefined;
}

/** Documented result: a resource_link or download URL, byte size and SHA256. */
function pdfMetadata(result: CallToolResult): z.output<typeof metadataSchema> {
  if (result.isError) {
    const code = retrievalErrorCode(result);
    throw new InfoAccessError(code === "not_found" || code === "too_large" || code === "busy" ||
      code === "invalid_response" ? code : "unavailable");
  }
  const records: Record<string, unknown>[] = [];
  if (result.structuredContent !== undefined) records.push(result.structuredContent);
  let resource: Record<string, unknown> | undefined;
  for (const block of result.content) {
    if (block.type === "resource_link") {
      resource = { ...block, ...block._meta, url: block.uri };
      records.push(resource);
    } else if (block.type === "text") {
      try {
        const record: unknown = JSON.parse(block.text);
        if (record !== null && typeof record === "object" && !Array.isArray(record)) records.push(record as Record<string, unknown>);
      } catch {
        // Human-readable URL/Size/SHA256 output, without inferring missing fields.
        const url = block.text.match(/https:\/\/[^\s<>"\)]+/u)?.[0];
        const size = block.text.match(/\bsize(?:_bytes)?\s*[:=]\s*(\d+)/iu)?.[1];
        const sha256 = block.text.match(/\bsha-?256\s*[:=]\s*([a-f0-9]{64})\b/iu)?.[1];
        records.push({ url, size: size === undefined ? undefined : Number(size), sha256 });
      }
    }
  }
  for (const record of records) {
    const parsed = metadataSchema.safeParse({ url: record.download_url ?? record.url ?? record.uri ?? resource?.url,
      size: record.size ?? record.size_bytes ?? resource?.size, sha256: record.sha256 ?? resource?.sha256 });
    if (!parsed.success) continue;
    if (parsed.data.size > MAXIMUM_BYTES) throw new InfoAccessError("too_large");
    return parsed.data;
  }
  throw new InfoAccessError("unavailable");
}
