import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { NEXT_STEP_KINDS } from "./next-step-kinds.js";
import { maskedRule, type CheckRule } from "./check-rules.js";
import type { RoundOutcome } from "./check-rounds.js";
import type { RunningVersions } from "./version.js";

export const CHECK_REPORT_MAX_CHARACTERS = 6_000;
export const CHECK_REPORT_TOKEN_MAX_CHARACTERS = 34_000;
const reportStepSchema = z.object({
  kind: z.enum(NEXT_STEP_KINDS), consecutive_rounds: z.number().int().min(1).max(10),
  rule: z.string().max(1_200), omitted_characters: z.number().int().nonnegative()
}).strict();
export const checkReportSchema = z.object({
  v: z.literal(1),
  build: z.string().max(80), hrp: z.string().max(64), universal: z.string().max(64),
  reason: z.enum(["limit", "stuck"]), round: z.number().int().min(1).max(10),
  could_not: z.array(reportStepSchema).max(120), next_turn: z.array(reportStepSchema).max(120),
  limits: z.array(z.string().max(1_200)).max(120),
  receipts: z.array(z.object({ kind: z.string().max(80), count: z.number().int().nonnegative(),
    rejected: z.array(z.object({ reason: z.string().max(100), count: z.number().int().positive() }).strict()).max(20)
  }).strict()).max(30),
  omitted_steps: z.number().int().nonnegative(), omitted_receipt_kinds: z.number().int().nonnegative(),
  omitted_limits: z.number().int().nonnegative()
}).strict().refine((report) => JSON.stringify(report).length <= CHECK_REPORT_MAX_CHARACTERS);
export type CheckReport = z.output<typeof checkReportSchema>;
type Stopped = Extract<RoundOutcome, { status: "stopped" }>;
export type ReportReceipt = { kind: string; reason?: string };

/** Only masked rules and server-owned diagnostic names are admitted here, never receipt claims or tokens. */
export function buildCheckReport(outcome: Stopped, options: {
  allowed: (value: unknown) => boolean; versions: RunningVersions; receipts: readonly ReportReceipt[];
  limits?: readonly CheckRule[];
}): CheckReport {
  const groups = new Map<string, { count: number; reasons: Map<string, number> }>();
  for (const receipt of options.receipts) {
    const kind = options.allowed(receipt.kind) ? receipt.kind : "…";
    const group = groups.get(kind) ?? { count: 0, reasons: new Map<string, number>() };
    group.count += 1;
    if (receipt.reason !== undefined) {
      const reason = options.allowed(receipt.reason) ? receipt.reason : "…";
      group.reasons.set(reason, (group.reasons.get(reason) ?? 0) + 1);
    }
    groups.set(kind, group);
  }
  const report: CheckReport = {
    v: 1, ...options.versions, reason: outcome.reason, round: outcome.round,
    could_not: [], next_turn: [], limits: [],
    receipts: [...groups].map(([kind, group]) => ({ kind, count: group.count,
      rejected: [...group.reasons].map(([reason, count]) => ({ reason, count })) })),
    omitted_steps: 0, omitted_receipt_kinds: 0, omitted_limits: 0
  };
  const size = () => JSON.stringify(report).length;
  while (report.receipts.length > 30) {
    report.receipts.pop(); report.omitted_receipt_kinds += 1;
  }
  while (size() > CHECK_REPORT_MAX_CHARACTERS - 200 && report.receipts.length > 0) {
    report.receipts.pop(); report.omitted_receipt_kinds += 1;
  }
  for (const [key, steps] of [["could_not", outcome.couldNot], ["next_turn", outcome.nextTurn]] as const) {
    for (const step of steps) {
      const masked = maskedRule(step.rule, options.allowed);
      const entry = { kind: step.kind, consecutive_rounds: step.consecutive ?? 1,
        rule: masked.slice(0, 1_200), omitted_characters: Math.max(0, masked.length - 1_200) };
      report[key].push(entry);
      if (size() > CHECK_REPORT_MAX_CHARACTERS - 100 || report[key].length > 120) {
        report[key].pop(); report.omitted_steps += 1;
      }
    }
  }
  for (const limit of options.limits ?? []) {
    const masked = maskedRule(limit, options.allowed);
    if (masked.length > 1_200 || report.limits.length >= 120) { report.omitted_limits += 1; continue; }
    report.limits.push(masked);
    if (size() > CHECK_REPORT_MAX_CHARACTERS - 100) { report.limits.pop(); report.omitted_limits += 1; }
  }
  return checkReportSchema.parse(report);
}

function mac(body: string, secret: string): Buffer {
  const key = createHmac("sha256", secret).update("askrigor final check report v1").digest();
  return createHmac("sha256", key).update(body).digest().subarray(0, 16);
}

/** No expiry: a user can consent to this exact report in a later turn. */
export function issueCheckReportToken(report: CheckReport, secret: string): string {
  const body = `br1~${Buffer.from(JSON.stringify(checkReportSchema.parse(report))).toString("base64url")}`;
  const token = `${body}~${mac(body, secret).toString("base64url")}`;
  if (token.length > CHECK_REPORT_TOKEN_MAX_CHARACTERS) throw new Error("Final check report token too large");
  return token;
}

export function verifyCheckReportToken(token: string, secret: string | undefined): CheckReport | undefined {
  if (secret === undefined || token.length > CHECK_REPORT_TOKEN_MAX_CHARACTERS) return undefined;
  const parts = token.split("~");
  if (parts.length !== 3 || parts[0] !== "br1" || !/^[A-Za-z0-9_-]+$/u.test(parts[1]!) ||
    !/^[A-Za-z0-9_-]{22}$/u.test(parts[2]!)) return undefined;
  const signature = Buffer.from(parts[2]!, "base64url");
  const body = `br1~${parts[1]}`;
  if (signature.length !== 16 || signature.toString("base64url") !== parts[2] ||
    !timingSafeEqual(signature, mac(body, secret))) return undefined;
  try {
    const payload = Buffer.from(parts[1]!, "base64url");
    if (payload.toString("base64url") !== parts[1]) return undefined;
    const parsed = checkReportSchema.safeParse(JSON.parse(payload.toString("utf8")));
    return parsed.success ? parsed.data : undefined;
  } catch { return undefined; }
}

export const CHECK_REPORT_SECTION_TITLE = "The final check's report, as AskRigor recorded it";
export function checkReportSection(report: CheckReport): string {
  return `## ${CHECK_REPORT_SECTION_TITLE}\n\n\`\`\`json\n${JSON.stringify(report)}\n\`\`\``;
}
