import type {
  ResearchContributorAccessService, ResearchErrorLogKind, ResearchErrorLogStore,
} from "@askrigor/evidence-repository";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  ErrorCode, isJSONRPCErrorResponse, isJSONRPCRequest, isJSONRPCResponse,
  type JSONRPCMessage, type MessageExtraInfo, type RequestId,
} from "@modelcontextprotocol/sdk/types.js";
import { buildResearchErrorLogEntry } from "./research-error-log-entry.js";
import { keepFailedSearches } from "./failed-search-preference.js";
import { RESEARCH_OPERATIONS, type McpSurface } from "./register-tools.js";
import { authorizedSubject } from "./research-contributor-access-tool.js";
import { isChatGptCall } from "./tool-result.js";

const inputSchemas = new Map(RESEARCH_OPERATIONS.map((operation) => [operation.name, operation.runtimeInputSchema]));

export class ResearchErrorLogTransport extends StreamableHTTPServerTransport {
  private readonly calls = new Map<RequestId, NonNullable<ReturnType<typeof this.observe>>>();

  constructor(
    private readonly store: ResearchErrorLogStore,
    private readonly route: McpSurface,
    private readonly access?: ResearchContributorAccessService,
    private readonly httpTiming?: { receivedAt: Date; started: number },
  ) {
    super({ sessionIdGenerator: undefined });
  }

  override start(): Promise<void> {
    // The SDK assigns onmessage before start. Observe the final reply without replacing its validation or handler.
    const dispatch = this.onmessage;
    this.onmessage = (message, extra) => {
      if (isJSONRPCRequest(message) && message.method === "tools/call") {
        try {
          const complete = this.observe(message.params, extra);
          if (complete !== undefined) this.calls.set(message.id, complete);
        } catch { /* Diagnostics must leave the call unchanged. */ }
      }
      dispatch?.(message, extra);
    };
    return super.start();
  }

  override send(message: JSONRPCMessage, options?: { relatedRequestId?: RequestId }): Promise<void> {
    if (isJSONRPCResponse(message) || isJSONRPCErrorResponse(message)) {
      if (message.id !== undefined) {
        const complete = this.calls.get(message.id);
        this.calls.delete(message.id);
        if (isJSONRPCResponse(message)) complete?.(message.result);
        else complete?.(undefined, message.error.code === ErrorCode.InvalidParams ? "validation_error" : "internal_error");
      }
    }
    return super.send(message, options);
  }

  override close(): Promise<void> {
    this.calls.clear();
    return super.close();
  }

  /** Also records a known tool refused before the SDK by the route's sign-in gate. */
  refuse(body: unknown, kind: "auth_refused" | "internal_error" = "auth_refused"): void {
    for (const message of Array.isArray(body) ? body : [body]) {
      if (!isJSONRPCRequest(message) || message.method !== "tools/call") continue;
      try { this.observe(message.params)?.(undefined, kind); } catch { /* Keep the original HTTP response. */ }
    }
  }

  private observe(params: Record<string, unknown> | undefined, extra?: MessageExtraInfo) {
    const tool = params?.name;
    if (typeof tool !== "string") return undefined;
    const schema = inputSchemas.get(tool);
    if (schema === undefined) return undefined;
    const { receivedAt, started } = this.httpTiming ?? { receivedAt: new Date(), started: performance.now() };
    const app = isChatGptCall({ _meta: params?._meta, requestInfo: extra?.requestInfo }) ? "chatgpt"
      : this.route === "/mcp/claude" ? "claude" : this.route === "/mcp/gemini" ? "gemini" : "unknown";
    const auth = extra?.authInfo === undefined ? undefined : authorizedSubject(extra, undefined);
    const service = this.access;
    const accountKey = auth !== undefined && "subject" in auth ? service?.accountKeyForSubject(auth.subject) : undefined;
    return (result?: unknown, rpcKind?: ResearchErrorLogKind) => {
      try {
        const entry = buildResearchErrorLogEntry({ receivedAt, durationMs: performance.now() - started,
          tool, input: params?.arguments, schema, app, result, rpcKind, keepWords: accountKey !== undefined });
        if (entry === undefined) return;
        // Only the projected entry and, for the lookup, a transient account key leave this request boundary.
        void writeEntry(this.store, entry, service, accountKey).catch(() => undefined);
      } catch { /* Diagnostics must leave the call unchanged. */ }
    };
  }
}

async function writeEntry(
  store: ResearchErrorLogStore,
  entry: NonNullable<ReturnType<typeof buildResearchErrorLogEntry>>,
  service?: ResearchContributorAccessService,
  accountKey?: string,
): Promise<void> {
  if (entry.outcome === "error" && entry.search_words !== undefined) {
    const enabled = service !== undefined && accountKey !== undefined &&
      await keepFailedSearches(service, accountKey).catch(() => false);
    if (!enabled) delete entry.search_words;
  }
  await store.record(entry);
}
