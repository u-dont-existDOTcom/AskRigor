import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  finalizeResearch, finalizeResearchInputSchema, TOOL_LIST_REFRESH_HINT,
  type FinalizeResearchInput, type FinalizeResearchOutput
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import { assertNextStepsContract } from "./helpers/finalize-next-steps-contract.js";

const SECRET = "lab-preparation-test-secret-01234567890123456789";
const DOI = "10.1000/lab";
const QUOTE = "Drink water normally before the repeat draw unless instructed otherwise.";
const base = (overrides: Partial<FinalizeResearchInput> = {}): FinalizeResearchInput => ({
  receipts: [issueResearchReceipt("study_audit", {
    id: DOI, status: "complete_no_unresolved_fields"
  }, { secret: SECRET })],
  research_target: "Synthetic lab preparation declaration", research_depth: "deep", treatment_choice: "not_compared",
  community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome",
  not_relevant_reason: "Synthetic quote checks isolate the declaration contract.",
  commercial_review_applicability: { status: "not_applicable", reason: "Synthetic fixture concerns no commercial product." },
  intervention_identity: { status: "not_applicable", reason: "Synthetic fixture contains no study intervention." },
  full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates lab preparation checks." },
  key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: DOI, status: "validated" }], absence_claims: [], scale_results: [], user_observations: [], proposed_tests: [], safety_claims: [], key_terms: [], mechanism_claims: [], recommendations: [],
  answer_draft: `[Study](https://doi.org/${DOI}). ${QUOTE}`, ...overrides
});
const covered = (answer_quotes = [QUOTE]) => ({ status: "covered" as const, answer_quotes });
const notApplicable = { status: "not_applicable" as const, reason: "The answer interprets no lab result and plans no test." };

describe.each(["gate", "MCP endpoint"] as const)("lab_preparation through the %s", (surface) => {
  let server: ReturnType<typeof createAskRigorServer> | undefined;
  let client: Client | undefined;
  beforeAll(async () => {
    if (surface === "gate") return;
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    vi.stubEnv("ASKRIGOR_FINDINGS_LIBRARY", "false");
    server = createAskRigorServer();
    client = new Client({ name: "lab-preparation-test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(b);
    await client.connect(a);
  });
  afterAll(async () => {
    await client?.close();
    await server?.close();
    vi.unstubAllEnvs();
  });
  const call = async (overrides: Partial<FinalizeResearchInput> = {}): Promise<FinalizeResearchOutput> => {
    const input = base(overrides);
    if (surface === "gate") return assertNextStepsContract(finalizeResearch(input, { secret: SECRET }));
    const result = await client!.callTool({ name: "finalize_research", arguments: { ...input } });
    expect(result.isError).not.toBe(true);
    return assertNextStepsContract(result.structuredContent as FinalizeResearchOutput);
  };

  it("requires the declaration with key sources and supplies one refresh hint", async () => {
    const result = await call();
    expect(result.status).toBe("not_ready");
    expect(result.next_steps).toEqual([
      "Give lab_preparation: status covered with answer_quotes from answer_draft giving collection " +
        "conditions or preparation advice, or status not_applicable with reason.",
      TOOL_LIST_REFRESH_HINT
    ]);
    expect(result.finalization_receipt).toBeUndefined();
  });
  // One object, not two alternatives (ChatGPT's app showed the union as "unknown", 2026-10-16): a status without its
  // field gets the declaration step, and a field the status does not use is left unused.
  it.each([{ status: "covered" as const }, { status: "not_applicable" as const }])(
    "asks for the field %j needs", async (lab_preparation) => {
      expect((await call({ lab_preparation })).next_steps).toEqual([
        "Give lab_preparation: status covered with answer_quotes from answer_draft giving collection " +
          "conditions or preparation advice, or status not_applicable with reason.",
        TOOL_LIST_REFRESH_HINT
      ]);
    });
  it("leaves the field a status does not use unused", async () => {
    expect((await call({ lab_preparation: { ...notApplicable, answer_quotes: ["This sentence is missing from the answer."] } }))
      .status).toBe("ready");
    expect((await call({ lab_preparation: { ...covered(), reason: notApplicable.reason } })).status).toBe("ready");
  });
  it("does not require it without key sources", async () => {
    const result = await call({ key_sources: [],
      answer_draft: "No study's methods were checked in full text for this answer." });
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps).toEqual([]);
  });
  it("accepts covered with every quote shown", async () => {
    const second = "Repeat under comparable collection conditions.";
    const result = await call({ lab_preparation: covered([QUOTE, second]),
      answer_draft: `${base().answer_draft} ${second}` });
    expect(result.status).toBe("ready");
    expect(result.next_steps).toEqual([]);
  });
  it("checks quotes using the existing visible-prose normalization in any language", async () => {
    const quote = "Buvez de l’eau normalement avant le prélèvement.";
    const result = await call({ lab_preparation: covered([quote]),
      answer_draft: `[Study](https://doi.org/${DOI}). **Buvez** de l'eau\nnormalement avant le prélèvement.` });
    expect(result.status).toBe("ready");
    expect(result.next_steps).toEqual([]);
  });
  it("rejects a quote absent from the answer with the existing quote failure wording", async () => {
    const result = await call({ lab_preparation: covered([QUOTE, "This sentence is missing from the answer."]) });
    expect(result.status).toBe("not_ready");
    expect(result.next_steps).toEqual([
      "lab_preparation.answer_quotes[1] gives text the answer does not show: the quote does not occur in answer_draft."
    ]);
    expect(result.finalization_receipt).toBeUndefined();
  });
  it("requires an answer draft when covered is declared", async () => {
    const result = await call({ lab_preparation: covered(), answer_draft: undefined });
    expect(result.status).toBe("not_ready");
    expect(result.next_steps).toEqual([
      "Pass the answer you are about to give as answer_draft, exactly as the user will see it; the final check reads it.",
      TOOL_LIST_REFRESH_HINT
    ]);
  });
  it("accepts not_applicable with a valid reason without judging applicability", async () => {
    const result = await call({ lab_preparation: notApplicable });
    expect(result.status).toBe("ready");
    expect(result.next_steps).toEqual([]);
  });
  it("leaves advice quality to the model", async () => {
    const quote = "The model declares this unrelated sentence as covered.";
    const result = await call({ lab_preparation: covered([quote]), answer_draft: `${base().answer_draft} ${quote}` });
    expect(result.status).toBe("ready");
  });
  if (surface === "MCP endpoint") it("rejects a too-short reason at the endpoint", async () => {
    const result = await client!.callTool({ name: "finalize_research", arguments: {
      ...base(), lab_preparation: { status: "not_applicable", reason: "short" }
    } });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ status: "not_ready", answer_checked: false });
    expect((result.structuredContent!.next_steps as string[]).join("\n")).toContain("lab_preparation.reason:");
  });
});

describe("lab_preparation strict bounds", () => {
  it.each([
    { status: "not_applicable", reason: "short" },
    { status: "not_applicable", reason: " ".repeat(10) },
    { status: "not_applicable", reason: "x".repeat(301) },
    covered([]), covered(Array(6).fill(QUOTE)),
    covered(["x".repeat(9)]), covered([" ".repeat(10)]), covered(["x".repeat(501)]),
    { status: "unknown", reason: notApplicable.reason }, { ...notApplicable, coverage: "unpublished field" }
  ])("rejects invalid input %j", (lab_preparation) => {
    expect(finalizeResearchInputSchema.safeParse({ ...base(), lab_preparation }).success).toBe(false);
  });
  it.each([
    { status: "not_applicable", reason: "x".repeat(10) },
    { status: "not_applicable", reason: "x".repeat(300) },
    covered(["x".repeat(10)]), covered(Array(5).fill("x".repeat(500)))
  ])("accepts exact bounds %j", (lab_preparation) => {
    expect(finalizeResearchInputSchema.safeParse({ ...base(), lab_preparation }).success).toBe(true);
  });
});
