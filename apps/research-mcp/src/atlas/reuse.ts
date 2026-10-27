import { createHash } from "node:crypto";
import { z } from "zod";
import { displayedProse, LINK_TARGET, LINK_CLOSE } from "../displayed-prose.js";
import { findingPath } from "./pages.js";
import { sourceIdentifierOf, type ShownFinding } from "./page-data.js";

export const atlasNumberSchema = z.string().regex(/^[PF]-[1-9][0-9]{3,}$/u);
export const ATLAS_RELATIONS = ["confirms", "updates", "narrows", "contradicts", "not_relevant"] as const;
export const atlasReuseSchema = z.object({
  number: atlasNumberSchema,
  relation: z.enum(ATLAS_RELATIONS),
  answer_quote: z.string().trim().min(1).max(2_000).optional(),
  page_url: z.url().max(500).optional(),
  lead_only: z.boolean().optional().describe("True when this uses an unchecked finding only as a lead, without a source read again."),
}).strict();
export const atlasBasisSchema = atlasReuseSchema.pick({ number: true, relation: true })
  .extend({ relation: z.enum(["confirms", "updates", "narrows", "contradicts"]) }).strict();
export type AtlasReuse = z.output<typeof atlasReuseSchema>;
export type AtlasBasis = z.output<typeof atlasBasisSchema>;

export function atlasSourceDigest(source: { scheme: string; value: string }): string {
  return createHash("sha256").update(`${source.scheme}:${source.value}`).digest("hex").slice(0, 32);
}
export function atlasPageUrl(number: string, origin: string): string { return `${origin}${findingPath(number)}`; }
export function atlasReceiptFinding(finding: ShownFinding): string {
  return [finding.publicationNumber, finding.status.kind === "unreviewed" ? "" : finding.status.atlasNumber,
    finding.status.kind === "unreviewed" ? "u" : "c",
    finding.sources.flat().map(atlasSourceDigest).join(".")].join("|");
}
/** The limit an answer states when every Atlas lookup it passed could not run. */
export const ATLAS_LOOKUP_FAILED_CAVEAT = "AskRigor could not search its Atlas for this question this time, so " +
  "earlier findings on it may have been missed.";

export function uncheckedAtlasCaveat(number: string): string {
  return `Atlas finding ${number} has not been checked by supervisors; it is a lead, not an established finding.`;
}

export function checkedAtlasSources(receipts: readonly { kind: string; claims: Record<string, string | string[]> }[],
  target: string, declarations: readonly AtlasReuse[]): Set<string> {
  const used = new Set(declarations.filter(({ relation }) => relation !== "not_relevant").map(({ number }) => number));
  const sources = new Set<string>();
  for (const { kind, claims } of receipts) {
    if (kind !== "atlas_lookup" || claims.target !== target) continue;
    const found = claims.found === undefined ? [] : Array.isArray(claims.found) ? claims.found : [claims.found];
    for (const row of found) {
      const [publication, accepted, state, hashes] = row.split("|");
      if (state === "c" && (used.has(publication!) || used.has(accepted!)))
        for (const hash of hashes?.split(".").filter(Boolean) ?? []) sources.add(hash);
    }
  }
  return sources;
}

/** Only exact receipts and declarations: relevance, relation and whether wording calls something a lead belong to the model. */
export function checkAtlasReuse(input: {
  receipts: readonly { kind: string; claims: Record<string, string | string[]> }[];
  target: string; required: boolean; declarations: readonly AtlasReuse[];
  draft: string | undefined;
}): { steps: Array<{ kind: "research" | "declaration"; text: string }>; caveats: string[]; basis: AtlasBasis[] } {
  const steps: Array<{ kind: "research" | "declaration"; text: string }> = [];
  const caveats: string[] = [];
  const basis: AtlasBasis[] = [];
  const lookups = input.receipts.filter(({ kind, claims }) => kind === "atlas_lookup" && claims.target === input.target);
  if (input.required && lookups.length === 0) steps.push({ kind: "research", text:
    "Search the Atlas first with search_research_frontiers, using this research_target, and pass its atlas_lookup research_receipt in receipts." });
  // A lookup that could not run counts as tried: the answer says so instead of the check asking again.
  if (lookups.length > 0 && lookups.every(({ claims }) => claims.failed !== undefined)) caveats.push(ATLAS_LOOKUP_FAILED_CAVEAT);
  const findings = new Map<string, { publication: string; origin: string; unchecked: boolean; sources: string[] }>();
  const list = (value: string | string[] | undefined) => value === undefined ? [] : Array.isArray(value) ? value : [value];
  for (const { claims } of lookups) for (const row of list(claims.found)) {
    const [publication, accepted, state, hashes] = row.split("|");
    if (!/^P-[1-9][0-9]{3,}$/u.test(publication ?? "") || (state !== "u" && state !== "c") ||
      typeof claims.origin !== "string") continue;
    // The same publication may be returned under both numbers; one declaration covers the finding.
    findings.set(publication!, { publication: publication!, origin: claims.origin, unchecked: state === "u",
      sources: hashes?.split(".").filter(Boolean) ?? [] });
    if (accepted) findings.set(accepted, findings.get(publication!)!);
  }
  const read = new Set(input.receipts.filter(({ kind }) =>
    ["pubmed_record", "full_text_read", "study_audit", "review_audit"].includes(kind)).flatMap(({ claims }) =>
    ["id", "doi", "pmid", "pmcid"].flatMap((key) => {
      const value = claims[key];
      const source = typeof value === "string" ? sourceIdentifierOf(value) : undefined;
      return source === undefined ? [] : [atlasSourceDigest(source)];
    })));
  const declared = new Set<string>();
  for (const [index, entry] of input.declarations.entries()) {
    const at = `atlas_reuse[${index}]`;
    const finding = findings.get(entry.number);
    if (finding === undefined) { steps.push({ kind: "declaration", text: `${at}.number was not returned by an Atlas lookup for this research_target.` }); continue; }
    if (declared.has(finding.publication)) {
      steps.push({ kind: "declaration", text: `${at} repeats a finding: declare each returned finding once, by its P or F number.` }); continue;
    }
    declared.add(finding.publication);
    if (entry.relation === "not_relevant") continue;
    if (entry.answer_quote === undefined || input.draft === undefined || !input.draft.includes(entry.answer_quote))
      steps.push({ kind: "declaration", text: `${at}.answer_quote must copy the answer's sentence exactly from answer_draft, in any language.` });
    const url = atlasPageUrl(finding.publication, finding.origin);
    if (entry.page_url !== url || entry.answer_quote === undefined || !displayedProse(entry.answer_quote).some((block) => block.includes(`${LINK_TARGET}${url}${LINK_CLOSE}`)))
      steps.push({ kind: "declaration", text: `${at}.page_url and the link in answer_quote must be the finding's own Atlas address: ${url}` });
    if (finding.unchecked) {
      caveats.push(uncheckedAtlasCaveat(entry.number));
      if (!finding.sources.some((hash) => read.has(hash)) && entry.lead_only !== true)
        steps.push({ kind: "research", text: `Check at least one source of unchecked Atlas finding ${entry.number} again in this research and pass its reading receipt, or declare lead_only true and call it a lead in the answer.` });
    }
    basis.push({ number: entry.number, relation: entry.relation });
  }
  for (const finding of new Map([...findings.values()].map((finding) => [finding.publication, finding])).values()) if (!declared.has(finding.publication))
    steps.push({ kind: "declaration", text: `Declare how this answer relates to Atlas finding ${finding.publication} in atlas_reuse: confirms, updates, narrows, contradicts or not_relevant.` });
  return { steps, caveats, basis };
}
