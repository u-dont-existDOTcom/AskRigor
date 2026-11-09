import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ProtocolName } from "@askrigor/protocol";
import type { ResearchCallRecordEntry, ResearchCallRecordStore } from "@askrigor/evidence-repository";
import type { ResearchOperationExtra } from "./research-operation.js";

export interface CallRecordingOptions {
  store: ResearchCallRecordStore;
  accountKeyForCall: (extra: unknown) => string | undefined;
  actionForCall: (tool: string, input: unknown) => string | null;
  route: ResearchCallRecordEntry["route"];
}

const pendingCallWrites = new WeakMap<ResearchCallRecordStore, Set<Promise<void>>>();

/** Test/closeout seam: wait for background writes to this store without changing request-path timing. */
export async function waitForPendingCallRecords(store: ResearchCallRecordStore): Promise<void> {
  const pending = pendingCallWrites.get(store);
  while (pending !== undefined && pending.size > 0) await Promise.all([...pending]);
}

function enqueueCallRecord(store: ResearchCallRecordStore, entry: ResearchCallRecordEntry): void {
  let pending = pendingCallWrites.get(store);
  if (pending === undefined) {
    pending = new Set();
    pendingCallWrites.set(store, pending);
  }
  // The queued work captures only the disclosed entry, never the input, result, extra, or exception.
  const write = Promise.resolve().then(() => store.record(entry)).catch(() => undefined);
  pending.add(write);
  void write.then(() => pending.delete(write));
}

function startCallRecord(tool: string, input: unknown, extra: unknown, recording?: CallRecordingOptions) {
  if (recording === undefined) return undefined;
  try {
    const receivedAt = new Date();
    const started = performance.now();
    const request = extra as ResearchOperationExtra | undefined;
    if (request?.surface === "action") return undefined;
    const accountKey = recording.accountKeyForCall(extra);
    if (accountKey === undefined) return undefined;
    const action = recording.actionForCall(tool, input);
    const base = {
      accountKey, receivedAt, tool, action,
      route: recording.route, chatgpt: isChatGptCall(extra),
    };
    return (result: CallToolResult | undefined) => {
      try {
        let code: string | null = null;
        const outcome = result === undefined ? "failed" : result.isError === true ? "refused" : "answered";
        if (outcome === "refused") {
          const structured = result!.structuredContent;
          const error = structured?.error;
          const nested = error !== null && typeof error === "object" ? (error as Record<string, unknown>).code : undefined;
          code = [nested, structured?.code].find((value): value is string =>
            typeof value === "string" && /^[a-z][a-z0-9_]{0,63}$/u.test(value)) ?? "other";
        }
        enqueueCallRecord(recording.store, { ...base, outcome, code,
          durationMs: Math.min(86_400_000, Math.max(0, Math.round(performance.now() - started))) });
      } catch { /* A call record must never affect a tool result or emit a log. */ }
    };
  } catch { return undefined; }
}

/*
 * Lesson #59 (7 Nov 2026): some MCP clients give the model only a result's content text, never its structuredContent
 * (a Claude agent harness did), so a payload kept only in structuredContent never reached the AI there: the protocol,
 * its index, PubMed records, full-text pages. Every MCP tool result therefore also carries its payload as text, as the
 * MCP specification asks of a tool that returns structured content, after the summary it already had. ChatGPT is the
 * exception: it shows the model both (OpenAI's Apps SDK reference), so the copy would only cost its context.
 */

/** ChatGPT's client hints in a call's _meta all start so (openai/locale, openai/userAgent, openai/subject and others). */
const CHATGPT_META_KEY_PREFIX = "openai/";
/** The HTTP User-Agent developers report for ChatGPT's MCP connector ("openai-mcp/1.0.0"); OpenAI documents none. */
const CHATGPT_USER_AGENT_PREFIX = "openai-mcp/";
/** The tool whose page result carries the protocol's exact bytes, which go in the text raw rather than as JSON. */
const PROTOCOL_PAGE_TOOL = "load_protocol";

/** load_protocol's page summary, where the client reads text: says where the bytes are. */
export const PROTOCOL_PAGE_IN_TEXT = " This page's exact canonical bytes are the last text block of this result, " +
  "unchanged; the block before it gives the result's other fields as JSON.";
/** load_protocol's page summary for ChatGPT, whose text carries no copy: says where the bytes are instead. */
export const PROTOCOL_PAGE_IN_STRUCTURED_CONTENT = " This page's exact canonical bytes are in this result's " +
  "structuredContent, in its text field, not in this text.";

/**
 * Whether a call comes from ChatGPT, read from exact structural signals of that one call: a key of its _meta that
 * starts with "openai/", or an HTTP User-Agent that starts with "openai-mcp/". Only the key names and the header are
 * read, in memory, for this call; neither is logged, stored or returned (docs/privacy-data-map.md). The server keeps
 * no session, so the initialize request's client name is never seen beside a tool call. A call with neither signal is
 * not ChatGPT's: it gets the payload in its text, as a copy costs tokens where a missing payload breaks research.
 */
export function isChatGptCall(extra: unknown): boolean {
  if (extra === null || typeof extra !== "object") return false;
  const { _meta: meta, requestInfo } = extra as { _meta?: unknown; requestInfo?: { headers?: unknown } };
  if (meta !== null && typeof meta === "object" &&
      Object.keys(meta).some((key) => key.startsWith(CHATGPT_META_KEY_PREFIX))) return true;
  const headers = requestInfo?.headers;
  if (headers === null || typeof headers !== "object") return false;
  const agent = (headers as Record<string, unknown>)["user-agent"];
  const value = Array.isArray(agent) ? agent[0] : agent;
  return typeof value === "string" && value.startsWith(CHATGPT_USER_AGENT_PREFIX);
}

/**
 * The result as this client receives it. For ChatGPT, the result as the tool built it, with one sentence added to a
 * protocol page's summary saying the bytes are in structuredContent. For every other client, the same content blocks
 * first, then the payload as text: for a protocol page, the result's other fields as JSON and then the page's exact
 * canonical bytes, raw, so a client that reads only text can hash them against scope_sha256; for every other result
 * with structured content, error results included, its JSON. structuredContent itself is never changed.
 */
export function resultForClient(tool: string, result: CallToolResult, chatGpt: boolean): CallToolResult {
  const structured = result.structuredContent;
  if (structured === undefined || structured === null) return result;
  const protocolPage = tool === PROTOCOL_PAGE_TOOL && result.isError !== true && structured.ok === true &&
    typeof structured.text === "string";
  if (chatGpt) {
    return protocolPage ? { ...result, content: withSummarySentence(result.content, PROTOCOL_PAGE_IN_STRUCTURED_CONTENT) }
      : result;
  }
  if (!protocolPage) {
    return { ...result, content: [...result.content, { type: "text", text: JSON.stringify(structured) }] };
  }
  const { text, ...fields } = structured as { text: string } & Record<string, unknown>;
  return {
    ...result,
    content: [
      ...withSummarySentence(result.content, PROTOCOL_PAGE_IN_TEXT),
      { type: "text", text: JSON.stringify(fields) },
      { type: "text", text }
    ]
  };
}

/** The content with a sentence added to its first text block, the summary. */
function withSummarySentence(content: CallToolResult["content"], sentence: string): CallToolResult["content"] {
  const index = content.findIndex((block) => block.type === "text");
  if (index < 0) return [{ type: "text", text: sentence.trimStart() }, ...content];
  return content.map((block, position) =>
    position === index && block.type === "text" ? { ...block, text: `${block.text}${sentence}` } : block);
}

/** Wraps one tool's MCP handler so each result reaches the calling client as resultForClient shapes it. */
export function forTextClients<Input, Extra>(
  tool: string,
  execute: (input: Input, extra?: Extra) => Promise<CallToolResult>,
  recording?: CallRecordingOptions,
): (input: Input, extra?: Extra) => Promise<CallToolResult> {
  return async (input, extra) => {
    const finish = startCallRecord(tool, input, extra, recording);
    let result: CallToolResult;
    try {
      result = await execute(input, extra);
    } catch (error) {
      finish?.(undefined);
      throw error;
    }
    finish?.(result);
    return resultForClient(tool, result, isChatGptCall(extra));
  };
}

export function successfulToolResult(
  text: string,
  structuredContent: Record<string, unknown>
): CallToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent
  };
}

export function protocolRequestError(
  protocol: ProtocolName,
  code: string,
  message: string
): CallToolResult {
  return {
    content: [{ type: "text", text: `Protocol request failed: ${message}` }],
    structuredContent: { ok: false, protocol, error: { code, message } },
    isError: true
  };
}

export function protocolErrorResult(
  protocol: ProtocolName,
  error: unknown
): CallToolResult {
  const message = error instanceof Error ? error.message : "Unknown protocol error";

  return {
    content: [
      {
        type: "text",
        text: `Protocol operation failed: ${message}`
      }
    ],
    structuredContent: {
      ok: false,
      protocol,
      error: {
        code: "protocol_error",
        message
      }
    },
    isError: true
  };
}
