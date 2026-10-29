import { z } from "zod";
import { displayedProse, linkTargets, visibleText } from "./displayed-prose.js";

/**
 * A documentary claim is not a clinical-effect estimate. This is an evidence declaration, not
 * a new authoritative source: external page reading remains unverified by AskRigor itself.
 * Source passage, subject, relationship, scope, and answer text are kept distinct.
 */
export const documentaryEvidenceSchema = z.array(z.object({
  relation: z.enum([
    "outside_paid_placement", "affiliate_commission", "gift", "own_offering",
    "declined_sponsorship_offer", "research_funding", "creator_product_advisory",
    "research_author_employment_or_equity", "patent_or_licensing_interest", "unknown"
  ]),
  relationship_scope: z.enum(["this_content", "creator_other_business", "underlying_study", "unknown"]),
  source_type: z.enum(["publisher_paper", "company_page", "official_register", "creator_statement",
    "publisher_search_excerpt", "other"]),
  source_read_depth: z.enum(["section_read", "excerpt_only", "not_read"]),
  source_url: z.string().url().max(1_000),
  source_section: z.string().trim().min(1).max(160),
  source_quote: z.string().trim().max(300),
  evidence_state: z.enum(["documented", "bounded_not_found", "unverified"]),
  answer_quote: z.string().trim().min(10).max(600),
  coverage_limit: z.string().trim().min(10).max(300).optional()
}).strict()).min(1).max(20);

export type DocumentaryEvidence = z.output<typeof documentaryEvidenceSchema>;

/**
 * Exact structural checks only. The model still owns source interpretation; this validator
 * never infers compensation, bias, causality, or the content of an unobserved external page.
 */
export function checkDocumentaryEvidence(evidence: DocumentaryEvidence, answerDraft: string | undefined):
{ steps: string[]; caveats: string[] } {
  const steps: string[] = [];
  const caveats: string[] = [];
  if (answerDraft === undefined) {
    steps.push("Documentary evidence needs answer_draft so its claim and source link can be checked.");
    return { steps, caveats };
  }
  const shown = displayedProse(answerDraft, true);
  const visible = shown.map(visibleText).join("\n");
  const links = shown.map(linkTargets).join("\n");
  for (const [index, entry] of evidence.entries()) {
    const at = "documentary_evidence[" + index + "]";
    if (!visible.includes(entry.answer_quote)) {
      steps.push(at + ".answer_quote must be copied exactly from the visible answer_draft.");
    }
    if (!links.includes(entry.source_url)) {
      steps.push(at + ".source_url must appear as a visible source link in answer_draft.");
    }
    if (entry.evidence_state === "documented" && entry.source_read_depth === "not_read") {
      steps.push(at + " cannot claim documented financial provenance when its source was not read.");
    }
    if (entry.evidence_state === "documented" && entry.source_quote === "") {
      steps.push(at + " needs the short actual source wording for a documented relationship.");
    }
    if (entry.evidence_state === "bounded_not_found" && entry.source_read_depth === "not_read") {
      steps.push(at + " cannot claim a bounded absence without reading the named source section.");
    }
    if (entry.evidence_state !== "documented" && entry.coverage_limit === undefined) {
      steps.push(at + " must state the search/access limit: not verified does not prove absent.");
    }
    if (entry.relation === "outside_paid_placement" && entry.relationship_scope !== "this_content") {
      steps.push(at + " cannot label payment for this content from an outside business or study relationship.");
    }
    if (entry.relation === "research_funding" && entry.relationship_scope !== "underlying_study") {
      steps.push(at + " must attribute study funding to the underlying study, not to video sponsorship.");
    }
    if (entry.evidence_state === "bounded_not_found") {
      caveats.push("Not locating a financial relationship in the named source sections does not establish that no such relationship exists.");
    }
    if (entry.source_read_depth === "excerpt_only") {
      caveats.push("Some documentary funding or relationship evidence was read only as an indexed excerpt, not a complete source.");
    }
  }
  caveats.push("Documentary source readings here were declared rather than independently authenticated by an AskRigor receipt; these checks do not establish clinical effects or undisclosed payment.");
  return { steps, caveats: [...new Set(caveats)] };
}
