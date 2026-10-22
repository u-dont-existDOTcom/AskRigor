import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COMMUNITY_SKIP_CAVEAT_START, TOOL_LIST_REFRESH_HINT, communitySkipCaveat, finalizeResearch,
  finalizeResearchPublishedInputSchema, type FinalizeResearchInput
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { issueResearchReceipt, verifyResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import { assertNextStepsContract } from "./helpers/finalize-next-steps-contract.js";

// Owner question 125, answer "125a" (2026-10-20), from lesson #38: community evidence declared not relevant because
// the question has no real-world outcome shows in the answer, in the server's sentence completed by the reason the
// call declares. The sentence is checked as the other caveats are; the reason is the model's declaration, not judged.
const SECRET = "community-skip-caveat-test-secret-0123456789";
const DOI = "10.1000/peptide-z";
const REASON = "The question asks only what the two names mean chemically.";
const SKIP = `${COMMUNITY_SKIP_CAVEAT_START} ${REASON}`;
const LIMIT = "Firsthand reports and community discussions were not searched, for a question declared to have no " +
  "real-world outcome: say so in the answer, with the reason, as the caveat does.";
const LINKS = `[Study](https://doi.org/${DOI}) describes both forms.`;
const declaration = { status: "not_applicable" as const, reason: "Synthetic fixture isolates the skip caveat." };
const base = (overrides: Partial<FinalizeResearchInput> = {}): FinalizeResearchInput => ({
  receipts: [issueResearchReceipt("study_audit", { id: DOI, status: "complete_no_unresolved_fields" }, { secret: SECRET })],
  research_target: "Synthetic product-name question", research_depth: "deep", treatment_choice: "not_compared",
  community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome", question_about: "other", not_relevant_reason: REASON,
  commercial_review_applicability: declaration, intervention_identity: declaration, lab_preparation: declaration,
  full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates the skip caveat." },
  key_sources: [{ id: DOI, status: "validated", read_depth: "full_text_audited", answer_marker: "Study" }],
  absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], safety_claims: [], safety_question: false, key_terms: [],
  mechanism_claims: [], recommendations: [], answer_draft: `${LINKS}\n\n${SKIP}`, ...overrides
});
const check = (overrides: Partial<FinalizeResearchInput> = {}, protocolNames?: ReadonlySet<string>) =>
  assertNextStepsContract(finalizeResearch(base(overrides), {
    secret: SECRET, ...(protocolNames === undefined ? {} : { protocolNames })
  }));
const steps = (overrides: Partial<FinalizeResearchInput> = {}, protocolNames?: ReadonlySet<string>) =>
  check(overrides, protocolNames).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT);
const missing = (caveat: string) => "The answer leaves out this caveat; include each as its own sentence, as written " +
  "(a link's text may change), or, in an answer not in English, in the answer's language with the same links, given " +
  `in caveat_renderings: "${caveat}"`;

describe("finalize_research: a community search skipped for no real-world outcome shows in the answer (question 125)", () => {
  it("requires the server's sentence with the declared reason, as a limit of the answer", () => {
    const passed = check();
    expect(passed).toMatchObject({ status: "ready_with_limits", limits: [LIMIT], caveats: [SKIP], next_steps: [] });
    expect(passed.check_line).toBe("Checked with AskRigor's final check, with the limits above.");
    expect(SKIP).toBe("I did not search firsthand reports or community discussions for this answer: The question " +
      "asks only what the two names mean chemically.");
    const left = check({ answer_draft: LINKS });
    expect(left).toMatchObject({ status: "not_ready", limits: [LIMIT], caveats: [SKIP] });
    expect(left.next_steps).toEqual([missing(SKIP)]);
    expect(left.finalization_receipt).toBeUndefined();
  });

  it("completes the sentence with the reason exactly as declared, on one line, with one closing mark", () => {
    expect(communitySkipCaveat("the names are defined by their structures")).toBe(
      `${COMMUNITY_SKIP_CAVEAT_START} the names are defined by their structures.`);
    expect(communitySkipCaveat("  the names are\n defined   by their structures.  ")).toBe(
      `${COMMUNITY_SKIP_CAVEAT_START} the names are defined by their structures.`);
    expect(communitySkipCaveat("Is a definition all the user wants?")).toBe(
      `${COMMUNITY_SKIP_CAVEAT_START} Is a definition all the user wants?`);
    expect(communitySkipCaveat("名前の化学的な意味だけを問う質問です。")).toBe(
      `${COMMUNITY_SKIP_CAVEAT_START} 名前の化学的な意味だけを問う質問です。`);
    const reason = "The question asks\nonly what the two names mean chemically";
    expect(check({ not_relevant_reason: reason }).caveats).toEqual([SKIP]);
  });

  it("checks it as the other caveats are: its own sentence in prose a reader sees, its wording and emphasis aside", () => {
    expect(check({ answer_draft: `${LINKS}\n\nOne more thing. ${SKIP} Ask if you want them searched.` }).status)
      .toBe("ready_with_limits");
    expect(check({ answer_draft: `${LINKS}\n\n- **${SKIP.slice(0, 40)}**${SKIP.slice(40).toUpperCase()}` }).status)
      .toBe("ready_with_limits");
    for (const draft of [
      `${LINKS}\n\nIt is not true that ${SKIP.charAt(0).toLowerCase()}${SKIP.slice(1)}`,
      `${LINKS}\n\n${SKIP.slice(0, -1)}, and a forum search would add nothing.`,
      `${LINKS}\n\n\`\`\`\n${SKIP}\n\`\`\``,
      `${LINKS}\n\n> ${SKIP}`,
      `${LINKS}\n\n<!-- ${SKIP} -->`,
      `${LINKS}\n\n${COMMUNITY_SKIP_CAVEAT_START} the question is chemical.`
    ]) expect(steps({ answer_draft: draft }), draft).toEqual([missing(SKIP)]);
  });

  it("accepts it in the answer's language through caveat_renderings, checked by place and not by words", () => {
    const french = "Je n'ai pas cherché de témoignages directs ni de discussions de communautés pour cette réponse : " +
      "la question porte seulement sur le sens chimique des deux noms.";
    const japanese = "この回答では、体験談やコミュニティでの議論は調べていません。質問は二つの名前の化学的な意味だけを問うものだからです。";
    for (const [language, text] of [["fr", french], ["ja", japanese]] as const) {
      const renderings = [{ caveat: SKIP, text }];
      expect(check({ answer_draft: `${LINKS}\n\n${text}`, answer_language: language, caveat_renderings: renderings }).status)
        .toBe("ready_with_limits");
      expect(steps({ answer_draft: LINKS, answer_language: language, caveat_renderings: renderings })).toEqual([missing(SKIP)]);
    }
    // The reason may be declared in the answer's language: the server's words stay English, rendered with it.
    const declared = "la question porte seulement sur le sens chimique des deux noms";
    const caveat = communitySkipCaveat(declared);
    expect(check({
      not_relevant_reason: declared, answer_draft: `${LINKS}\n\n${french}`, answer_language: "fr",
      caveat_renderings: [{ caveat, text: french }]
    })).toMatchObject({ status: "ready_with_limits", caveats: [caveat] });
  });

  it("is asked for only with the no_real_world_outcome basis", () => {
    expect(check({ not_relevant_basis: "emergency_before_triage", answer_draft: LINKS }))
      .toMatchObject({ status: "ready", limits: [], caveats: [] });
    // Without a reason the declaration is still missing, and no sentence is written.
    const unreasoned = check({ not_relevant_reason: undefined, answer_draft: LINKS });
    expect(unreasoned.status).toBe("not_ready");
    expect(unreasoned.caveats).toEqual([]);
    expect(unreasoned.next_steps.some((step) => step.startsWith("Community evidence is not_relevant only for"))).toBe(true);
  });

  it("asks for a reason in plain words when it would show internal labels in the answer", () => {
    const labelled = "no_real_world_outcome: the question is chemistry only.";
    expect(steps({ not_relevant_reason: labelled, answer_draft: `${LINKS}\n\n${communitySkipCaveat(labelled)}` })).toEqual([
      "not_relevant_reason shows internal labels (no_real_world_outcome): the answer states this reason in its " +
        "caveat, so give it in plain words."
    ]);
    const named = "ForumSignalNonTrigger allows skipping a chemistry question.";
    expect(steps({ not_relevant_reason: named, answer_draft: `${LINKS}\n\n${communitySkipCaveat(named)}` },
      new Set(["ForumSignalNonTrigger"]))).toContain(
      "not_relevant_reason shows internal labels (ForumSignalNonTrigger): the answer states this reason in its " +
        "caveat, so give it in plain words.");
    // A link, a Reddit name and plain words are not labels.
    const plain = "Only the r/chemistry_help definitions at https://example.org/a_b were asked about.";
    expect(check({ not_relevant_reason: plain, answer_draft: `${LINKS}\n\n${communitySkipCaveat(plain)}` }).status)
      .toBe("ready_with_limits");
  });

  it("keeps the reason request-local: in this call's caveat only, not in the receipt or the carried state", () => {
    const result = check();
    expect(result.status).toBe("ready_with_limits");
    const receipt = verifyResearchReceipt(result.finalization_receipt!, { secret: SECRET });
    expect(receipt.ok).toBe(true);
    if (!receipt.ok) return;
    expect(receipt.claims).toMatchObject({ community: "not_relevant", limits: "1" });
    expect(JSON.stringify(receipt.claims)).not.toContain("chemically");
    expect(JSON.stringify(result.carried ?? {})).not.toContain("chemically");
  });
});

// Owner answer 149a (2026-10-22): asked which reversible factors could explain a low copper and ceruloplasmin result,
// a run skipped every forum as "about laboratory findings". A symptom or a test result has a real-world side, what
// people with it found and tried, so a skip says whether the question is about one, and is refused when it is.
describe("finalize_research: a community skip for a question about a symptom or a test result (answer 149a)", () => {
  const SUBJECT_STEP = "community_evidence cannot be not_relevant for a question about a symptom or a test result: " +
    "what people with it found and tried is real-world evidence. Research it with community_evidence researched: name " +
    "where people discussing it talk in principal_communities and search the dominant one and an independent one, " +
    "or record the access_boundary that stopped you.";

  it("asks the call to say whether the question is about a symptom or a test result", () => {
    const unsaid = check({ question_about: undefined });
    expect(unsaid.status).toBe("not_ready");
    expect(unsaid.next_steps).toContain("With community_evidence not_relevant for no_real_world_outcome, say whether " +
      "the question is about a symptom or a test result (question_about symptom_or_test_result) or not (other).");
    expect(unsaid.next_steps).toContain(TOOL_LIST_REFRESH_HINT);
    expect(unsaid.finalization_receipt).toBeUndefined();
  });

  it("refuses the skip for a symptom or a test result, and keeps it for any other question", () => {
    const refused = check({ question_about: "symptom_or_test_result" });
    expect(refused).toMatchObject({ status: "not_ready", next_steps: [SUBJECT_STEP] });
    expect(refused.next_step_kinds).toEqual(["research"]);
    expect(refused.finalization_receipt).toBeUndefined();
    expect(check({ question_about: "other" })).toMatchObject({ status: "ready_with_limits", next_steps: [] });
  });

  it("asks nothing of an emergency before triage", () => {
    const emergency = check({ not_relevant_basis: "emergency_before_triage", question_about: undefined });
    expect(emergency.next_steps.join("\n")).not.toContain("question_about");
  });
});

describe("finalize_research documents the reason on both surfaces (question 125)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(["/mcp", "/mcp/claude"] as const)("describes not_relevant_reason and its caveat on %s", async (surface) => {
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    const server = createAskRigorServer("standard", { mcpSurface: surface });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "community-skip-caveat-test", version: "1" });
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const tool = (await client.listTools()).tools.find(({ name }) => name === "finalize_research")!;
      const published = finalizeResearchPublishedInputSchema({ relaxed: surface === "/mcp" }) as {
        properties: Record<string, { description?: string; type?: string; maxLength?: number }>;
      };
      expect(tool.inputSchema).toEqual(published);
      const field = published.properties.not_relevant_reason!;
      expect(field.type).toBe("string");
      expect(field.description).toBe("Needed with not_relevant: why firsthand reports cannot matter, in plain words. " +
        `With no_real_world_outcome the answer states it in the caveat "${COMMUNITY_SKIP_CAVEAT_START} [reason]."`);
      // ChatGPT's relaxed schema drops the length the strict one keeps; the server validates it on both.
      expect(field.maxLength).toBe(surface === "/mcp" ? undefined : 1_000);
      expect(tool.description).toContain("whether community evidence was researched, or not relevant with its basis " +
        "and reason (not_relevant_basis, not_relevant_reason; with no_real_world_outcome, whether the question is " +
        "about a symptom or a test result, question_about, which then needs its community evidence researched, and " +
        `the answer states the reason in the caveat "${COMMUNITY_SKIP_CAVEAT_START} [reason]."), and whether the ` +
        "answer compares treatment options;");
      // Owner answer 149a: the skip says whether the question is about a symptom or a test result.
      expect(published.properties.question_about).toMatchObject({ enum: ["symptom_or_test_result", "other"] });
      const response = await client.callTool({ name: "finalize_research", arguments: { ...base(), receipts: [] } });
      expect(response.isError).not.toBe(true);
      expect(response.structuredContent).toMatchObject({ caveats: [SKIP], limits: expect.arrayContaining([LIMIT]) });
      const text = (response.content as Array<{ type: string; text?: string }>).map(({ text }) => text ?? "").join("\n");
      expect(text).toContain(`The answer must contain, as written: ${SKIP}`);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
