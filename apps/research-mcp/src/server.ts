import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse
} from "node:http";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isJsonContentType } from "@modelcontextprotocol/sdk/shared/mediaType.js";
import type { PublicEvidenceGapIntakeService } from
  "@askrigor/evidence-repository";
import {
  PostgresResearchContributorAccessStore,
  PostgresResearchContributionReviewStore,
  ResearchContributionReviewService,
  ResearchContributorAccessService,
} from "@askrigor/evidence-repository";

import {
  actionApiKeyFromEnv,
  actionsAreEnabled,
  GEMINI_COMPATIBLE_MCP_PATH,
  GEMINI_COMPATIBLE_SERVICE_NAME,
  HEALTH_PAYLOAD,
  MAX_MCP_REQUEST_BYTES,
  mcpHandshakeDiagnosticsAreEnabled,
  parseTrustedClientIpHeader,
  PRIVATE_ORCHESTRATION_CONCURRENCY_LIMIT,
  PRIVATE_ORCHESTRATION_RATE_LIMIT,
  privateResearchOrchestrationApiKeyFromEnv,
  privateResearchOrchestrationIsEnabled,
  PUBLIC_MCP_BROWSER_ORIGINS,
  PUBLIC_MCP_CONCURRENCY_LIMIT,
  PUBLIC_RATE_LIMIT,
  publicServerIsEnabled,
  researchFinalizationSigningConfigFromEnv,
  researchContributorAccessConfigFromEnv,
  researchContributionReviewConfigFromEnv,
  researchSessionCheckpointConfigFromEnv,
  researchActionsAreEnabled,
  SERVER_INSTRUCTIONS,
  SERVICE_NAME,
  SERVICE_VERSION,
  validatePrivateResearchOrchestrationApiKey
} from "./config.js";
import { createActionOpenApiDocument } from "./actions/openapi.js";
import { hasValidActionAuthorization } from "./actions/auth.js";
import { isCanonicalRawPath } from "./actions/path.js";
import {
  dispatchActionRequest,
  validateActionRoutes
} from "./actions/router.js";
import type { ActionRoute } from "./actions/types.js";
import { createControlledResearchRoutes } from
  "./actions/controlled-research-route.js";
import { validateProtocolActionContinuationSecret } from
  "./actions/protocol-continuation.js";
import { createEnabledActionRoutes } from "./actions/runtime.js";
import {
  isLessonActionJsonContentType,
  LESSON_ACTION_JSON_CONTENT_TYPE_ERROR,
  LESSON_ACTION_PATH
} from "./lessons/action-route.js";
import { createDefaultActionRoutes } from "./lessons/runtime.js";
import {
  createConcurrencyLimiter,
  createTokenBucketLimiter,
  resolveClientIp,
  type ConcurrencyLimiter,
  type TokenBucketLimiter,
  type TrustedClientIpHeader
} from "./rate-limit.js";
import { registerTools } from "./register-tools.js";
import { installGeminiCompatibleToolCatalog } from "./gemini-tool-catalog.js";
import {
  createPrivateResearchOrchestrationHandler,
  type PrivateResearchOrchestrationHandler
} from "./private-research-orchestration.js";
import { createResearchSessionRuntimeDependencies } from
  "./research-session-runtime.js";
import { createResearchSessionStore } from
  "./actions/research-session-store.js";
import { createFileResearchSessionStore } from
  "./actions/file-research-session-store.js";
import type { N8nControlPlaneHandler } from "./n8n-control-plane-route.js";
import {
  createPublicEvidenceGapIntakeHandler,
  createPublicEvidenceGapIntakeServiceFromConfig,
  publicEvidenceGapIntakeConfigFromEnv,
  type PublicEvidenceGapIntakeHandler,
} from "./public-evidence-gap-http.js";
import {
  attachOptionalOAuthIdentity,
  oauthResourceServerFromEnv,
  protectedResourceMetadataUrl,
  writeOAuthProtectedResourceMetadata,
  type AskRigorOAuthResourceServer,
} from "./oauth-resource-server.js";

export type McpToolCatalogProfile = "standard" | "gemini";

export interface AskRigorMcpServerOptions {
  publicEvidenceGapReviewService?: PublicEvidenceGapIntakeService;
  oauthResourceMetadataUrl?: URL;
  allowedReviewerSubjects?: ReadonlySet<string>;
  researchContributorAccessService?: ResearchContributorAccessService;
  researchContributionReviewService?: ResearchContributionReviewService;
  researchAccessRequired?: boolean;
}

export function createAskRigorServer(
  profile: McpToolCatalogProfile = "standard",
  options: AskRigorMcpServerOptions = {},
): McpServer {
  const server = new McpServer(
    {
      name: profile === "gemini" ? GEMINI_COMPATIBLE_SERVICE_NAME : SERVICE_NAME,
      version: SERVICE_VERSION
    },
    { instructions: SERVER_INSTRUCTIONS }
  );
  registerTools(server, options);
  if (profile === "gemini") {
    installGeminiCompatibleToolCatalog(server);
  }
  return server;
}

export interface AskRigorHttpServerOptions {
  publicServerEnabled?: boolean;
  actionsEnabled?: boolean;
  researchActionsEnabled?: boolean;
  researchActionContinuationSecret?: string;
  actionApiKey?: string;
  actionRoutes?: readonly ActionRoute[];
  trustedClientIpHeader?: TrustedClientIpHeader;
  rateLimiter?: TokenBucketLimiter;
  concurrencyLimiter?: ConcurrencyLimiter;
  createMcpServer?: (profile?: McpToolCatalogProfile) => McpServer;
  mcpHandshakeDiagnosticsEnabled?: boolean;
  mcpHandshakeDiagnosticLogger?: (
    record: McpHandshakeDiagnosticRecord
  ) => void;
  privateOrchestrationEnabled?: boolean;
  privateOrchestrationApiKey?: string;
  privateOrchestrationHandler?: PrivateResearchOrchestrationHandler;
  privateOrchestrationRateLimiter?: TokenBucketLimiter;
  privateOrchestrationConcurrencyLimiter?: ConcurrencyLimiter;
  n8nControlPlaneEnabled?: boolean;
  n8nControlPlaneApiKey?: string;
  n8nControlPlaneHandler?: N8nControlPlaneHandler;
  n8nControlPlaneRateLimiter?: TokenBucketLimiter;
  n8nControlPlaneConcurrencyLimiter?: ConcurrencyLimiter;
  publicEvidenceGapIntakeHandler?: PublicEvidenceGapIntakeHandler;
  publicEvidenceGapReviewService?: PublicEvidenceGapIntakeService;
  oauthResourceServer?: AskRigorOAuthResourceServer;
  researchContributorAccessService?: ResearchContributorAccessService;
  researchContributionReviewService?: ResearchContributionReviewService;
}

export interface McpHandshakeDiagnosticRecord {
  event: "askrigor_mcp_handshake";
  route: McpHandshakeDiagnosticRoute;
  method: "GET" | "POST" | "DELETE" | "OPTIONS" | "other";
  origin: "absent" | "gemini" | "other";
  accept: "absent" | "json" | "sse" | "json_and_sse" | "other";
  content_type: "absent" | "json" | "other";
  authorization_present: boolean;
  mcp_protocol_header: "absent" | "known" | "other";
  cors_request_headers:
    | "not_preflight"
    | "absent"
    | "supported_only"
    | "includes_authorization"
    | "includes_google_metadata"
    | "includes_other";
  rpc_method:
    | "not_applicable"
    | "unparsed"
    | "initialize"
    | "notifications/initialized"
    | "tools/list"
    | "tools/call"
    | "other";
  initialize_protocol_version:
    | "not_applicable"
    | "absent"
    | "known"
    | "other";
  outcome: "finished" | "closed";
  status: number;
  response_content_type: "absent" | "json" | "sse" | "other";
}

type McpHandshakeDiagnosticRoute =
  | "mcp"
  | "mcp_gemini"
  | "oauth_protected_resource"
  | "oauth_protected_resource_mcp"
  | "oauth_protected_resource_mcp_gemini"
  | "oauth_authorization_server"
  | "oauth_authorization_server_mcp"
  | "openid_configuration"
  | "oauth_registration";

export function createAskRigorHttpServer(
  options: AskRigorHttpServerOptions = {}
): HttpServer {
  const publicServerEnabled = options.publicServerEnabled ?? publicServerIsEnabled();
  const actionsEnabled = options.actionsEnabled ?? actionsAreEnabled();
  const researchActionsEnabled = options.researchActionsEnabled ??
    researchActionsAreEnabled();
  const privateOrchestrationEnabled = options.privateOrchestrationEnabled ??
    privateResearchOrchestrationIsEnabled();
  const researchActionContinuationSecret =
    options.researchActionContinuationSecret ??
    process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET ??
    "";
  if (researchActionsEnabled) {
    validateProtocolActionContinuationSecret(
      researchActionContinuationSecret
    );
  }
  const actionApiKey = options.actionApiKey ?? actionApiKeyFromEnv();
  const controlledRuntime = researchActionsEnabled && options.actionRoutes === undefined
    ? createResearchSessionRuntimeDependencies()
    : undefined;
  const controlledFinalizationSigning = controlledRuntime === undefined
    ? undefined
    : researchFinalizationSigningConfigFromEnv() ?? {
        signingSecret: researchActionContinuationSecret,
        keyId: "controlled-action-v1"
      };
  const controlledCheckpointConfig = controlledRuntime === undefined
    ? undefined
    : researchSessionCheckpointConfigFromEnv();
  const controlledStore = controlledRuntime === undefined
    ? undefined
    : controlledCheckpointConfig === undefined
      ? createResearchSessionStore()
      : createFileResearchSessionStore(controlledCheckpointConfig);
  const configuredActionRoutes = options.actionRoutes ?? [
    ...(researchActionsEnabled
      ? createControlledResearchRoutes({
          store: controlledStore!,
          deterministicAdvanceDependencies: controlledRuntime!.deterministic,
          semanticAdvanceDependencies: controlledRuntime!.semantic,
          continuationSigningSecret: researchActionContinuationSecret,
          finalizationSigningSecret: controlledFinalizationSigning!.signingSecret,
          finalizationKeyId: controlledFinalizationSigning!.keyId
        })
      : []),
    ...createDefaultActionRoutes()
  ];
  validateActionRoutes(configuredActionRoutes);
  const actionRoutes = createEnabledActionRoutes({
    researchEnabled: researchActionsEnabled,
    lessonsEnabled: actionsEnabled,
    research: configuredActionRoutes.filter(({ publicResearch, controlledResearch }) =>
      publicResearch === true || controlledResearch === true
    ),
    lessons: configuredActionRoutes.filter(({ publicResearch, controlledResearch }) =>
      publicResearch !== true && controlledResearch !== true
    )
  });
  const trustedClientIpHeader = options.trustedClientIpHeader ??
    parseTrustedClientIpHeader();
  const rateLimiter = options.rateLimiter ?? createTokenBucketLimiter(PUBLIC_RATE_LIMIT);
  const concurrencyLimiter = options.concurrencyLimiter ??
    createConcurrencyLimiter(PUBLIC_MCP_CONCURRENCY_LIMIT);
  const mcpHandshakeDiagnosticsEnabled =
    options.mcpHandshakeDiagnosticsEnabled ??
    mcpHandshakeDiagnosticsAreEnabled();
  const mcpHandshakeDiagnosticLogger = options.mcpHandshakeDiagnosticLogger ??
    writeMcpHandshakeDiagnostic;
  const privateOrchestrationApiKey = privateOrchestrationEnabled
    ? validatePrivateResearchOrchestrationApiKey(
      options.privateOrchestrationApiKey ??
      privateResearchOrchestrationApiKeyFromEnv()
    )
    : undefined;
  const privateRuntime = privateOrchestrationEnabled &&
      options.privateOrchestrationHandler === undefined
    ? createResearchSessionRuntimeDependencies()
    : undefined;
  const finalizationSigning = privateRuntime === undefined
    ? undefined
    : researchFinalizationSigningConfigFromEnv();
  const privateOrchestrationHandler = options.privateOrchestrationHandler ??
    (privateOrchestrationEnabled
      ? createPrivateResearchOrchestrationHandler({
          deterministicAdvanceDependencies: privateRuntime!.deterministic,
          semanticAdvanceDependencies: privateRuntime!.semantic,
          ...(finalizationSigning === undefined
            ? {}
            : {
                finalizationSigningSecret: finalizationSigning.signingSecret,
                finalizationKeyId: finalizationSigning.keyId
              })
        })
      : undefined);
  const privateOrchestrationRateLimiter =
    options.privateOrchestrationRateLimiter ??
    createTokenBucketLimiter(PRIVATE_ORCHESTRATION_RATE_LIMIT);
  const privateOrchestrationConcurrencyLimiter =
    options.privateOrchestrationConcurrencyLimiter ??
    createConcurrencyLimiter(PRIVATE_ORCHESTRATION_CONCURRENCY_LIMIT);
  const n8nControlPlaneEnabled = options.n8nControlPlaneEnabled ?? false;
  const n8nControlPlaneApiKey = n8nControlPlaneEnabled
    ? validatePrivateResearchOrchestrationApiKey(options.n8nControlPlaneApiKey)
    : undefined;
  const n8nControlPlaneHandler = options.n8nControlPlaneHandler;
  if (n8nControlPlaneEnabled && n8nControlPlaneHandler === undefined) {
    throw new Error("n8n control-plane handler unavailable");
  }
  const n8nControlPlaneRateLimiter = options.n8nControlPlaneRateLimiter ??
    createTokenBucketLimiter(PRIVATE_ORCHESTRATION_RATE_LIMIT);
  const n8nControlPlaneConcurrencyLimiter =
    options.n8nControlPlaneConcurrencyLimiter ??
    createConcurrencyLimiter(PRIVATE_ORCHESTRATION_CONCURRENCY_LIMIT);
  const publicEvidenceGapIntakeConfig =
    options.publicEvidenceGapIntakeHandler === undefined
      ? publicEvidenceGapIntakeConfigFromEnv()
      : undefined;
  const publicEvidenceGapReviewService =
    options.publicEvidenceGapReviewService ??
    (publicEvidenceGapIntakeConfig === undefined
      ? undefined
      : createPublicEvidenceGapIntakeServiceFromConfig(
          publicEvidenceGapIntakeConfig,
        ));
  const publicEvidenceGapIntakeHandler =
    options.publicEvidenceGapIntakeHandler ??
    (publicEvidenceGapIntakeConfig === undefined
      ? undefined
      : createPublicEvidenceGapIntakeHandler({
          service: publicEvidenceGapReviewService!,
          reviewApiKey: publicEvidenceGapIntakeConfig.reviewApiKey,
        }));
  const oauthResourceServer =
    options.oauthResourceServer ?? oauthResourceServerFromEnv();
  const researchContributorAccessConfig =
    options.researchContributorAccessService === undefined
      ? researchContributorAccessConfigFromEnv()
      : undefined;
  const researchContributorAccessService =
    options.researchContributorAccessService ??
    (researchContributorAccessConfig === undefined
      ? undefined
      : new ResearchContributorAccessService({
          store: new PostgresResearchContributorAccessStore({
            connectionString: researchContributorAccessConfig.connectionString,
            schema: researchContributorAccessConfig.schema,
            ssl: researchContributorAccessConfig.ssl,
          }),
          identitySecret: researchContributorAccessConfig.identitySecret,
        }));
  const researchContributionReviewConfig =
    options.researchContributionReviewService === undefined
      ? researchContributionReviewConfigFromEnv()
      : undefined;
  const researchContributionReviewService =
    options.researchContributionReviewService ??
    (researchContributionReviewConfig === undefined
      ? undefined
      : new ResearchContributionReviewService(
          new PostgresResearchContributionReviewStore({
            connectionString: researchContributionReviewConfig.connectionString,
            schema: researchContributionReviewConfig.schema,
            ssl: researchContributionReviewConfig.ssl,
          }),
        ));
  const researchAccessRequired = oauthResourceServer !== undefined;
  const effectiveActionRoutes = researchAccessRequired
    ? actionRoutes.filter(({ publicResearch, controlledResearch }) =>
        publicResearch !== true && controlledResearch !== true
      )
    : actionRoutes;
  const oauthResourceMetadataUrl = oauthResourceServer === undefined
    ? undefined
    : protectedResourceMetadataUrl(oauthResourceServer.resourceUrl);
  const createMcpServer = options.createMcpServer ??
    ((profile?: McpToolCatalogProfile) => createAskRigorServer(profile, {
      publicEvidenceGapReviewService,
      oauthResourceMetadataUrl,
      allowedReviewerSubjects: oauthResourceServer?.reviewerSubjects,
      researchContributorAccessService,
      researchContributionReviewService,
      researchAccessRequired,
    }));

  return createServer(async (request, response) => {
    const pathname = exactOriginFormPath(request.url);
    if (pathname === undefined) {
      response.writeHead(404).end();
      return;
    }

    const updateMcpHandshakeDiagnostic = mcpHandshakeDiagnosticsEnabled
      ? attachMcpHandshakeDiagnostic(
          request,
          response,
          pathname,
          mcpHandshakeDiagnosticLogger
        )
      : undefined;

    if (request.method === "GET" && pathname === "/healthz") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(HEALTH_PAYLOAD));
      return;
    }

    if (
      request.method === "GET" &&
      oauthResourceServer !== undefined &&
      [
        "/.well-known/oauth-protected-resource",
        "/.well-known/oauth-protected-resource/mcp",
      ].includes(pathname)
    ) {
      writeOAuthProtectedResourceMetadata(response, oauthResourceServer);
      return;
    }

    if (
      publicEvidenceGapIntakeHandler !== undefined &&
      (await publicEvidenceGapIntakeHandler.dispatch(request, response, {
        pathname,
        clientIp: resolveClientIp(request, trustedClientIpHeader),
      }))
    ) {
      return;
    }

    if (
      privateOrchestrationEnabled &&
      privateOrchestrationApiKey !== undefined &&
      privateOrchestrationHandler !== undefined &&
      await privateOrchestrationHandler.dispatch(request, response, {
        pathname,
        clientIp: resolveClientIp(request, trustedClientIpHeader),
        apiKey: privateOrchestrationApiKey,
        rateLimiter: privateOrchestrationRateLimiter,
        concurrencyLimiter: privateOrchestrationConcurrencyLimiter
      })
    ) {
      return;
    }

    if (
      n8nControlPlaneEnabled &&
      n8nControlPlaneApiKey !== undefined &&
      n8nControlPlaneHandler !== undefined &&
      await n8nControlPlaneHandler.dispatch(request, response, {
        pathname,
        clientIp: resolveClientIp(request, trustedClientIpHeader),
        apiKey: n8nControlPlaneApiKey,
        rateLimiter: n8nControlPlaneRateLimiter,
        concurrencyLimiter: n8nControlPlaneConcurrencyLimiter
      })
    ) {
      return;
    }

    if (
      actionsEnabled &&
      request.method === "POST" &&
      pathname === LESSON_ACTION_PATH &&
      effectiveActionRoutes.some((route) =>
        route.method === "POST" &&
        route.path === LESSON_ACTION_PATH &&
        route.operationId === "submit_lesson_candidate" &&
        route.public === false
      ) &&
      !isLessonActionJsonContentType(request.headers["content-type"]) &&
      hasValidActionAuthorization(request, actionApiKey)
    ) {
      response.writeHead(415, { "content-type": "application/json" });
      response.end(JSON.stringify(LESSON_ACTION_JSON_CONTENT_TYPE_ERROR));
      return;
    }

    if (effectiveActionRoutes.length > 0 && await dispatchActionRequest(request, response, {
      pathname,
      clientIp: resolveClientIp(request, trustedClientIpHeader),
      actionApiKey,
      routes: effectiveActionRoutes,
      createOpenApiDocument: () => createActionOpenApiDocument(effectiveActionRoutes),
      publicRateLimiter: rateLimiter,
      publicConcurrencyLimiter: concurrencyLimiter
    })) {
      return;
    }

    if (pathname !== "/mcp" && pathname !== GEMINI_COMPATIBLE_MCP_PATH) {
      response.writeHead(404).end();
      return;
    }

    if (!publicServerEnabled) {
      writeJsonRpcError(response, 503, -32000, "public_server_disabled", true);
      return;
    }

    const origin = request.headers.origin;
    if (origin !== undefined) {
      if (
        typeof origin !== "string" ||
        !PUBLIC_MCP_BROWSER_ORIGINS.some((allowed) => allowed === origin)
      ) {
        writeJsonRpcError(response, 403, -32000, "origin_not_allowed", true);
        return;
      }

      applyMcpCorsHeaders(response, origin);
      if (request.method === "OPTIONS") {
        writeMcpCorsPreflight(response);
        return;
      }
    }

    if (!rateLimiter.consume(resolveClientIp(request, trustedClientIpHeader))) {
      writeJsonRpcError(response, 429, -32000, "rate_limit_exceeded", true);
      return;
    }

    const releasePermit = concurrencyLimiter.tryAcquire();
    if (releasePermit === undefined) {
      writeJsonRpcError(response, 503, -32000, "concurrency_limit_exceeded", true);
      return;
    }

    try {
      let parsedBody: unknown;
      if (request.method === "POST" && sdkAcceptsPostBody(request)) {
        try {
          parsedBody = await readBoundedJsonBody(request);
          updateMcpHandshakeDiagnostic?.(parsedBody);
        } catch (error) {
          if (error instanceof RequestBodyTooLargeError) {
            writeJsonRpcError(
              response,
              413,
              -32000,
              "Request body exceeds 1 MiB limit",
              true
            );
            return;
          }

          writeJsonRpcError(response, 400, -32700, "Parse error: Invalid JSON");
          return;
        }
      }

      let server: McpServer | undefined;
      try {
        await attachOptionalOAuthIdentity(request, oauthResourceServer);
        const profile = pathname === GEMINI_COMPATIBLE_MCP_PATH
          ? "gemini"
          : "standard";
        server = createMcpServer(profile);
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined
        });
        await server.connect(transport);
        await transport.handleRequest(request, response, parsedBody);
      } catch {
        if (!response.headersSent) {
          writeJsonRpcError(response, 500, -32603, "Internal server error");
        }
      } finally {
        await server?.close();
      }
    } finally {
      releasePermit();
    }
  });
}

function exactOriginFormPath(target: string | undefined): string | undefined {
  if (target === undefined || target.includes("#")) {
    return undefined;
  }
  const queryIndex = target.indexOf("?");
  const path = queryIndex < 0 ? target : target.slice(0, queryIndex);
  return isCanonicalRawPath(path) ? path : undefined;
}

const MCP_HANDSHAKE_DIAGNOSTIC_ROUTES = new Map<
  string,
  McpHandshakeDiagnosticRoute
>([
  ["/mcp", "mcp"],
  [GEMINI_COMPATIBLE_MCP_PATH, "mcp_gemini"],
  ["/.well-known/oauth-protected-resource", "oauth_protected_resource"],
  [
    "/.well-known/oauth-protected-resource/mcp",
    "oauth_protected_resource_mcp"
  ],
  [
    "/.well-known/oauth-protected-resource/mcp/gemini",
    "oauth_protected_resource_mcp_gemini"
  ],
  ["/.well-known/oauth-authorization-server", "oauth_authorization_server"],
  [
    "/.well-known/oauth-authorization-server/mcp",
    "oauth_authorization_server_mcp"
  ],
  ["/.well-known/openid-configuration", "openid_configuration"],
  ["/register", "oauth_registration"]
]);

const MCP_SUPPORTED_CORS_REQUEST_HEADERS = new Set([
  "accept",
  "content-type",
  "last-event-id",
  "mcp-protocol-version",
  "mcp-session-id"
]);

const MCP_KNOWN_PROTOCOL_VERSIONS = new Set([
  "2025-11-25",
  "2025-06-18",
  "2025-03-26"
]);

function attachMcpHandshakeDiagnostic(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  logger: (record: McpHandshakeDiagnosticRecord) => void
): ((parsedBody: unknown) => void) | undefined {
  const route = MCP_HANDSHAKE_DIAGNOSTIC_ROUTES.get(pathname);
  if (route === undefined) {
    return undefined;
  }

  let rpcMethod: McpHandshakeDiagnosticRecord["rpc_method"] =
    (route === "mcp" || route === "mcp_gemini") && request.method === "POST"
      ? "unparsed"
      : "not_applicable";
  let initializeProtocolVersion:
    McpHandshakeDiagnosticRecord["initialize_protocol_version"] =
      "not_applicable";
  let emitted = false;

  const emit = (outcome: McpHandshakeDiagnosticRecord["outcome"]) => {
    if (emitted) {
      return;
    }
    emitted = true;

    const record: McpHandshakeDiagnosticRecord = {
      event: "askrigor_mcp_handshake",
      route,
      method: classifyHttpMethod(request.method),
      origin: classifyOrigin(request.headers.origin),
      accept: classifyAccept(request.headers.accept),
      content_type: classifyContentType(request.headers["content-type"]),
      authorization_present: request.headers.authorization !== undefined,
      mcp_protocol_header: classifyMcpProtocolVersion(
        request.headers["mcp-protocol-version"]
      ),
      cors_request_headers: classifyCorsRequestHeaders(request),
      rpc_method: rpcMethod,
      initialize_protocol_version: initializeProtocolVersion,
      outcome,
      status: response.statusCode,
      response_content_type: classifyResponseContentType(
        response.getHeader("content-type")
      )
    };

    try {
      logger(record);
    } catch {
      // Diagnostics must never affect request handling.
    }
  };

  response.once("finish", () => emit("finished"));
  response.once("close", () => emit("closed"));

  return (parsedBody: unknown) => {
    const classification = classifyRpcRequest(parsedBody);
    rpcMethod = classification.rpcMethod;
    initializeProtocolVersion = classification.initializeProtocolVersion;
  };
}

function classifyOrigin(
  origin: string | readonly string[] | undefined
): McpHandshakeDiagnosticRecord["origin"] {
  if (origin === undefined) {
    return "absent";
  }
  return origin === "https://gemini.google.com" ? "gemini" : "other";
}

function classifyHttpMethod(
  method: string | undefined
): McpHandshakeDiagnosticRecord["method"] {
  return method === "GET" || method === "POST" || method === "DELETE" ||
    method === "OPTIONS"
    ? method
    : "other";
}

function classifyAccept(
  accept: string | readonly string[] | undefined
): McpHandshakeDiagnosticRecord["accept"] {
  if (typeof accept !== "string") {
    return accept === undefined ? "absent" : "other";
  }
  const hasJson = accept.includes("application/json");
  const hasSse = accept.includes("text/event-stream");
  if (hasJson && hasSse) {
    return "json_and_sse";
  }
  if (hasJson) {
    return "json";
  }
  return hasSse ? "sse" : "other";
}

function classifyContentType(
  contentType: string | readonly string[] | undefined
): McpHandshakeDiagnosticRecord["content_type"] {
  if (contentType === undefined) {
    return "absent";
  }
  return typeof contentType === "string" && isJsonContentType(contentType)
    ? "json"
    : "other";
}

function classifyMcpProtocolVersion(
  version: string | readonly string[] | undefined
): McpHandshakeDiagnosticRecord["mcp_protocol_header"] {
  if (version === undefined) {
    return "absent";
  }
  return typeof version === "string" && MCP_KNOWN_PROTOCOL_VERSIONS.has(version)
    ? "known"
    : "other";
}

function classifyCorsRequestHeaders(
  request: IncomingMessage
): McpHandshakeDiagnosticRecord["cors_request_headers"] {
  if (request.method !== "OPTIONS") {
    return "not_preflight";
  }

  const rawHeaders = request.headers["access-control-request-headers"];
  if (typeof rawHeaders !== "string" || rawHeaders.trim() === "") {
    return "absent";
  }
  const headers = rawHeaders.split(",").map((header) => header.trim().toLowerCase());
  const unsupported = headers.filter((header) =>
    !MCP_SUPPORTED_CORS_REQUEST_HEADERS.has(header)
  );
  if (unsupported.length === 0) {
    return "supported_only";
  }
  if (unsupported.includes("authorization")) {
    return "includes_authorization";
  }
  if (unsupported.some((header) => header.startsWith("x-goog-"))) {
    return "includes_google_metadata";
  }
  return "includes_other";
}

function classifyRpcRequest(parsedBody: unknown): {
  rpcMethod: McpHandshakeDiagnosticRecord["rpc_method"];
  initializeProtocolVersion:
    McpHandshakeDiagnosticRecord["initialize_protocol_version"];
} {
  if (
    typeof parsedBody !== "object" ||
    parsedBody === null ||
    Array.isArray(parsedBody) ||
    !("method" in parsedBody) ||
    typeof parsedBody.method !== "string"
  ) {
    return { rpcMethod: "other", initializeProtocolVersion: "not_applicable" };
  }

  const knownMethods = new Set([
    "initialize",
    "notifications/initialized",
    "tools/list",
    "tools/call"
  ]);
  const rpcMethod = knownMethods.has(parsedBody.method)
    ? parsedBody.method as McpHandshakeDiagnosticRecord["rpc_method"]
    : "other";
  if (rpcMethod !== "initialize") {
    return { rpcMethod, initializeProtocolVersion: "not_applicable" };
  }

  const params = "params" in parsedBody ? parsedBody.params : undefined;
  const version = typeof params === "object" && params !== null &&
    !Array.isArray(params) && "protocolVersion" in params
    ? params.protocolVersion
    : undefined;
  const initializeProtocolVersion = version === undefined
    ? "absent"
    : typeof version === "string" && MCP_KNOWN_PROTOCOL_VERSIONS.has(version)
      ? "known"
      : "other";

  return { rpcMethod, initializeProtocolVersion };
}

function classifyResponseContentType(
  contentType: number | string | readonly string[] | undefined
): McpHandshakeDiagnosticRecord["response_content_type"] {
  if (contentType === undefined) {
    return "absent";
  }
  const normalized = Array.isArray(contentType)
    ? contentType.join(",")
    : String(contentType);
  if (normalized.includes("application/json")) {
    return "json";
  }
  return normalized.includes("text/event-stream") ? "sse" : "other";
}

function writeMcpHandshakeDiagnostic(
  record: McpHandshakeDiagnosticRecord
): void {
  console.info(JSON.stringify(record));
}

class RequestBodyTooLargeError extends Error {}

function sdkAcceptsPostBody(request: IncomingMessage): boolean {
  const accept = request.headers.accept;
  return accept?.includes("application/json") === true &&
    accept.includes("text/event-stream") &&
    isJsonContentType(request.headers["content-type"]);
}

function readBoundedJsonBody(request: IncomingMessage): Promise<unknown> {
  const declaredLength = Number(request.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MCP_REQUEST_BYTES) {
    retainRequestErrorListenerUntilClose(request);
    request.pause();
    return Promise.reject(new RequestBodyTooLargeError());
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let receivedBytes = 0;
    let settled = false;

    const cleanup = () => {
      request.off("data", onData);
      request.off("end", onEnd);
      request.off("aborted", onAborted);
      request.off("error", onError);
      request.off("close", onClose);
    };
    const stopReading = () => {
      request.off("data", onData);
      request.off("end", onEnd);
      request.off("aborted", onAborted);
      request.pause();
    };
    const rejectOnce = (error: Error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };
    const resolveOnce = (value: unknown) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const onData = (chunk: Buffer | string) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      receivedBytes += bytes.byteLength;

      if (receivedBytes > MAX_MCP_REQUEST_BYTES) {
        stopReading();
        rejectOnce(new RequestBodyTooLargeError());
        return;
      }

      chunks.push(bytes);
    };
    const onEnd = () => {
      stopReading();
      try {
        resolveOnce(
          JSON.parse(Buffer.concat(chunks, receivedBytes).toString("utf8"))
        );
      } catch {
        rejectOnce(new Error("Invalid JSON"));
      }
    };
    const onAborted = () => {
      stopReading();
      rejectOnce(new Error("Request aborted"));
    };
    const onError = () => {
      stopReading();
      rejectOnce(new Error("Request read failed"));
    };
    const onClose = () => {
      cleanup();
      rejectOnce(new Error("Request closed"));
    };

    request.on("data", onData);
    request.once("end", onEnd);
    request.once("aborted", onAborted);
    request.on("error", onError);
    request.once("close", onClose);
  });
}

function retainRequestErrorListenerUntilClose(request: IncomingMessage): void {
  const onError = () => {};
  const onClose = () => {
    request.off("error", onError);
  };

  request.on("error", onError);
  request.once("close", onClose);
}

function applyMcpCorsHeaders(response: ServerResponse, origin: string): void {
  response.setHeader("access-control-allow-origin", origin);
  response.setHeader("access-control-expose-headers", "MCP-Session-Id");
  response.setHeader("vary", "Origin");
}

function writeMcpCorsPreflight(response: ServerResponse): void {
  response.setHeader(
    "access-control-allow-methods",
    "GET, POST, DELETE, OPTIONS"
  );
  response.setHeader(
    "access-control-allow-headers",
    "Accept, Content-Type, Last-Event-ID, MCP-Protocol-Version, MCP-Session-Id"
  );
  response.setHeader("access-control-max-age", "600");
  response.setHeader(
    "vary",
    "Origin, Access-Control-Request-Method, Access-Control-Request-Headers"
  );
  response.writeHead(204).end();
}

function writeJsonRpcError(
  response: ServerResponse,
  status: number,
  code: number,
  message: string,
  closeConnection = false
): void {
  response.writeHead(status, {
    "content-type": "application/json",
    ...(closeConnection ? { connection: "close" } : {})
  });
  response.end(JSON.stringify({
    jsonrpc: "2.0",
    error: { code, message },
    id: null
  }));
}
