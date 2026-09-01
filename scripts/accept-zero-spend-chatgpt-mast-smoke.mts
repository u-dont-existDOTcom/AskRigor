import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import {
  validateCanonicalDirective,
  validateCanonicalPolicy,
  type CanonicalDirective,
  type ChatWorkPolicy,
} from "./validate-chat-work-authority-policy.mjs";

const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const timestamp = z.string().datetime({ offset: true });

const chatReceiptSchema = z.object({
  chatRole: z.enum(["RESPONSE", "EVALUATOR"]),
  condition: z.enum(["BARE", "HRP"]).nullable(),
  providerSurface: z.literal("CHATGPT_CONSUMER"),
  modelMode: z.literal("EXTRA_HIGH"),
  modelNameObserved: z.string().min(1).optional(),
  thinkingEffortObserved: z.string().min(1).optional(),
  chatLocator: z.string().min(1),
  sourceMessageId: z.string().min(1),
  sentAtSource: timestamp.nullable(),
  sentAtSourceStatus: z.enum(["VERIFIED", "UNAVAILABLE"]),
  capturedAt: timestamp,
  exactInputSha256: sha256,
  exactOutputSha256: sha256,
  provenanceStatus: z.enum(["VERIFIED", "OWNER_ATTESTED"]),
  exactOutputStoredPrivately: z.literal(true),
}).superRefine((receipt, context) => {
  if (receipt.chatRole === "RESPONSE" && !receipt.condition) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["condition"], message: "response chat requires BARE or HRP condition" });
  }
  if (receipt.chatRole === "EVALUATOR" && receipt.condition !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["condition"], message: "evaluator chat must remain condition-blind" });
  }
  if (receipt.sentAtSourceStatus === "VERIFIED" && !receipt.sentAtSource) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["sentAtSource"], message: "verified source time requires sentAtSource" });
  }
  if (receipt.sentAtSourceStatus === "UNAVAILABLE" && receipt.sentAtSource !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["sentAtSource"], message: "unavailable source time must remain null" });
  }
});

export const zeroSpendChatgptSmokeReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  receiptType: z.literal("zero_spend_chatgpt_mast_operational_smoke"),
  directiveId: z.literal("askrigor-zero-spend-chatgpt-mast-operational-smoke-v1"),
  repositoryStartHead: z.string().regex(/^[a-f0-9]{40}$/u),
  repositoryEndHead: z.string().regex(/^[a-f0-9]{40}$/u),
  caseFamilyId: z.string().min(1),
  deterministicSelectionReceiptSha256: sha256,
  packets: z.object({
    bare: z.object({ condition: z.literal("BARE"), packetSha256: sha256 }),
    hrp: z.object({ condition: z.literal("HRP"), packetSha256: sha256 }),
    differenceAuditSha256: sha256,
    onlyInstructionConditionAndOpaqueIdentifiersDiffer: z.literal(true),
  }),
  responseChats: z.array(chatReceiptSchema).length(2),
  evaluatorChat: chatReceiptSchema,
  randomization: z.object({
    seed: z.string().min(1),
    mappingSha256: sha256,
    conditionDisclosedBeforeVerdict: z.literal(false),
  }),
  evaluatorOutput: z.object({
    officialRubricLevelScoresPresent: z.literal(true),
    strongestUncertaintyPresent: z.literal(true),
    oneCaseOperationalSmokeLimitationPresent: z.literal(true),
    exactOutputSha256: sha256,
  }),
  execution: z.object({
    providerApiCredentialsUsed: z.literal(false),
    paidModelApiCalls: z.literal(0),
    totalExternalSpendUsd: z.literal(0),
    codexAuthoredScientificInterpretation: z.literal(false),
    ownerRelayRequested: z.literal(false),
    ownerSaySendItRequested: z.literal(false),
    resultsReturnedAutomaticallyToProjectManagerChat: z.literal(true),
    scaledBeyondOneCaseFamily: z.literal(false),
    hrpTunedFromResult: z.literal(false),
    externalSubmissionPerformed: z.literal(false),
    officialMastClaimMade: z.literal(false),
    generalHrpEffectClaimMade: z.literal(false),
  }),
  projectManagerReturnReceipt: z.object({
    messageId: z.string().min(1),
    chatLocator: z.string().url(),
    exactPacketSha256: sha256,
    capturedAt: timestamp,
    provenanceStatus: z.enum(["VERIFIED", "OWNER_ATTESTED"]),
  }),
  completionClaim: z.literal("SUBTASK_COMPLETE_PARENT_OPEN"),
}).superRefine((receipt, context) => {
  const conditions = receipt.responseChats.map((item) => item.condition).sort();
  if (conditions.join(",") !== "BARE,HRP") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["responseChats"], message: "exactly one BARE and one HRP response chat are required" });
  }
  if (receipt.evaluatorChat.chatRole !== "EVALUATOR") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["evaluatorChat", "chatRole"], message: "evaluatorChat must have EVALUATOR role" });
  }
  if (receipt.evaluatorChat.exactOutputSha256 !== receipt.evaluatorOutput.exactOutputSha256) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["evaluatorOutput", "exactOutputSha256"], message: "evaluator output digest mismatch" });
  }
  if (receipt.caseFamilyId !== "All001") {
    for (const [index, chat] of [...receipt.responseChats, receipt.evaluatorChat].entries()) {
      if (!chat.modelNameObserved || !chat.thinkingEffortObserved) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index < receipt.responseChats.length ? "responseChats" : "evaluatorChat"],
          message: "continuation families require exact observed model and thinking effort",
        });
      }
    }
  }
});

export function acceptZeroSpendChatgptSmoke(
  policy: ChatWorkPolicy,
  directive: CanonicalDirective,
  receipt: unknown,
): { status: "ZERO_SPEND_CHATGPT_MAST_SMOKE_ACCEPTED"; caseFamilyId: string; completionClaim: string } {
  const authorityErrors = [
    ...validateCanonicalPolicy(policy),
    ...validateCanonicalDirective(policy, directive),
  ];
  if (authorityErrors.length > 0) {
    throw new Error(`CHAT_WORK_AUTHORITY_GATE_FAILED\n${authorityErrors.join("\n")}`);
  }
  const parsed = zeroSpendChatgptSmokeReceiptSchema.parse(receipt);
  return {
    status: "ZERO_SPEND_CHATGPT_MAST_SMOKE_ACCEPTED",
    caseFamilyId: parsed.caseFamilyId,
    completionClaim: parsed.completionClaim,
  };
}

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const policy = readJson<ChatWorkPolicy>(resolve(root, "governance/chat-work-authority-policy.json"));
  const directive = readJson<CanonicalDirective>(resolve(root, "docs/directives/2026-09-01-zero-spend-chatgpt-mast-operational-smoke.json"));
  const receiptPath = resolve(argument("--receipt") ?? `${root}/docs/audits/2026-09-01-zero-spend-chatgpt-mast-smoke-receipt.json`);
  try {
    const result = acceptZeroSpendChatgptSmoke(policy, directive, readJson<unknown>(receiptPath));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown acceptance failure";
    process.stderr.write(`Zero-spend ChatGPT MAST smoke acceptance failed: ${message}\n`);
    process.exitCode = 1;
  }
}
