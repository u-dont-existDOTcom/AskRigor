import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface ChatWorkPolicy {
  schemaVersion: number;
  policyId: string;
  ownerAuthority: {
    sourceFeedbackSha256: string;
    paidModelInferenceAllowed: boolean;
    maximumModelApiSpendUsd: number;
    internalSupervisorRoutingStandingAuthorization: boolean;
  };
  reasoningAuthorities: string[];
  executionOnlyActors: string[];
  reasoningReservedActions: string[];
  codexWorkAllowedActions: string[];
  sourceReceiptRequired: {
    messageIdentity: boolean;
    exactBodySha256: boolean;
    claimedAndObservedSurfaceMustMatch: boolean;
    unknownOrCodexCopiedReasoningCanAuthorize: boolean;
  };
  internalSupervisorRouting: {
    automatic: boolean;
    ownerRelayPermitted: boolean;
    saySendItPermitted: boolean;
    actionTimeConfirmationRequired: boolean;
    scope: string[];
    externalRecipientsExcluded: boolean;
  };
  spending: {
    paidModelApiPathStatus: string;
    codexMayAuthorPaidProposal: boolean;
    workMayAuthorPaidProposal: boolean;
    olderPaidManifestCanRevivePath: boolean;
    newerExplicitOwnerDecisionRequiredForAnyNonzeroSpend: boolean;
  };
  completion: {
    default: string;
    greenSubtaskIsStopCondition: boolean;
    allowedStops: string[];
  };
}

export interface GateRequest {
  requestId: string;
  actor: string;
  action: string;
  sourceReceipt: null | {
    messageId: string;
    exactBodySha256: string;
    claimedSurface: string;
    observedSurface: string;
    provenanceStatus: "VERIFIED" | "OWNER_ATTESTED" | "UNVERIFIED";
  };
  modelApiSpendUsd: number;
  boundedExecution: boolean;
  taskRequiresExecutionOutsideChat: boolean;
  internalRoute: null | {
    destination: string;
    ownerRelayRequested: boolean;
    saySendItRequested: boolean;
    actionTimeConfirmationRequested: boolean;
  };
}

export interface CanonicalDirective {
  directiveId: string;
  reasoningAuthority: {
    surface: string;
    provenanceStatus: string;
    sourceFeedbackSha256: string;
  };
  executionActors: string[];
  executionAuthority: string;
  spend: {
    maximumExternalSpendUsd: number;
    maximumModelApiSpendUsd: number;
    paidModelApiPath: string;
    providerApiCredentialsPermitted: boolean;
  };
  directiveTextSha256: string;
  directiveTextUtf8Bytes: number;
  directiveText: string;
  forbiddenDecisions: string[];
}

export function evaluateGateRequest(policy: ChatWorkPolicy, request: GateRequest): string[] {
  const errors: string[] = [];
  if (!request.requestId?.trim()) errors.push("requestId is required");
  if (!Number.isFinite(request.modelApiSpendUsd) || request.modelApiSpendUsd < 0) {
    errors.push("modelApiSpendUsd must be a finite nonnegative number");
  }

  if (policy.reasoningReservedActions.includes(request.action)
    && !policy.reasoningAuthorities.includes(request.actor)) {
    errors.push(`${request.actor} cannot author reasoning-reserved action ${request.action}`);
  }

  if (policy.reasoningReservedActions.includes(request.action)) {
    if (!request.sourceReceipt) {
      errors.push("reasoning-reserved action requires a source message receipt");
    } else {
      if (!request.sourceReceipt.messageId?.trim()) errors.push("source message identity is missing");
      if (!isSha256(request.sourceReceipt.exactBodySha256)) errors.push("source message digest is invalid");
      if (policy.sourceReceiptRequired.claimedAndObservedSurfaceMustMatch
        && request.sourceReceipt.claimedSurface !== request.sourceReceipt.observedSurface) {
        errors.push("claimed reasoning surface does not match observed source surface");
      }
      if (request.sourceReceipt.provenanceStatus === "UNVERIFIED") {
        errors.push("unverified or Codex-copied reasoning cannot authorize the action");
      }
    }
  }

  if (request.modelApiSpendUsd > policy.ownerAuthority.maximumModelApiSpendUsd) {
    errors.push(`model API spend ${request.modelApiSpendUsd} exceeds active ceiling ${policy.ownerAuthority.maximumModelApiSpendUsd}`);
  }
  if (request.modelApiSpendUsd > 0 && !policy.ownerAuthority.paidModelInferenceAllowed) {
    errors.push("paid model API inference is canceled by the active owner decision");
  }

  if (request.action === "ROUTE_EXACT_FACTUAL_PACKET_TO_INTERNAL_SUPERVISOR") {
    if (!request.internalRoute) {
      errors.push("internal supervisor routing requires an exact route");
    } else {
      if (!policy.internalSupervisorRouting.scope.includes(request.internalRoute.destination)) {
        errors.push("destination is not an authorized internal supervisor surface");
      }
      if (request.internalRoute.ownerRelayRequested || request.internalRoute.saySendItRequested) {
        errors.push("routine internal supervisor routing cannot be bounced to Joel as a relay or say-send-it request");
      }
      if (request.internalRoute.actionTimeConfirmationRequested) {
        errors.push("standing owner authorization controls; routine internal supervisor routing cannot request action-time confirmation");
      }
    }
  }

  if (policy.executionOnlyActors.includes(request.actor)
    && request.action === "EXECUTE_SOURCE_BOUND_BOUNDED_DIRECTIVE") {
    if (!request.boundedExecution) errors.push("Codex/Work execution must be bounded");
    if (!request.taskRequiresExecutionOutsideChat) {
      errors.push("Codex/Work cannot take over a task the reasoning chat can execute directly");
    }
    if (!request.sourceReceipt || request.sourceReceipt.provenanceStatus === "UNVERIFIED") {
      errors.push("bounded execution requires a source-bound owner or Chat directive");
    }
  }

  return errors;
}

export function validateCanonicalPolicy(policy: ChatWorkPolicy): string[] {
  const errors: string[] = [];
  if (policy.schemaVersion !== 1) errors.push("policy schemaVersion must be 1");
  if (!isSha256(policy.ownerAuthority.sourceFeedbackSha256)) errors.push("owner feedback digest is invalid");
  if (policy.ownerAuthority.paidModelInferenceAllowed !== false) errors.push("paid model inference must remain disabled");
  if (policy.ownerAuthority.maximumModelApiSpendUsd !== 0) errors.push("model API ceiling must equal zero");
  if (!policy.ownerAuthority.internalSupervisorRoutingStandingAuthorization) errors.push("standing internal routing authorization is missing");
  for (const actor of ["OWNER", "PROJECT_MANAGER_CHAT", "SPECIALIST_SUPERVISOR_CHAT"]) {
    if (!policy.reasoningAuthorities.includes(actor)) errors.push(`missing reasoning authority ${actor}`);
  }
  for (const actor of ["CODEX", "WORK"]) {
    if (!policy.executionOnlyActors.includes(actor)) errors.push(`missing execution-only actor ${actor}`);
  }
  if (!policy.internalSupervisorRouting.automatic) errors.push("internal supervisor routing must be automatic");
  if (policy.internalSupervisorRouting.ownerRelayPermitted) errors.push("owner relay must be forbidden");
  if (policy.internalSupervisorRouting.saySendItPermitted) errors.push("say-send-it handback must be forbidden");
  if (policy.internalSupervisorRouting.actionTimeConfirmationRequired) errors.push("routine internal routing must not require action-time confirmation");
  if (policy.completion.greenSubtaskIsStopCondition) errors.push("a green subtask cannot be a terminal stop condition");
  if (policy.completion.default !== "CONTINUE_TO_FULL_OWNER_OUTCOME") errors.push("default completion policy must continue to the full owner outcome");
  return errors;
}

export function validateCanonicalDirective(
  policy: ChatWorkPolicy,
  directive: CanonicalDirective,
): string[] {
  const errors: string[] = [];
  const bytes = Buffer.byteLength(directive.directiveText, "utf8");
  const digest = sha256(directive.directiveText);
  if (bytes !== directive.directiveTextUtf8Bytes) errors.push("directive UTF-8 byte count does not match");
  if (digest !== directive.directiveTextSha256) errors.push("directive text SHA-256 does not match");
  if (directive.reasoningAuthority.surface !== "CHATGPT_PROJECT_MANAGER") errors.push("directive must originate in ChatGPT Project Manager reasoning");
  if (!directive.reasoningAuthority.provenanceStatus.startsWith("OWNER_ATTESTED")) errors.push("directive reasoning provenance must remain owner-attested until provider message identity is available");
  if (directive.reasoningAuthority.sourceFeedbackSha256 !== policy.ownerAuthority.sourceFeedbackSha256) errors.push("directive is not bound to the active owner correction");
  if (directive.executionAuthority !== "BOUNDED_MECHANICAL_ONLY") errors.push("Codex/Work execution authority is too broad");
  if (directive.spend.maximumExternalSpendUsd !== 0 || directive.spend.maximumModelApiSpendUsd !== 0) errors.push("directive must have a zero-dollar ceiling");
  if (directive.spend.paidModelApiPath !== "CANCELED_BY_OWNER") errors.push("paid API path must remain canceled");
  if (directive.spend.providerApiCredentialsPermitted) errors.push("provider API credentials cannot be used");
  for (const actor of directive.executionActors) {
    if (!policy.executionOnlyActors.includes(actor)) errors.push(`unauthorized execution actor ${actor}`);
  }
  const requiredForbidden = [
    "change methodology",
    "recommend or authorize spending",
    "scale beyond one case family",
    "interpret scientific adequacy",
    "ask Joel to relay any internal supervisor packet",
  ];
  for (const item of requiredForbidden) {
    if (!directive.forbiddenDecisions.includes(item)) errors.push(`directive missing forbidden decision: ${item}`);
  }
  return errors;
}

function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const policyPath = resolve(argument("--policy") ?? `${root}/governance/chat-work-authority-policy.json`);
  const directivePath = resolve(argument("--directive") ?? `${root}/docs/directives/2026-09-01-zero-spend-chatgpt-mast-operational-smoke.json`);
  const requestPath = argument("--request");
  const policy = readJson<ChatWorkPolicy>(policyPath);
  const directive = readJson<CanonicalDirective>(directivePath);
  const errors = [
    ...validateCanonicalPolicy(policy),
    ...validateCanonicalDirective(policy, directive),
  ];
  if (requestPath) errors.push(...evaluateGateRequest(policy, readJson<GateRequest>(resolve(requestPath))));
  const result = {
    status: errors.length === 0 ? "CHAT_WORK_AUTHORITY_GATE_PASS" : "CHAT_WORK_AUTHORITY_GATE_FAIL",
    policyId: policy.policyId,
    directiveId: directive.directiveId,
    maximumModelApiSpendUsd: policy.ownerAuthority.maximumModelApiSpendUsd,
    internalSupervisorRoutingAutomatic: policy.internalSupervisorRouting.automatic,
    errors,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (errors.length > 0) process.exitCode = 1;
}
