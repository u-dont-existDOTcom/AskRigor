import { createHash } from "node:crypto";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { DiscoveredDocumentError, fetchDiscoveredDocument, type DiscoveredDocumentFetchRuntime,
  type OwnerLibraryPdf, type OwnerLibraryErrorCode } from "@askrigor/sources";
import { z } from "zod";

const MAXIMUM_BYTES = 64 * 1024 * 1024;
const TIMEOUT_MS = 120_000;
export interface InfoAccessClient {
  fetchPdf(doi: string): Promise<OwnerLibraryPdf>;
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
}): InfoAccessClient {
  const endpoint = new URL(options.url);
  if ((endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname))) || endpoint.username || endpoint.password) {
    throw new InfoAccessError("unavailable");
  }
  return {
    async fetchPdf(doi) {
      const client = new Client({ name: "askrigor-owner-library", version: "1.0" });
      const signal = AbortSignal.timeout(TIMEOUT_MS);
      const fetchImpl = options.fetch ?? globalThis.fetch;
      const transport = new StreamableHTTPClientTransport(endpoint, {
        requestInit: { headers: { Authorization: `Bearer ${options.token}` }, redirect: "error" },
        fetch: (url, init) => fetchImpl(url, { ...init, signal: init?.signal
          ? AbortSignal.any([init.signal, signal]) : signal })
      });
      try {
        await client.connect(transport, { signal, timeout: TIMEOUT_MS });
        const result = await client.callTool({ name: "get_article_pdf", arguments: { doi } }, undefined,
          { signal, timeout: TIMEOUT_MS, maxTotalTimeout: TIMEOUT_MS });
        const metadata = pdfMetadata(result as CallToolResult);
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
        throw new InfoAccessError(error instanceof DiscoveredDocumentError && error.code === "byte_limit" ? "too_large" : "unavailable");
      } finally {
        await client.close().catch(() => undefined);
      }
    }
  };
}

const metadataSchema = z.object({
  url: z.string().url(), size: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/iu).transform((value) => value.toLowerCase())
});
/** Documented result: a resource_link or download URL, byte size and SHA256. */
function pdfMetadata(result: CallToolResult): z.output<typeof metadataSchema> {
  if (result.isError) {
    const code = result.structuredContent?.code ??
      (result.structuredContent?.error as { code?: unknown } | undefined)?.code;
    throw new InfoAccessError(code === "not_found" ? "not_found" : "unavailable");
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
