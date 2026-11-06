import {
  ATLAS_GLANCE_CLASSES,
  ATLAS_GLANCE_LIMITS,
  ATLAS_GLANCE_SOURCES_MAX,
  ATLAS_GLANCE_STATES,
  AtlasGlanceError,
  type AtlasGlanceRow,
  type AtlasGlanceStore,
} from "@askrigor/evidence-repository";
import { z } from "zod";

import { HEALTH } from "./health-tree.js";
import { sourceIdentifierOf } from "./page-data.js";
import { opensYouTube } from "./page-guard.js";
import { reportTextProblem } from "./report-pages.js";

/**
 * A problem's rows at a glance, in the owner's review (the owner, 3 Nov 2026, on GPT's practitioner scorecard: "make
 * that prominent"; plan docs/superpowers/plans/2026-11-03-atlas-reports-health-tree.md, section 4), as runtime actions
 * of review_research_contribution (owner answer 189a). propose_glance_row stores a row privately: a controlled result,
 * a named practitioner's published outcome series, a programme's outcomes, a historical lead, or what failed or harmed,
 * with its result, comparison, follow-up, limits and sources, after a source check of its numbers. show_glance_row is
 * the owner's yes for that one row and needs confirm: true; a row naming a person also needs the named-person screen
 * (published outcomes only, never an allegation). withdraw_glance_row takes one off for good; list_glance_rows lists
 * them by state. The texts get the reports' checks; each source is a study identifier or a plain https address.
 */

export const ATLAS_GLANCE_ACTIONS = ["propose_glance_row", "list_glance_rows", "show_glance_row", "withdraw_glance_row"] as const;
export type AtlasGlanceAction = typeof ATLAS_GLANCE_ACTIONS[number];
export const ATLAS_GLANCE_OUTCOMES = ["glance_row_proposed", "glance_rows_listed", "glance_row_changed"] as const;
export type AtlasGlanceOutcome = typeof ATLAS_GLANCE_OUTCOMES[number];

const SUBCATEGORY_KEYS = HEALTH.subcategories.map(({ key }) => key) as [string, ...string[]];
const text = (max: number) => z.string().trim().min(1).max(max);

/** later_inputs.glanceRow on propose_glance_row. */
export const glanceRowInputSchema = z.object({
  subcategory: z.enum(SUBCATEGORY_KEYS).describe("The problem's subcategory under Health, by key."),
  rowClass: z.enum(ATLAS_GLANCE_CLASSES).describe("controlled, practitioner (a named person's published outcome " +
    "series), programme, lead (a historical lead worth chasing) or failed (what failed or harmed)."),
  what: text(ATLAS_GLANCE_LIMITS.what).describe("What it is: the treatment, practitioner or programme, and the problem."),
  result: text(ATLAS_GLANCE_LIMITS.result).describe("The result in numbers, with its denominators."),
  comparison: text(ATLAS_GLANCE_LIMITS.comparison).nullable().describe("What it was compared with; null when nothing was."),
  followUp: text(ATLAS_GLANCE_LIMITS.followUp).nullable().describe("How long people were followed."),
  limits: text(ATLAS_GLANCE_LIMITS.limits).describe("What keeps it from proving more: missing people, selection, harms, cost."),
  sources: z.array(text(ATLAS_GLANCE_LIMITS.source)).min(1).max(ATLAS_GLANCE_SOURCES_MAX)
    .describe("Each a PMID, PMCID, DOI or NCT number, or a plain https address."),
  namesAPerson: z.boolean().describe("true when it names a person; then it holds published outcomes only."),
}).strict();
export type GlanceRowInput = z.infer<typeof glanceRowInputSchema>;

export const glanceRowIdSchema = z.string().trim().toUpperCase().regex(/^G-[1-9][0-9]{3,}$/u);

export const atlasGlanceSchema = z.object({
  rows: z.array(z.object({
    row: z.string(), subcategory: z.string(), rowClass: z.string(), what: z.string(), result: z.string(),
    comparison: z.string().nullable(), followUp: z.string().nullable(), limits: z.string(), sources: z.array(z.string()),
    namesAPerson: z.boolean(), state: z.enum(ATLAS_GLANCE_STATES),
  }).strict()),
  changed: z.object({ row: z.string(), state: z.enum(ATLAS_GLANCE_STATES) }).strict().nullable(),
}).strict();
export type AtlasGlance = z.infer<typeof atlasGlanceSchema>;

export interface AtlasGlanceRequest {
  action: AtlasGlanceAction;
  glanceRow?: GlanceRowInput;
  glanceRowId?: string;
  glanceState?: (typeof ATLAS_GLANCE_STATES)[number];
  confirm?: boolean;
}

export interface AtlasGlanceResult {
  ok: boolean;
  text: string;
  outcome?: AtlasGlanceOutcome;
  error?: { code: "invalid_request" | "item_not_found" | "decision_conflict"; message: string };
  glance?: AtlasGlance;
}

const failure = (code: "invalid_request" | "item_not_found" | "decision_conflict", text: string): AtlasGlanceResult =>
  ({ ok: false, text, error: { code, message: text } });

/** Exact checks of a row: its texts as the reports' checks read them, and each source's form. */
export function glanceRowProblems(row: GlanceRowInput): string[] {
  const problems: string[] = [];
  for (const field of ["what", "result", "comparison", "followUp", "limits"] as const) {
    const value = row[field];
    if (value !== null && reportTextProblem(value, field) !== undefined) problems.push(`${field}: ${reportTextProblem(value, field)}`);
  }
  row.sources.forEach((source, index) => {
    if (sourceIdentifierOf(source) !== undefined) return;
    let parsed: URL | undefined;
    try {
      parsed = new URL(source);
    } catch {
      parsed = undefined;
    }
    if (parsed === undefined || parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "" ||
      parsed.port !== "" || opensYouTube(source)) {
      problems.push(`sources[${index}] is not a PMID, PMCID, DOI or NCT number, or a plain https address that isn't YouTube`);
    }
  });
  return problems;
}

const viewOf = (row: AtlasGlanceRow): AtlasGlance["rows"][number] => ({ row: row.publicId, subcategory: row.subcategoryKey,
  rowClass: row.rowClass, what: row.what, result: row.result, comparison: row.comparison, followUp: row.followUp,
  limits: row.limits, sources: [...row.sources], namesAPerson: row.namesAPerson, state: row.state });

export class AtlasGlanceReview {
  constructor(private readonly deps: { glance: AtlasGlanceStore; now: () => Date }) {}

  async run(request: AtlasGlanceRequest): Promise<AtlasGlanceResult> {
    switch (request.action) {
      case "propose_glance_row": return await this.propose(request.glanceRow);
      case "list_glance_rows": {
        const rows = await this.deps.glance.inspect(request.glanceState ?? "proposed", undefined, 50);
        return { ok: true, outcome: "glance_rows_listed", text: rows.length === 0 ? `No ${request.glanceState ?? "proposed"} rows.`
          : rows.map((row) => `${row.publicId} (${row.rowClass}, ${row.subcategoryKey}${row.namesAPerson ? ", names a person" : ""}): ` +
            `${row.what}`).join("\n"), glance: { rows: rows.map(viewOf), changed: null } };
      }
      case "show_glance_row":
      case "withdraw_glance_row": return await this.change(request);
    }
  }

  private async propose(input: GlanceRowInput | undefined): Promise<AtlasGlanceResult> {
    const parsed = glanceRowInputSchema.safeParse(input);
    if (!parsed.success) return failure("invalid_request", "propose_glance_row needs later_inputs.glanceRow.");
    const problems = glanceRowProblems(parsed.data);
    if (problems.length > 0) return failure("invalid_request", `Nothing was stored. ${problems.join("; ")}.`);
    const row = parsed.data;
    const id = await this.deps.glance.propose({ categoryKey: HEALTH.key, subcategoryKey: row.subcategory,
      rowClass: row.rowClass, what: row.what, result: row.result, comparison: row.comparison, followUp: row.followUp,
      limits: row.limits, sources: row.sources, namesAPerson: row.namesAPerson }, this.deps.now().toISOString());
    return { ok: true, outcome: "glance_row_proposed", text: `${id} is stored privately. It shows only after the ` +
      `owner's yes for it (show_glance_row with confirm: true)${row.namesAPerson ? "; it names a person, so it must " +
        "hold published outcomes only, never an allegation about anyone" : ""}.`,
      glance: { rows: [], changed: { row: id, state: "proposed" } } };
  }

  private async change(request: AtlasGlanceRequest): Promise<AtlasGlanceResult> {
    const id = glanceRowIdSchema.safeParse(request.glanceRowId);
    if (!id.success) return failure("invalid_request", `${request.action} needs later_inputs.glanceRowId, such as G-1001.`);
    const show = request.action === "show_glance_row";
    if (show && request.confirm !== true) {
      return failure("invalid_request", "show_glance_row is the owner's yes for this row: send confirm: true only after " +
        "the owner said yes to it, its numbers were checked against their sources, and a row naming a person holds " +
        "published outcomes only.");
    }
    let state;
    try {
      state = await this.deps.glance.setState(id.data, show ? "shown" : "withdrawn", this.deps.now().toISOString());
    } catch (error) {
      if (error instanceof AtlasGlanceError && error.code === "WITHDRAWN") {
        return failure("decision_conflict", `${id.data} is withdrawn for good; propose it again if it should show.`);
      }
      throw error;
    }
    if (state === null) return failure("item_not_found", `No row ${id.data}.`);
    return { ok: true, outcome: "glance_row_changed", text: `${id.data} is ${state}.`,
      glance: { rows: [], changed: { row: id.data, state } } };
  }
}
