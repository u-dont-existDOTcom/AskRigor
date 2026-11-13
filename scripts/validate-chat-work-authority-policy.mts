import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface ChatWorkPolicy {
  schemaVersion: number;
  policyId: string;
  /** When the zero-spend owner decision took effect; a paid-inference decision must be newer. */
  effectiveAt?: string;
  ownerAuthority: {
    sourceFeedbackSha256: string;
    paidModelInferenceAllowed: boolean;
    maximumModelApiSpendUsd: number;
    internalSupervisorRoutingStandingAuthorization: boolean;
  };
  reasoningAuthorities: string[];
  executionOnlyActors: string[];
  // Owner correction, 2026-10-01: a Claude session reasons and executes; the Chat/Work split is for OpenAI surfaces.
  claudeSessions: {
    ownerCorrectionDate: string;
    ownerCorrection: string;
    reasonsAndExecutes: boolean;
    chatSourceReceiptRequiredForOwnReasoning: boolean;
    routesReasoningToAnotherChat: boolean;
    codexDirectiveBinds: string[];
    ownerOnlyDecisionsAskedOn: string;
    ownerOnlyDecisions: string[];
  };
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
  /**
   * The newer explicit owner decisions that allow paid model inference on named paths only (owner answer 221,
   * 2 November 2026). Every other path keeps ownerAuthority's zero ceiling and still needs a newer owner decision.
   */
  paidModelInferenceDecisions?: PaidModelInferenceDecision[];
  completion: {
    default: string;
    greenSubtaskIsStopCondition: boolean;
    allowedStops: string[];
  };
}

/** One owner decision allowing paid model inference: its date, scope, funding and ceiling, in the owner's words. */
export interface PaidModelInferenceDecision {
  decisionId: string;
  /** The day the owner decided, YYYY-MM-DD; newer than the policy's zero-spend decision. */
  date: string;
  provider: string;
  /** The only paths it allows, from PAID_MODEL_INFERENCE_SCOPES. */
  scopes: string[];
  funding: string;
  ceiling: {
    basis: string;
    maximumModelApiSpendUsdPerMonth: number;
    spendBeyondCreditsPermitted: boolean;
    note: string;
  };
  /** The owner question's option as it was put to the owner. */
  question: string;
  /** The owner's answer, pasted exactly, with any key locator replaced by a bracketed marker. */
  ownerWords: string[];
  /** What the record deliberately leaves out, such as a key file's path. */
  notRecorded: string[];
  codexOrWorkMayAuthorPaidProposal: boolean;
}

/** The paths a recorded owner decision can allow; any other path keeps the zero ceiling. */
export const PAID_MODEL_INFERENCE_SCOPES = [
  // Owner answer 221: the Claude API inside the final check, for the owner's dev accounts.
  "MEANING_JUDGE_ON_OWNER_DEV_ACCOUNTS",
  // Owner answer 221: "we can also maybe try the web app".
  "ASKRIGOR_WEB_APP_TRIAL",
  // Owner answer 298b (13 November 2026): AskRigor's own planning call when a dev account registers its plain answer.
  "RESEARCH_PLANNER_ON_OWNER_DEV_ACCOUNTS",
  // Owner answer 301a (13 November 2026): AskRigor's own review of a dev account's draft answer at the final check.
  "ANSWER_REVIEW_ON_OWNER_DEV_ACCOUNTS",
] as const;

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
  /** The path the spend is for, one a recorded owner decision names; without one the zero ceiling applies. */
  modelApiSpendScope?: string | null;
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

  // A Claude session does its own reasoning, so its reasoning needs no chat receipt; spending checks still apply.
  const ownReasoning = request.actor === "CLAUDE_SESSION"
    && !policy.claudeSessions.chatSourceReceiptRequiredForOwnReasoning;
  if (policy.reasoningReservedActions.includes(request.action) && !ownReasoning) {
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

  // A path a recorded owner decision names has that decision's ceiling; every other path keeps the zero ceiling.
  const decision = paidDecisionFor(policy, request.modelApiSpendScope);
  if (decision !== undefined) {
    if (request.modelApiSpendUsd > decision.ceiling.maximumModelApiSpendUsdPerMonth) {
      errors.push(`model API spend ${request.modelApiSpendUsd} exceeds the ceiling ` +
        `${decision.ceiling.maximumModelApiSpendUsdPerMonth} of owner decision ${decision.decisionId}`);
    }
  } else {
    if (request.modelApiSpendUsd > policy.ownerAuthority.maximumModelApiSpendUsd) {
      errors.push(`model API spend ${request.modelApiSpendUsd} exceeds active ceiling ${policy.ownerAuthority.maximumModelApiSpendUsd}`);
    }
    if (request.modelApiSpendUsd > 0 && !policy.ownerAuthority.paidModelInferenceAllowed) {
      errors.push("paid model API inference is canceled by the active owner decision outside the scopes a newer owner " +
        "decision names");
    }
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
  // Outside the scopes a recorded owner decision names, paid model inference stays disabled with a zero ceiling: a
  // nonzero ceiling is valid only in a decision that names its date, scope, funding and ceiling.
  if (policy.ownerAuthority.paidModelInferenceAllowed !== false) {
    errors.push("paid model inference must remain disabled outside a recorded owner decision's scopes");
  }
  if (policy.ownerAuthority.maximumModelApiSpendUsd !== 0) {
    errors.push("model API ceiling must equal zero outside a recorded owner decision's scopes");
  }
  if (policy.spending.codexMayAuthorPaidProposal !== false || policy.spending.workMayAuthorPaidProposal !== false) {
    errors.push("Codex/Work must not author a paid proposal or ceiling");
  }
  if (policy.spending.olderPaidManifestCanRevivePath !== false) errors.push("an older paid manifest must not revive a paid path");
  if (policy.spending.newerExplicitOwnerDecisionRequiredForAnyNonzeroSpend !== true) {
    errors.push("nonzero spend must require a newer explicit owner decision");
  }
  errors.push(...validatePaidModelInferenceDecisions(policy));
  if (!policy.ownerAuthority.internalSupervisorRoutingStandingAuthorization) errors.push("standing internal routing authorization is missing");
  for (const actor of ["OWNER", "PROJECT_MANAGER_CHAT", "SPECIALIST_SUPERVISOR_CHAT"]) {
    if (!policy.reasoningAuthorities.includes(actor)) errors.push(`missing reasoning authority ${actor}`);
  }
  for (const actor of ["CODEX", "WORK"]) {
    if (!policy.executionOnlyActors.includes(actor)) errors.push(`missing execution-only actor ${actor}`);
  }
  if (!policy.reasoningAuthorities.includes("CLAUDE_SESSION")
    || policy.executionOnlyActors.includes("CLAUDE_SESSION")) {
    errors.push("a Claude session must be a reasoning authority, not an execution-only actor");
  }
  if (policy.claudeSessions?.reasonsAndExecutes !== true) errors.push("a Claude session must both reason and execute");
  if (policy.claudeSessions?.routesReasoningToAnotherChat !== false) {
    errors.push("a Claude session must not route its reasoning to another chat");
  }
  for (const decision of ["NONZERO_SPEND", "MERGE_OR_DEPLOY"]) {
    if (!policy.claudeSessions?.ownerOnlyDecisions.includes(decision)) {
      errors.push(`a Claude session's owner-only decisions must include ${decision}`);
    }
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

/** The recorded owner decision that names this path, if any. */
export function paidDecisionFor(
  policy: ChatWorkPolicy,
  scope: string | null | undefined,
): PaidModelInferenceDecision | undefined {
  if (typeof scope !== "string" || scope === "") return undefined;
  return (policy.paidModelInferenceDecisions ?? []).find(({ scopes }) => Array.isArray(scopes) && scopes.includes(scope));
}

// A key, a workspace ID or a local path in a decision's record: each exact and structural.
const KEY_MATERIAL_OR_LOCATOR = /sk-ant-[A-Za-z0-9_-]{4,}|wrkspc_[A-Za-z0-9]{4,}|(?:^|[\s:"'(])\/(?:home|Users|root|mnt|tmp)\//u;

/**
 * Each recorded decision names its date (newer than the zero-spend decision), its scope (known paths only, each in one
 * decision), its funding and its positive monthly ceiling, with the owner's question and words, and records no key,
 * workspace ID or local path. Codex and Work still author no paid proposal or ceiling under it.
 */
export function validatePaidModelInferenceDecisions(policy: ChatWorkPolicy): string[] {
  const decisions = policy.paidModelInferenceDecisions;
  if (decisions === undefined) return [];
  if (!Array.isArray(decisions)) return ["paidModelInferenceDecisions must be a list"];
  const errors: string[] = [];
  const zeroSpendDay = typeof policy.effectiveAt === "string" ? policy.effectiveAt.slice(0, 10) : "";
  const seenIds = new Set<string>();
  const seenScopes = new Set<string>();
  decisions.forEach((decision, index) => {
    const at = `paid model inference decision ${typeof decision?.decisionId === "string" && decision.decisionId.trim() !== ""
      ? decision.decisionId : `#${index + 1}`}`;
    const text = (value: unknown) => typeof value === "string" && value.trim() !== "";
    if (!text(decision?.decisionId)) errors.push(`${at} needs a decisionId`);
    else if (seenIds.has(decision.decisionId)) errors.push(`${at} is recorded twice`);
    else seenIds.add(decision.decisionId);
    if (typeof decision?.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(decision.date) ||
      Number.isNaN(Date.parse(`${decision.date}T00:00:00Z`)) ||
      new Date(`${decision.date}T00:00:00Z`).toISOString().slice(0, 10) !== decision.date) {
      errors.push(`${at} must name its date as YYYY-MM-DD`);
    } else if (zeroSpendDay === "" || decision.date <= zeroSpendDay) {
      errors.push(`${at} must be newer than the zero-spend owner decision`);
    }
    if (!text(decision?.provider)) errors.push(`${at} must name its provider`);
    if (!Array.isArray(decision?.scopes) || decision.scopes.length === 0) {
      errors.push(`${at} must name its scope`);
    } else {
      for (const scope of decision.scopes) {
        if (!(PAID_MODEL_INFERENCE_SCOPES as readonly string[]).includes(scope)) {
          errors.push(`${at} names an unknown scope ${String(scope)}`);
        } else if (seenScopes.has(scope)) {
          errors.push(`${at} names scope ${scope}, which another decision already names`);
        } else seenScopes.add(scope);
      }
    }
    if (!text(decision?.funding)) errors.push(`${at} must name its funding`);
    const ceiling = decision?.ceiling;
    if (ceiling === null || typeof ceiling !== "object" || !text(ceiling.basis) ||
      typeof ceiling.maximumModelApiSpendUsdPerMonth !== "number" ||
      !Number.isFinite(ceiling.maximumModelApiSpendUsdPerMonth) || ceiling.maximumModelApiSpendUsdPerMonth <= 0 ||
      typeof ceiling.spendBeyondCreditsPermitted !== "boolean") {
      errors.push(`${at} must name its ceiling: a basis, a positive monthly maximum in USD and whether spend beyond it is permitted`);
    }
    if (!text(decision?.question)) errors.push(`${at} must record the question the owner answered`);
    if (!Array.isArray(decision?.ownerWords) || decision.ownerWords.length === 0 || !decision.ownerWords.every(text)) {
      errors.push(`${at} must record the owner's words`);
    }
    if (decision?.codexOrWorkMayAuthorPaidProposal !== false) {
      errors.push(`${at} must not let Codex or Work author a paid proposal or ceiling`);
    }
    if (KEY_MATERIAL_OR_LOCATOR.test(JSON.stringify(decision ?? null))) {
      errors.push(`${at} must not record a key, a workspace ID or a local path`);
    }
  });
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
    // The paths newer owner decisions allow, each with its own ceiling; every other path keeps the one above.
    paidModelInferenceDecisions: (policy.paidModelInferenceDecisions ?? []).map((decision) => ({
      decisionId: decision.decisionId,
      date: decision.date,
      scopes: decision.scopes,
      funding: decision.funding,
      maximumModelApiSpendUsdPerMonth: decision.ceiling?.maximumModelApiSpendUsdPerMonth,
    })),
    internalSupervisorRoutingAutomatic: policy.internalSupervisorRouting.automatic,
    errors,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (errors.length > 0) process.exitCode = 1;
}
