import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  CORRECTION_REPORT_OFFER, communitySkipCaveat, finalizeResearch as finalizeResearchUnwrapped,
  type FinalizeResearchInput, type FinalizeResearchOutput
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { COMPLETE_CHECKS_TIP, PASSING_LIMITS_GUIDANCE } from "../apps/research-mcp/src/final-check-messages.js";
import { issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import { withAtlasLookupFixture } from "./helpers/atlas-lookup-fixture.js";
import { withCommunitySkip } from "./helpers/community-skip.js";
import { advisoryNotes, assertNextStepsContract, copiedLimitsNote } from "./helpers/finalize-next-steps-contract.js";
import { withSourceReading } from "./helpers/source-reading.js";

// The owner, 5 Nov 2026: an answer says beside each key study it cites how it was read, its words copied in
// source_reading. These fixtures isolate other checks, so each call gets the shared helper's reading words.
const finalizeResearch = (...args: Parameters<typeof finalizeResearchUnwrapped>) =>
  finalizeResearchUnwrapped(withSourceReading(args[0], { check: args[1] }), args[1]);

const SECRET = "caveats-as-written-test-secret-0123456789";
const DOI = "10.1000/caveats";
const LINKS = `[Study](https://doi.org/${DOI}) describes the mechanism.`;
const FIRST_PASS = "This was a first pass: some studies and communities were not reached yet.";
const REASON = "The question asks only what the names mean chemically.";
const SKIP = communitySkipCaveat(REASON);
const INCLUDE = "Include as written, translated when the answer is not in English: ";
const declaration = { status: "not_applicable" as const, reason: "Synthetic fixture isolates answer caveats." };
const correction = {
  retracted: "The earlier assertion was wrong.", change: "The assertion is corrected.", by_user: true,
  report: "The assertion is corrected.", preventing_rule: "no_rule", missing_rule: "Check source identity."
};
const base = (overrides: Partial<FinalizeResearchInput> = {}): FinalizeResearchInput => withCommunitySkip({
  receipts: [issueResearchReceipt("study_audit", { id: DOI, status: "complete_no_unresolved_fields" }, { secret: SECRET })],
  research_target: "Synthetic answer caveats", research_depth: "first_pass", treatment_choice: "not_compared",
  community_evidence: "not_relevant", not_relevant_basis: "emergency_before_triage",
  not_relevant_reason: "Synthetic emergency fixture.",
  commercial_review_applicability: declaration, intervention_identity: declaration, lab_preparation: declaration,
  full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates answer caveats." },
  key_sources: [{ id: DOI, status: "validated", read_depth: "full_text_audited", answer_marker: "Study" }],
  absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [],
  safety_claims: [], safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [],
  answer_draft: LINKS, ...overrides
});

// Only sentences shown as written belong in caveats under every status; every limit stays in limits.
describe.each(["gate", "MCP endpoint"] as const)("finalize caveats shown as written through %s", (surface) => {
  let server: ReturnType<typeof createAskRigorServer> | undefined;
  let client: Client | undefined;
  beforeAll(async () => {
    if (surface === "gate") return;
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    vi.stubEnv("ASKRIGOR_FINDINGS_LIBRARY", "false");
    server = createAskRigorServer("standard");
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "caveats-as-written-test", version: "1" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });
  afterAll(async () => {
    await client?.close();
    await server?.close();
    vi.unstubAllEnvs();
  });
  const call = async (input: FinalizeResearchInput) => {
    const request = withAtlasLookupFixture(input, { secret: SECRET });
    if (surface === "gate") return { result: assertNextStepsContract(finalizeResearch(request, { secret: SECRET })), text: "" };
    const response = await client!.callTool({ name: "finalize_research", arguments: withSourceReading({ ...request }) });
    expect(response.isError).not.toBe(true);
    return {
      result: assertNextStepsContract(response.structuredContent as FinalizeResearchOutput),
      text: response.content.filter((item) => item.type === "text").map((item) => item.text).join("\n")
    };
  };
  const referenceLine = (text: string) => text.split(`\n${PASSING_LIMITS_GUIDANCE}\n`)[1]?.split("\n")[0];

  it("keeps ordinary limits out of caveats under passing and not_ready checks", async () => {
    const passed = (await call(base())).result;
    expect(passed).toMatchObject({ status: "ready_with_limits", limits: [FIRST_PASS], caveats: [], next_steps: [] });
    expect(passed.caveats.filter((sentence) => passed.limits.includes(sentence))).toEqual([]);
    const ready = (await call(base({ research_depth: "deep" }))).result;
    expect(ready).toMatchObject({ status: "ready", limits: [], caveats: [] });
    const pending = await call(base({ receipts: [] }));
    expect(pending.result.status).toBe("not_ready");
    expect(pending.result.limits).toContain(FIRST_PASS);
    expect(pending.result.caveats).toEqual([]);
    if (surface === "MCP endpoint") {
      expect(pending.text).toContain(`\nLimit to include in your own words: ${FIRST_PASS}`);
      expect(pending.text).not.toContain(PASSING_LIMITS_GUIDANCE);
      expect(pending.text).not.toContain(INCLUDE);
    }
  });

  it("keeps only as-written sentences when an unfinished check stops", async () => {
    const input = base({ receipts: [], not_relevant_basis: "no_real_world_outcome",
      question_about: "other", not_relevant_reason: REASON });
    let result = (await call(input)).result;
    for (let count = 0; count < 4 && result.status !== "stopped"; count += 1) {
      result = (await call({ ...input, round_token: result.round_token })).result;
    }
    expect(result.status).toBe("stopped");
    expect(result.limits).toContain(FIRST_PASS);
    expect(result.caveats).toEqual([SKIP, COMPLETE_CHECKS_TIP]);
  });

  it("keeps the user's correction question in both fields and on its own text line", async () => {
    const { result, text } = await call(base({ corrections: [correction],
      answer_draft: `${LINKS}\n\n${correction.change}\n\nMissing rule: ${correction.missing_rule}` }));
    expect(result.status).toBe("ready_with_limits");
    expect(result.limits).toContain(CORRECTION_REPORT_OFFER);
    expect(result.caveats).toEqual([CORRECTION_REPORT_OFFER]);
    if (surface === "MCP endpoint") {
      expect(referenceLine(text)).toBe(`[1] Missing rule: ${correction.missing_rule} [2] ${FIRST_PASS}`);
      expect(referenceLine(text)).not.toContain(CORRECTION_REPORT_OFFER);
      expect(text.split("\n")).toContain(`${INCLUDE}${CORRECTION_REPORT_OFFER}`);
    }
  });

  it("keeps the community-skip sentence in both fields and on its own text line", async () => {
    const { result, text } = await call(base({ not_relevant_basis: "no_real_world_outcome",
      question_about: "other", not_relevant_reason: REASON }));
    expect(result.status).toBe("ready_with_limits");
    expect(result.limits).toEqual([SKIP, FIRST_PASS]);
    expect(result.caveats).toEqual([SKIP]);
    if (surface === "MCP endpoint") {
      expect(referenceLine(text)).toBe(`[1] ${FIRST_PASS}`);
      expect(referenceLine(text)).not.toContain(SKIP);
      expect(text.split("\n")).toContain(`${INCLUDE}${SKIP}`);
    }
  });

  const observations: FinalizeResearchInput["user_observations"] = [
    { observation: "the first reported change", response: "uncertain", source: "user" },
    { observation: "the second reported change", response: "uncertain", source: "user" }
  ];
  it("notes a draft that repeats three ordinary limits word for word", async () => {
    const input = base({ user_observations: observations });
    const first = (await call(input)).result;
    expect(first.limits).toHaveLength(3);
    expect(first.caveats).toEqual([]);
    const { result } = await call({ ...input, answer_draft: `${input.answer_draft}\n\n${first.limits.join("\n\n")}` });
    expect(result.status).toBe("ready_with_limits");
    expect(result.limits).toEqual(first.limits);
    expect(advisoryNotes(result)).toContain(copiedLimitsNote(3));
  });

  it("does not count the community skip and correction question toward the three-limit paste note", async () => {
    const input = base({ user_observations: observations, corrections: [correction],
      not_relevant_basis: "no_real_world_outcome", question_about: "other", not_relevant_reason: REASON,
      answer_draft: `${LINKS}\n\n${correction.change}\n\nMissing rule: ${correction.missing_rule}` });
    const first = (await call(input)).result;
    expect(first.caveats).toEqual([CORRECTION_REPORT_OFFER, SKIP]);
    const material = first.limits.filter((limit) => !first.caveats.includes(limit));
    expect(material).toHaveLength(4);
    const { result } = await call({ ...input,
      answer_draft: `${LINKS}\n\n${correction.change}\n\n${SKIP}\n\n${CORRECTION_REPORT_OFFER}\n\n${material[0]}` });
    expect(result.status).toBe("ready_with_limits");
    expect(result.limits).toEqual(first.limits);
    expect(result.checked_answer).toContain(SKIP);
    expect(result.checked_answer).toContain(CORRECTION_REPORT_OFFER);
    expect(result.checked_answer).toContain(material[0]);
    expect(advisoryNotes(result).filter((note) => note.startsWith("The draft repeats "))).toEqual([]);
  });
});
