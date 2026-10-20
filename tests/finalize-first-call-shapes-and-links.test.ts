import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  FINALIZE_RESEARCH_HIDDEN_SHAPES, FINALIZE_RESEARCH_SHAPES_DESCRIPTION, finalizeResearch, finalizeResearchInputSchema,
  TOOL_LIST_REFRESH_HINT, type FinalizeResearchInput
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { assertNextStepsContract, inventory } from "./helpers/finalize-next-steps-contract.js";

// The owner regression run of 2026-10-16: 19 of 20 first finalize_research calls were rejected by ChatGPT's connector
// for fields its app shows the model only as "unknown" (read-only Codex probes), and #336's fourth turn kept its
// publisher links through four "has no link" steps.

interface JsonSchemaNode {
  type?: string | string[];
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode;
  anyOf?: JsonSchemaNode[];
  oneOf?: JsonSchemaNode[];
  enum?: unknown[];
}

/**
 * What the probes saw: a top-level input's type at depth 1, its fields at depth 2 and their fields at depth 3, with
 * any union, and any object or array at depth 3 or deeper, shown only as "unknown". Array items count as a level.
 */
function hiddenParts(schema: JsonSchemaNode): string[] {
  const hidden: string[] = [];
  const walk = (node: JsonSchemaNode, path: string, depth: number): void => {
    if (node.anyOf !== undefined || node.oneOf !== undefined) {
      hidden.push(path);
      return;
    }
    const container = node.properties !== undefined || node.items !== undefined ||
      node.type === "object" || node.type === "array";
    if (container && depth >= 3) {
      hidden.push(path);
      return;
    }
    for (const [name, child] of Object.entries(node.properties ?? {})) walk(child, `${path}.${name}`, depth + 1);
    if (node.items !== undefined) walk(node.items, `${path}[]`, depth + 1);
  };
  for (const [name, child] of Object.entries(schema.properties ?? {})) walk(child, name, 1);
  return hidden;
}

/** The zod schema at a path such as community_searches[].threads_read, through optional, default and transform. */
function schemaAt(path: string): z.ZodType {
  type Node = { def: { type: string; innerType?: Node; in?: Node; element?: Node; shape?: Record<string, Node> } };
  const strip = (node: Node): Node => {
    for (;;) {
      if (["optional", "nullable", "default"].includes(node.def.type)) node = node.def.innerType!;
      else if (node.def.type === "pipe") node = node.def.in!;
      else return node;
    }
  };
  let node = finalizeResearchInputSchema as unknown as Node;
  for (const token of path.split(/\.|(?=\[\])/u).filter(Boolean)) {
    node = strip(node);
    node = token === "[]" ? node.def.element! : node.def.shape![token]!;
    if (node === undefined) throw new Error(`No schema at ${path}`);
  }
  return node as unknown as z.ZodType;
}

const finalizer = inventory.tools.find(({ name }) => name === "finalize_research")!;
const published = finalizer.inputSchema as JsonSchemaNode;
const strict = z.toJSONSchema(finalizeResearchInputSchema, { target: "draft-7", io: "input" }) as JsonSchemaNode;

describe("finalize_research inputs ChatGPT's app hides (2026-10-16 probes)", () => {
  it("publishes full_text_search and lab_preparation as one object each, with their fields in sight", () => {
    for (const [name, statuses, fields] of [
      ["full_text_search", ["run", "not_needed"], ["status", "queries", "reason"]],
      ["lab_preparation", ["covered", "not_applicable"], ["status", "answer_quotes", "reason"]]
    ] as const) {
      const node = published.properties![name]!;
      expect(node.oneOf ?? node.anyOf).toBeUndefined();
      expect(node.type).toBe("object");
      expect(Object.keys(node.properties!)).toEqual(fields);
      expect(node.properties!.status!.enum).toEqual(statuses);
      expect(hiddenParts(strict)).not.toContain(name);
    }
  });

  it("gives every hidden part of the published schema its JSON in the tool description, and no other", () => {
    const covered = FINALIZE_RESEARCH_HIDDEN_SHAPES.flatMap(({ paths }) => paths);
    const hidden = hiddenParts(strict).map((path) => path.replace(/\[\]$/u, ""));
    expect([...covered].sort()).toEqual([...new Set(hidden)].sort());
    expect(finalizer.description).toContain(FINALIZE_RESEARCH_SHAPES_DESCRIPTION);
    for (const path of covered) {
      expect([`${path} `, `${path}, `].some((named) => FINALIZE_RESEARCH_SHAPES_DESCRIPTION.includes(named)), path).toBe(true);
    }
  });

  it.each(FINALIZE_RESEARCH_HIDDEN_SHAPES.flatMap(({ paths, examples }) =>
    paths.flatMap((path) => examples.map((example) => [path, example] as const))))(
    "parses the example for %s", (path, example) => {
      const result = schemaAt(path).safeParse(example);
      expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    });

  it("states the limits the type leaves out, and stays descriptive", () => {
    expect(FINALIZE_RESEARCH_SHAPES_DESCRIPTION).toContain(
      "key_sources[].answer_marker is the visible label, 3 to 80 characters, not a link; another_pass_estimate has at " +
      "most 200 characters; answer_language is a language tag such as en or pt-BR.");
    expect(FINALIZE_RESEARCH_SHAPES_DESCRIPTION.length).toBeLessThanOrEqual(2_100);
    expect(FINALIZE_RESEARCH_SHAPES_DESCRIPTION).not.toMatch(/\b(?:call|must|always|never|do not|don't)\b/iu);
  });
});

const SECRET = "first-call-shapes-and-links-test-secret-0123456789";
const DOI = "10.1000/trial";
const OTHER = "10.1000/other";
const PMID = "39997570";
const PMCID = "PMC12233511";
const PUBLISHER = "https://www.publisher.example/articles/trial-2026";
const sign = (kind: Parameters<typeof issueResearchReceipt>[0], claims: Parameters<typeof issueResearchReceipt>[1]) =>
  issueResearchReceipt(kind, claims, { secret: SECRET });
const declaration = { status: "not_applicable" as const, reason: "Synthetic fixture isolates link checks." };
const audit = sign("study_audit", { id: DOI, status: "complete_no_unresolved_fields" });
const base = (overrides: Partial<FinalizeResearchInput> = {}): FinalizeResearchInput => ({
  receipts: [audit],
  research_target: "Synthetic key-study links", research_depth: "deep", treatment_choice: "not_compared",
  community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome",
  not_relevant_reason: "Synthetic fixture isolates link checks.",
  commercial_review_applicability: declaration, intervention_identity: declaration, lab_preparation: declaration,
  full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates link checks." },
  key_sources: [{ id: DOI, status: "validated", read_depth: "full_text_audited", answer_marker: "Trial" }],
  absence_claims: [], scale_results: [], user_observations: [], proposed_tests: [], safety_claims: [], key_terms: [], mechanism_claims: [], recommendations: [],
  answer_draft: `[Trial](https://doi.org/${DOI}) was read.`, ...overrides
});
const check = (overrides: Partial<FinalizeResearchInput> = {}) =>
  assertNextStepsContract(finalizeResearch(base(overrides), { secret: SECRET }));
const linkSteps = (link: string, receipts: string[], key_sources = base().key_sources) =>
  check({ receipts, key_sources, answer_draft: `[Trial](${link}) was read.` }).next_steps
    .filter((step) => step !== TOOL_LIST_REFRESH_HINT && /^Key (?:study|source) /u.test(step));
const untied = (link: string, pages: string) =>
  `Key study ${DOI} is linked by ${link}, which no receipt passed here ties to it: link ${pages} instead, or pass the ` +
  `research_receipt that ties that page: resolve_doi with ${DOI} ties the page the DOI is registered to, and ` +
  "fetch_pubmed_record ties the study's PubMed page.";

describe("key-study links AskRigor's receipts tie (#336, 2026-10-16)", () => {
  it("accepts the doi.org page as before", () => {
    expect(check().status).toBe("ready");
  });

  it.each([
    `https://europepmc.org/articles/${PMCID}`, `https://pmc.ncbi.nlm.nih.gov/articles/${PMCID}/`,
    `https://europepmc.org/article/MED/${PMID}`, `https://pubmed.ncbi.nlm.nih.gov/${PMID}/`
  ])("accepts %s once an audit of that copy names its identifiers with the DOI", (link) => {
    const copy = sign("study_audit", { id: PMCID, doi: DOI, pmid: PMID, pmcid: PMCID, status: "complete_no_unresolved_fields" });
    expect(linkSteps(link, [copy])).toEqual([]);
    expect(linkSteps(link, [sign("full_text_read", { id: PMCID, doi: DOI, pmid: PMID, pmcid: PMCID, content: "0".repeat(16) }), audit]))
      .toEqual([]);
  });

  it("does not tie a lead receipt's PMCID, which no copy confirmed", () => {
    const lead = sign("full_text_lead", { doi: DOI, pmcid: PMCID, state: "NO_COPY_FOUND_AFTER_EXPANDED_SEARCH" });
    expect(linkSteps(`https://europepmc.org/articles/${PMCID}`, [audit, lead]))
      .toEqual([untied(`https://europepmc.org/articles/${PMCID}`, `https://doi.org/${DOI}`)]);
  });

  it("accepts the publisher page resolve_doi found the DOI registered to, compared as thread links are", () => {
    const resolution = sign("doi_resolution", { doi: DOI, url: PUBLISHER });
    for (const link of [PUBLISHER, "https://publisher.example/articles/trial-2026/", `${PUBLISHER}#methods`]) {
      expect(linkSteps(link, [audit, resolution])).toEqual([]);
    }
    expect(linkSteps("https://www.publisher.example/articles/other-2026", [audit, resolution])).toEqual([
      untied("https://www.publisher.example/articles/other-2026", `https://doi.org/${DOI} or ${PUBLISHER}`)
    ]);
  });

  it("accepts the copy a full-text receipt says AskRigor fetched", () => {
    const repository = "https://repository.example/handle/123";
    expect(linkSteps(repository, [sign("study_audit", { id: DOI, doi: DOI, url: repository, status: "complete_no_unresolved_fields" })]))
      .toEqual([]);
  });

  it("names a publisher link no receipt ties, once, instead of the two steps it caused", () => {
    expect(linkSteps(`${PUBLISHER}.`, [audit])).toEqual([untied(PUBLISHER, `https://doi.org/${DOI}`)]);
  });

  it("offers the pages the receipts tie, at most three", () => {
    const copy = sign("study_audit", { id: PMCID, doi: DOI, pmid: PMID, pmcid: PMCID, url: `https://europepmc.org/articles/${PMCID}`,
      status: "complete_no_unresolved_fields" });
    expect(linkSteps(PUBLISHER, [copy])).toEqual([untied(PUBLISHER,
      `https://doi.org/${DOI}, https://europepmc.org/articles/${PMCID} or https://pmc.ncbi.nlm.nih.gov/articles/${PMCID}/`)]);
  });

  it("keeps the earlier steps for a link naming another DOI or another key study", () => {
    const marker = `Key source ${DOI} has no answer_marker on the same line as its link in answer_draft; put its answer_marker there.`;
    const missing = `Key study ${DOI} has no link in the answer; link it to the page AskRigor's tools returned, such as https://doi.org/${DOI}.`;
    expect(linkSteps(`https://doi.org/${OTHER}`, [audit])).toEqual([marker, missing]);
    const other = sign("doi_resolution", { doi: OTHER, url: "https://journal.example/other" });
    const sources = [...base().key_sources, { id: OTHER, status: "validated" as const, read_depth: "full_text_audited" as const,
      answer_marker: "Other" }];
    const steps = check({
      receipts: [audit, sign("study_audit", { id: OTHER, status: "complete_no_unresolved_fields" }), other],
      key_sources: sources, answer_draft: "[Trial and Other](https://journal.example/other) were read."
    }).next_steps;
    expect(steps).toContain(marker);
    expect(steps).toContain(missing);
    expect(steps.join(" ")).not.toContain(`Key study ${DOI} is linked by`);
  });

  it("names the untied link for a PMID or PMCID source without offering resolve_doi", () => {
    const pmidSource = [{ id: PMID, status: "validated" as const, read_depth: "full_text_audited" as const, answer_marker: "Trial" }];
    const pubmed = sign("pubmed_record", { pmid: PMID, doi: "" });
    const record = sign("study_audit", { id: PMID, status: "complete_no_unresolved_fields" });
    expect(linkSteps(PUBLISHER, [pubmed, record], pmidSource)).toEqual([
      `Key study ${PMID} is linked by ${PUBLISHER}, which no receipt passed here ties to it: link ` +
        `https://pubmed.ncbi.nlm.nih.gov/${PMID}/ instead.`
    ]);
  });
});
