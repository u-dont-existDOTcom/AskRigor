import { advisoryNotes, assertNextStepsContract } from "./helpers/finalize-next-steps-contract.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  finalizeResearch, finalizeResearchInputSchema, READ_DEPTH_VALUES, TOOL_LIST_REFRESH_HINT,
  type FinalizeResearchInput, type FinalizeResearchOutput
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import { withCommunitySkip } from "./helpers/community-skip.js";

const SECRET = "read-depth-test-secret-01234567890123456789";
const DOI = "10.1000/depth";
const OTHER = "10.1000/other";
const MARKER = "[Texte lu]";
const sign = (kind: Parameters<typeof issueResearchReceipt>[0], id = DOI) =>
  issueResearchReceipt(kind, { doi: id, content: "a".repeat(16) }, { secret: SECRET });
const base = (overrides: Partial<FinalizeResearchInput> = {}): FinalizeResearchInput => ({
  receipts: [sign("study_audit")],
  research_target: "Synthetic reading-depth declaration", research_depth: "deep", treatment_choice: "not_compared",
  community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome", question_about: "other",
  not_relevant_reason: "Synthetic fixture isolates structural reading-depth checks.",
  commercial_review_applicability: { status: "not_applicable", reason: "Synthetic fixture concerns no commercial product." },
  intervention_identity: { status: "not_applicable", reason: "Synthetic fixture contains no study intervention." },
  full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates reading-depth checks." },
  lab_preparation: { status: "not_applicable", reason: "Synthetic fixture interprets no lab result and plans no test." },
  key_sources: [{ id: DOI, status: "validated", read_depth: "full_text_audited", answer_marker: MARKER }],
  absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], safety_claims: [], safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [], answer_draft: `${MARKER} [Étude](https://doi.org/${DOI}).`, ...overrides
});

describe.each(["gate", "MCP endpoint"] as const)("read_depth through %s", (surface) => {
  let server: ReturnType<typeof createAskRigorServer> | undefined;
  let client: Client | undefined;
  beforeAll(async () => {
    if (surface === "gate") return;
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    vi.stubEnv("ASKRIGOR_FINDINGS_LIBRARY", "false");
    server = createAskRigorServer();
    client = new Client({ name: "read-depth-test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(b); await client.connect(a);
  });
  afterAll(async () => { await client?.close(); await server?.close(); vi.unstubAllEnvs(); });
  const call = async (overrides: Partial<FinalizeResearchInput> = {}): Promise<FinalizeResearchOutput> => {
    const input = withCommunitySkip(base(overrides));
    if (surface === "gate") return assertNextStepsContract(finalizeResearch(input, { secret: SECRET }));
    const result = await client!.callTool({ name: "finalize_research", arguments: { ...input } });
    expect(result.isError).not.toBe(true);
    return assertNextStepsContract(result.structuredContent as FinalizeResearchOutput);
  };
  it("requires every source's declaration and gives one refresh hint", async () => {
    const result = await call({ key_sources: [{ id: DOI, status: "validated" }] });
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps).toEqual([]);
    expect(advisoryNotes(result)).toContain(`Give key_sources.read_depth for ${DOI}: ${READ_DEPTH_VALUES.join(", ")}.`);
    expect(advisoryNotes(result).join(" ")).toContain("key_sources.answer_marker");
    expect(advisoryNotes(result).filter((step) => step === TOOL_LIST_REFRESH_HINT)).toHaveLength(1);
  });
  it.each(READ_DEPTH_VALUES.filter((depth) => depth !== "atlas_checked"))("accepts %s with an audit receipt", async (read_depth) => {
    expect((await call({ key_sources: [{ id: DOI, status: "validated", read_depth, answer_marker: MARKER }] })).status).toBe("ready_with_limits");
  });
  it.each(READ_DEPTH_VALUES.filter((depth) => depth !== "atlas_checked"))("checks %s against no receipt, a reading receipt and both audit kinds", async (read_depth) => {
    for (const kind of [undefined, "full_text_read", "study_audit", "review_audit"] as const) {
      const result = await call({ receipts: kind === undefined ? [] : [sign(kind)],
        key_sources: [{ id: DOI, status: "validated", read_depth, answer_marker: MARKER }] });
      const overclaims = result.next_steps.filter((step) => step.includes("cannot support read_depth"));
      const refused = read_depth === "full_text_audited" ? kind !== "study_audit" && kind !== "review_audit"
        : read_depth === "full_text_read" ? kind === undefined : false;
      expect(overclaims, `${read_depth}/${kind}`).toHaveLength(refused ? 1 : 0);
      if (refused) { expect(result.status).toBe("not_ready"); expect(result.finalization_receipt).toBeUndefined(); }
    }
  });
  it("names the source and supported value on an overclaim", async () => {
    const result = await call({ receipts: [sign("full_text_read")], key_sources: [base().key_sources[0]!] });
    expect(result.next_steps.join(" ")).toContain(`Key source ${DOI} cannot support read_depth full_text_audited`);
    expect(result.next_steps.join(" ")).toContain("give read_depth full_text_read");
  });
  it.each(["study_audit", "review_audit", "full_text_read"] as const)("rejects a %s receipt for another source", async (kind) => {
    const result = await call({ receipts: [sign(kind, OTHER)],
      key_sources: [{ id: DOI, status: "validated", read_depth: kind === "full_text_read" ? "full_text_read" : "full_text_audited", answer_marker: MARKER }] });
    expect(result.next_steps.join(" ")).toContain("cannot support read_depth");
  });
  it("rejects a tampered reading receipt", async () => {
    const result = await call({ receipts: [issueResearchReceipt("full_text_read", { doi: OTHER, content: "a".repeat(16) }, { secret: `${SECRET}wrong` })],
      key_sources: [{ id: OTHER, status: "validated", read_depth: "full_text_read", answer_marker: MARKER }],
      answer_draft: `${MARKER} [Study](https://doi.org/${OTHER})` });
    expect(result.status).toBe("not_ready");
    expect(result.next_steps.join(" ")).toContain("cannot support read_depth");
  });
  it.each([
    `${MARKER}\n[Étude](https://doi.org/${DOI}).`,
    `[Étude](https://doi.org/${DOI}).\n${MARKER}`,
    `[Étude](https://doi.org/${DOI}) <!-- ${MARKER} -->`,
    `[Étude](https://doi.org/${DOI}) \`${MARKER}\``,
    `\`\`\`\n${MARKER} [Étude](https://doi.org/${DOI})\n\`\`\``,
    `> ${MARKER} [Étude](https://doi.org/${DOI})`,
    `[Étude](https://doi.org/${DOI} "${MARKER}")`,
    `${MARKER} [Other](https://doi.org/${OTHER})\n[Étude](https://doi.org/${DOI})`
  ].map((answer_draft, index) => ({ answer_draft, linkShown: index !== 4 && index !== 5 })))("keeps marker placement advisory while checking a visible source link: $answer_draft", async ({ answer_draft, linkShown }) => {
    const result = await call({ answer_draft });
    expect(result.status).toBe(linkShown ? "ready_with_limits" : "not_ready");
    expect(result.next_steps).toEqual(linkShown ? [] : [expect.stringContaining("no link in the answer")]);
    expect(advisoryNotes(result).join(" ")).toContain("no answer_marker on the same line");
  });
  it("keeps marker diagnostics limited to published fields", async () => {
    const result = await call({ key_sources: [{ id: DOI, status: "validated", read_depth: "full_text_audited", answer_marker: "unpublished_marker_text" }] });
    expect(result.status).toBe("ready_with_limits");
    expect(advisoryNotes(result).join(" ")).not.toContain("unpublished_marker_text");
  });
  it("rejects a marker consisting only of formatting", async () => {
    const result = await call({ key_sources: [{ id: DOI, status: "validated", read_depth: "full_text_audited", answer_marker: "***" }] });
    expect(result.status).toBe("ready_with_limits");
    expect(advisoryNotes(result).join(" ")).toContain("no answer_marker on the same line");
  });
  it("accepts a Markdown table row", async () => {
    expect((await call({ answer_draft: `| Source | Reading |\n| --- | --- |\n| [Étude](https://doi.org/${DOI}) | ${MARKER} |` })).status).toBe("ready_with_limits");
  });
  it("normalizes visible emphasis and Unicode without judging the marker's meaning", async () => {
    expect((await call({ key_sources: [{ id: DOI, status: "validated", read_depth: "full_text_read", answer_marker: "Résumé lu" }],
      answer_draft: `**Résumé** lu [Étude](https://doi.org/${DOI})` })).status).toBe("ready_with_limits");
  });
  it("does not require a marker before an answer draft", async () => {
    const result = await call({ answer_draft: undefined,
      key_sources: [{ id: DOI, status: "validated", read_depth: "full_text_audited" }] });
    expect(advisoryNotes(result).join(" ")).not.toContain("answer_marker");
  });
  it("matches a PMID's verified DOI alias", async () => {
    expect((await call({ receipts: [sign("study_audit"), issueResearchReceipt("pubmed_record", { pmid: "1234", doi: DOI }, { secret: SECRET })],
      key_sources: [{ id: "1234", status: "validated", read_depth: "full_text_audited", answer_marker: MARKER }] })).status).toBe("ready_with_limits");
  });
});

it("bounds the published marker to 3–80 characters and rejects undeclared depth values", () => {
  for (const answer_marker of ["xx", "x".repeat(81)]) {
    expect(finalizeResearchInputSchema.safeParse(base({ key_sources: [{ id: DOI, status: "validated", answer_marker }] })).success).toBe(false);
  }
  expect(finalizeResearchInputSchema.safeParse({ ...base(), key_sources: [{ id: DOI, status: "validated", read_depth: "invented" }] }).success).toBe(false);
});
