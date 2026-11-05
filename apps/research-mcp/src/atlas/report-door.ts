import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  ATLAS_REPORT_FIELD_LIMITS,
  AtlasReportError,
  PostgresAtlasReportStore,
  type AtlasReportInput,
  type AtlasReportStore,
} from "@askrigor/evidence-repository";
import { z } from "zod";

import { researchContributorAccessConfigFromEnv } from "../config.js";
import { displayNameProblem, participantKeyFor, publicOriginFrom, secretFromBase64Url } from "./participation.js";
import { REPORT_FIELDS, reportPath, reportResearchProblems, reportResearchSchema, reportTextProblem } from "./report-pages.js";

/**
 * People's reports through their own AI (owner answer 229a; plan docs/superpowers/plans/2026-11-03-atlas-reports-health-tree.md,
 * section 2, door 2): a person using AskRigor in their own AI app tells it what worked for them; the AI researches it
 * on their plan, shows them the report exactly as it would be published, and on their yes sends it with
 * manage_research_access action share_report and later_inputs.atlasReport (runtime only, owner answer 189a). The
 * report is received privately under the participant key the Atlas sign-in derives for the same account, so the person
 * finds it, and takes it down, on the Atlas's account page as well as with take_down_report. AskRigor's own check
 * reads it before anything is published, whatever its research says.
 */

const text = (max: number) => z.string().trim().min(1).max(max);

/** later_inputs.atlasReport on share_report: the report as the person saw and confirmed it, and its research. */
export const atlasReportShareSchema = z.object({
  problem: text(ATLAS_REPORT_FIELD_LIMITS.problem).describe("The health problem it was for, in a few words."),
  tried: text(ATLAS_REPORT_FIELD_LIMITS.tried).describe("What they tried, by name: the product, food, practice or treatment."),
  dose: text(ATLAS_REPORT_FIELD_LIMITS.dose).optional(),
  howUsed: text(ATLAS_REPORT_FIELD_LIMITS.howUsed).optional(),
  howLong: text(ATLAS_REPORT_FIELD_LIMITS.howLong).optional(),
  whatHappened: text(ATLAS_REPORT_FIELD_LIMITS.whatHappened).describe("What happened, in the person's own words."),
  howLongLasted: text(ATLAS_REPORT_FIELD_LIMITS.howLongLasted).optional(),
  sideEffects: text(ATLAS_REPORT_FIELD_LIMITS.sideEffects).optional(),
  otherChanges: text(ATLAS_REPORT_FIELD_LIMITS.otherChanges).optional(),
  displayName: text(ATLAS_REPORT_FIELD_LIMITS.displayName).nullable()
    .describe("The name to publish it under, as the person chose it; null for no name."),
  research: reportResearchSchema.optional().describe("The research you did around it."),
  confirmed: z.literal(true).describe("true: the person saw this exact report and said yes to publishing it."),
}).strict();
export type AtlasReportShare = z.infer<typeof atlasReportShareSchema>;

/** later_inputs.reportNumber on take_down_report. */
export const reportNumberSchema = z.string().trim().toUpperCase().regex(/^R-[1-9][0-9]{3,}$/u)
  .describe("With take_down_report: the report's number, such as R-1001, that share_report returned.");

export interface AtlasReportDoor {
  store: AtlasReportStore;
  /** The participant key the Atlas sign-in derives for this account's subject. */
  participantKeyFor(subject: string): string;
  publicOrigin: string;
}

/** The door from the environment: the Atlas's participant secret, the identity secret and the access role's database. */
export function atlasReportDoorFromEnv(env: NodeJS.ProcessEnv = process.env): AtlasReportDoor | undefined {
  if (env.ASKRIGOR_ATLAS_PARTICIPATION?.trim() !== "enabled") return undefined;
  try {
    const participantSecret = secretFromBase64Url(env.ASKRIGOR_ATLAS_PARTICIPANT_SECRET_BASE64URL);
    const sessionKey = secretFromBase64Url(env.ASKRIGOR_ATLAS_SESSION_KEY_BASE64URL);
    const publicOrigin = publicOriginFrom(env.ASKRIGOR_ATLAS_PUBLIC_ORIGIN);
    const access = researchContributorAccessConfigFromEnv(env);
    if (participantSecret === undefined || sessionKey === undefined || publicOrigin === undefined || access === undefined) {
      return undefined;
    }
    const settings = { publicOrigin, sessionKey, participantSecret, identitySecret: access.identitySecret };
    return {
      store: new PostgresAtlasReportStore({ connectionString: access.connectionString, schema: access.schema, ssl: access.ssl }),
      participantKeyFor: (subject) => participantKeyFor(settings, subject),
      publicOrigin,
    };
  } catch {
    return undefined;
  }
}

/** Why the report can't be sent, or an empty list; every text as the Atlas form checks it, and the research exactly. */
export function reportShareProblems(report: AtlasReportShare): string[] {
  const problems: string[] = [];
  for (const { field, label } of REPORT_FIELDS) {
    const value = report[field];
    if (value === undefined) continue;
    const problem = reportTextProblem(value, `“${label}”`);
    if (problem !== undefined) problems.push(`${field}: ${problem}`);
  }
  if (report.displayName !== null) {
    const problem = displayNameProblem(report.displayName);
    if (problem !== undefined) problems.push(`displayName: ${problem}`);
  }
  if (report.research !== undefined) problems.push(...reportResearchProblems(report.research).map((problem) => `research: ${problem}`));
  return problems;
}

export function reportInputOfShare(report: AtlasReportShare): AtlasReportInput {
  return {
    problem: report.problem, tried: report.tried, dose: report.dose ?? null, howUsed: report.howUsed ?? null,
    howLong: report.howLong ?? null, whatHappened: report.whatHappened, howLongLasted: report.howLongLasted ?? null,
    sideEffects: report.sideEffects ?? null, otherChanges: report.otherChanges ?? null, displayName: report.displayName,
    research: report.research ?? null,
  };
}

/** What the account tool returns for a report: its number, where it stands, and the page it will have. */
export const atlasReportResultSchema = z.object({
  report: z.string(),
  state: z.enum(["received", "taken_down"]),
  page: z.string().nullable(),
}).strict();

/** The account tool's published error codes that a report's refusals reuse (its output schema is frozen, 189a). */
export type ReportRefusalCode = "share_refused" | "share_limit_reached" | "invalid_request";
type Refuse = (code: ReportRefusalCode, message: string, problems?: string[]) => CallToolResult;

export async function shareReport(door: AtlasReportDoor, subject: string, report: AtlasReportShare, refuse: Refuse,
  ok: (text: string, result: z.infer<typeof atlasReportResultSchema>) => CallToolResult, now: Date): Promise<CallToolResult> {
  const problems = reportShareProblems(report);
  if (problems.length > 0) {
    return refuse("share_refused", "Nothing was sent: the report or its research holds what the Atlas refuses.", problems);
  }
  let publicId: string;
  try {
    publicId = await door.store.submitReport(door.participantKeyFor(subject), "ai_app", reportInputOfShare(report),
      now.toISOString());
  } catch (error) {
    if (error instanceof AtlasReportError && error.code === "LIMIT") {
      return refuse("share_limit_reached", "This account has sent five reports today, or has twenty waiting for the " +
        "check, so nothing was sent; it can send again tomorrow (UTC).");
    }
    if (error instanceof AtlasReportError && error.code === "INPUT_INVALID") {
      return refuse("invalid_request", "The report could not be saved as written; nothing was sent.");
    }
    throw error;
  }
  const page = `${door.publicOrigin}${reportPath(publicId)}`;
  return ok(`Received as ${publicId}. It stays private until AskRigor's AI checks it: if it is safe to try it is ` +
    `published at ${page}, with an AI warning where one is needed; if not, AskRigor's owner decides. Tell the person ` +
    "they can take it down at any time from the Atlas account page, or by asking you (take_down_report with " +
    `later_inputs.reportNumber "${publicId}").`, { report: publicId, state: "received", page });
}

export async function takeDownReport(door: AtlasReportDoor, subject: string, reportNumber: string, refuse: Refuse,
  ok: (text: string, result: z.infer<typeof atlasReportResultSchema>) => CallToolResult): Promise<CallToolResult> {
  const removed = await door.store.takeDown(door.participantKeyFor(subject), reportNumber);
  if (!removed) {
    return refuse("invalid_request", `No report ${reportNumber} of this account is on the Atlas: it was already taken ` +
      "down, or it is not this account's.");
  }
  return ok(`${reportNumber} is taken down and deleted, with any answers on it.`,
    { report: reportNumber, state: "taken_down", page: null });
}
