import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PUBLIC_RATE_LIMIT } from "../apps/research-mcp/src/config.js";
import { createTokenBucketLimiter } from "../apps/research-mcp/src/rate-limit.js";
import {
  FINALIZE_RESEARCH_SHAPES_DESCRIPTION,
  OPTION_CLASS_CAVEAT_STARTS,
  OPTION_CLASS_STATES,
  TOOL_LIST_REFRESH_HINT,
  finalizeResearch,
  finalizeResearchInputSchema,
  finalizeResearchPublishedInputSchema,
  optionClassCaveat,
  type FinalizeResearchInput,
  type FinalizeResearchOutput
} from "../apps/research-mcp/src/research-finalization-gate.js";
import {
  discoveryQueryDigest, issueResearchReceipt, researchTargetDigest, verifyResearchReceipt
} from "../apps/research-mcp/src/research-receipts.js";
import { createAskRigorHttpServer } from "../apps/research-mcp/src/server.js";

import { assertNextStepsContract } from "./helpers/finalize-next-steps-contract.js";

// Owner answer 153a, from the OCD comparison reports (AskRigor#354 to #357), with the approved HRP sentence: "The same
// inventory governs the study search and any comparison or ranking, in a first pass too: search each materially
// plausible class by name at least once, or say in the answer that it was not researched." An answer that compares
// treatment options lists each plausible class of treatment: researched, with the exact query of a literature search
// passed here and the answer's sentence on what it found; not researched; or out of reach. Which classes are plausible
// stays the model's declaration: no word list reads the classes or the answer. The figures and studies are synthetic
// gate fixtures, not evidence about a treatment.
const SECRET = "option-classes-test-secret-0123456789abcdefghij";
const DOI = "10.1000/ocd-trial";
const TARGET = "Treatment options for adults with OCD";
const QUERY = "inositol obsessive compulsive disorder";
const STUDY_LINE = `[Trial](https://doi.org/${DOI}) compared the medicine with placebo.`;
const SEARCHED = "A PubMed search for supplements found one small trial of inositol, with mixed results.";
const sign = (kind: Parameters<typeof issueResearchReceipt>[0], claims: Parameters<typeof issueResearchReceipt>[1],
  secret = SECRET) => issueResearchReceipt(kind, claims, { secret });
const audit = sign("study_audit", { id: DOI, status: "complete_no_unresolved_fields" });
const coverage = sign("treatment_coverage", {
  boundary: "ledger_consistent_for_synthesis", lock: "pass", broad: true, target: researchTargetDigest(TARGET)
});
const search = (src: "pubmed" | "europepmc" | "ctgov" = "pubmed", query = QUERY, secret = SECRET) =>
  sign("literature_search", { src, q: discoveryQueryDigest([query]), ret: 3, n: 3 }, secret);
type OptionClass = NonNullable<FinalizeResearchInput["option_classes"]>[number];
const supplements: OptionClass = {
  option_class: "supplements and botanicals", state: "researched", search_query: QUERY, answer_quote: SEARCHED
};
const notResearched: OptionClass = { option_class: "brain stimulation", state: "not_researched" };
const outOfReach: OptionClass = { option_class: "intensive residential programs", state: "inaccessible" };
const NOT_RESEARCHED = "This answer did not research brain stimulation.";
const OUT_OF_REACH = "This answer could not reach the research on intensive residential programs.";
const NOT_RESEARCHED_LIMIT = "A plausible class of treatment, brain stimulation, was not researched: say so in the " +
  "answer, as the caveat does.";
const OUT_OF_REACH_LIMIT = "The research on a plausible class of treatment, intensive residential programs, was out " +
  "of reach: say so in the answer, as the caveat does.";
const notApplicable = { status: "not_applicable" as const, reason: "Synthetic fixture isolates the option classes." };
const packageFor = (overrides: Partial<FinalizeResearchInput> = {}): FinalizeResearchInput => ({
  receipts: [audit, search(), coverage], research_target: TARGET, research_depth: "deep", treatment_choice: "compared",
  community_evidence: "not_relevant", not_relevant_basis: "emergency_before_triage",
  not_relevant_reason: "Synthetic fixture isolates the option classes.",
  lab_preparation: notApplicable, intervention_identity: notApplicable,
  full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates the option classes." },
  key_sources: [{ id: DOI, status: "validated", read_depth: "full_text_audited", answer_marker: "Trial" }],
  absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], key_terms: [],
  mechanism_claims: [], recommendations: [], safety_claims: [], safety_question: false,
  option_classes: [supplements], answer_draft: `${STUDY_LINE}\n\n${SEARCHED}`, ...overrides
});
const missing = (gap: "is missing" | "lists no class") => `option_classes ${gap}: the answer compares treatment ` +
  "options, so option_classes lists each materially plausible class of treatment and whether it was searched by " +
  "name: researched, with the exact search_query of a literature search passed here and the answer's sentence on what " +
  "it found as answer_quote; not_researched; or inaccessible, when its research was out of reach (at least one entry).";
const unsigned = (index: number, optionClass: string) => `option_classes[${index}].search_query is not the query of ` +
  `any literature search passed here: search ${optionClass} by name with search_pubmed, search_europe_pmc or ` +
  "search_clinical_trials, give that exact query, and pass its research_receipt, or declare it not_researched.";
const leftOut = (caveat: string) => "The answer leaves out this caveat; include each as its own sentence, as written " +
  "(a link's text may change), or, in an answer not in English, in the answer's language with the same links, given " +
  `in caveat_renderings: "${caveat}"`;
const NO_DRAFT = "Pass the answer you are about to give as answer_draft, exactly as the user will see it; the final " +
  "check reads it.";
const FIRST_PASS: Partial<FinalizeResearchInput> = {
  research_depth: "first_pass", another_pass_estimate: "about 20 minutes and 10 literature searches",
  open_leads: [
    { direction: "studies", topic: "Longer trials", why: "The trials read lasted twelve weeks." },
    { direction: "studies", topic: "Adding a second medicine", why: "Few trials tested it." }
  ]
};
const PROVISIONAL = "This comparison rests on a first pass through the evidence, so treat it as provisional; it does " +
  "not rank the options.";

describe("optionClassCaveat", () => {
  it("completes the server's sentence with the class as declared, on one line, with one closing mark", () => {
    expect(optionClassCaveat("not_researched", "brain stimulation")).toBe(NOT_RESEARCHED);
    expect(optionClassCaveat("inaccessible", "  intensive residential\n   programs. ")).toBe(OUT_OF_REACH);
    expect(optionClassCaveat("not_researched", "脳刺激療法。")).toBe(`${OPTION_CLASS_CAVEAT_STARTS.not_researched} 脳刺激療法。`);
    expect(OPTION_CLASS_STATES).toEqual(["researched", "not_researched", "inaccessible"]);
  });
});

describe.each(["gate", "MCP endpoint"] as const)("finalize_research option_classes through the %s", (surface) => {
  let server: Server | undefined;
  let client: Client | undefined;
  beforeAll(async () => {
    if (surface === "gate") return;
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    vi.stubEnv("ASKRIGOR_FINDINGS_LIBRARY", "false");
    // These tests call the endpoint more often than the public 60-a-minute limit allows one address.
    server = createAskRigorHttpServer({
      publicServerEnabled: true, actionsEnabled: false, researchActionsEnabled: false,
      privateOrchestrationEnabled: false,
      rateLimiter: createTokenBucketLimiter({ ...PUBLIC_RATE_LIMIT, capacity: 1_000 })
    });
    await new Promise<void>((resolve, reject) => {
      server!.once("error", reject);
      server!.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address() as AddressInfo;
    client = new Client({ name: "option-classes-test", version: "0.1.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
  });
  afterAll(async () => {
    await client?.close();
    if (server !== undefined) await new Promise<void>((resolve, reject) => {
      server!.close((error) => error ? reject(error) : resolve());
    });
    vi.unstubAllEnvs();
  });
  const call = async (overrides: Partial<FinalizeResearchInput> = {}): Promise<FinalizeResearchOutput> => {
    const input = packageFor(overrides);
    if (surface === "gate") return assertNextStepsContract(finalizeResearch(input, { secret: SECRET }));
    const result = await client!.callTool({ name: "finalize_research", arguments: { ...input } });
    expect(result.isError).not.toBe(true);
    return assertNextStepsContract(result.structuredContent as FinalizeResearchOutput);
  };
  // A draft that states each caveat the first call returned, as the answer would.
  const checked = async (overrides: Partial<FinalizeResearchInput> = {}): Promise<FinalizeResearchOutput> => {
    const first = await call(overrides);
    const draft = packageFor(overrides).answer_draft;
    return call({ ...overrides, answer_draft: `${draft}\n\n${first.caveats.join(" ")}` });
  };
  const steps = async (overrides: Partial<FinalizeResearchInput> = {}) =>
    (await call(overrides)).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT);

  it("passes a comparison whose plausible classes were each searched by name, with no caveat or limit", async () => {
    const result = await call();
    expect(result).toMatchObject({ status: "ready", next_steps: [], caveats: [], limits: [] });
    expect(verifyResearchReceipt(result.finalization_receipt!, { secret: SECRET })).toMatchObject({
      ok: true, kind: "finalization", claims: { status: "ready" }
    });
  });

  describe("when it is required", () => {
    it("asks for it with an answer comparing treatment options, with the connector-refresh hint", async () => {
      const result = await call({ option_classes: undefined });
      expect(result).toMatchObject({ status: "not_ready", next_steps: [missing("is missing"), TOOL_LIST_REFRESH_HINT],
        next_step_kinds: ["declaration", "tool_list"] });
      expect(result.finalization_receipt).toBeUndefined();
    });

    it("needs at least one class: an empty list is named, without the refresh hint", async () => {
      expect(await call({ option_classes: [] })).toMatchObject({
        status: "not_ready", next_steps: [missing("lists no class")], next_step_kinds: ["declaration"]
      });
    });

    it("asks for it in a first pass too, whose comparison is also provisional", async () => {
      const result = await call({ ...FIRST_PASS, option_classes: undefined });
      expect(result.next_steps).toContain(missing("is missing"));
      expect(result.caveats).toContain(PROVISIONAL);
      const passed = await checked({ ...FIRST_PASS });
      expect(passed).toMatchObject({ status: "ready_with_limits", next_steps: [] });
      expect(passed.caveats).toContain(PROVISIONAL);
      // A class a first pass did not research is said in the answer, as in deep research.
      const unresearched = await checked({ ...FIRST_PASS, option_classes: [supplements, notResearched] });
      expect(unresearched).toMatchObject({ status: "ready_with_limits", next_steps: [] });
      expect(unresearched.caveats).toEqual(expect.arrayContaining([PROVISIONAL, NOT_RESEARCHED]));
    });

    it("is not required when the answer does not compare treatments, nor before an answer draft", async () => {
      for (const option_classes of [undefined, []]) {
        expect(await call({ treatment_choice: "not_compared", option_classes })).toMatchObject({
          status: "ready", next_steps: []
        });
      }
      expect(await steps({ option_classes: undefined, answer_draft: undefined })).toEqual([NO_DRAFT]);
      expect(await steps({ option_classes: [], answer_draft: undefined })).toEqual([NO_DRAFT]);
    });

    it("still checks classes given when they are not required", async () => {
      const given = await call({ treatment_choice: "not_compared", option_classes: [notResearched] });
      expect(given).toMatchObject({ status: "not_ready", next_steps: [leftOut(NOT_RESEARCHED)], caveats: [NOT_RESEARCHED],
        limits: [NOT_RESEARCHED_LIMIT] });
    });
  });

  describe("a class researched rests on a literature search passed here", () => {
    it("needs its query, as a declaration", async () => {
      const result = await call({ option_classes: [{ ...supplements, search_query: undefined }] });
      expect(result.next_steps).toEqual(["option_classes[0] is researched without search_query: give the exact query " +
        "supplements and botanicals was searched by name with, and pass that search's research_receipt, or declare it " +
        "not_researched."]);
      expect(result.next_step_kinds).toEqual(["declaration"]);
    });

    it("sends back a query no literature search passed here signed, as research still to do", async () => {
      const result = await call({ option_classes: [{ ...supplements, search_query: "inositol anxiety" }] });
      expect(result).toMatchObject({ status: "not_ready", next_steps: [unsigned(0, "supplements and botanicals")],
        next_step_kinds: ["research"] });
      // No literature search at all: the same step.
      expect(await steps({ receipts: [audit, coverage] })).toEqual([unsigned(0, "supplements and botanicals")]);
    });

    it("compares the query as search receipts sign it: case and spacing aside, nothing else", async () => {
      expect((await call({ option_classes: [{ ...supplements, search_query: "  Inositol\n OBSESSIVE compulsive   disorder " }] }))
        .status).toBe("ready");
      expect(await steps({ option_classes: [{ ...supplements, search_query: "inositol obsessive-compulsive disorder" }] }))
        .toEqual([unsigned(0, "supplements and botanicals")]);
    });

    it("counts a Europe PMC or ClinicalTrials.gov search too", async () => {
      for (const src of ["europepmc", "ctgov"] as const) {
        expect((await call({ receipts: [audit, search(src), coverage] })).status, src).toBe("ready");
      }
    });

    it("never counts a receipt that does not verify, or a search of another kind", async () => {
      const forged = await call({ receipts: [audit, search("pubmed", QUERY, "another-server-secret-0123456789abcdefghijkl"), coverage] });
      expect(forged.receipts_rejected).toEqual([{ index: 1, reason: "signature_invalid" }]);
      expect(forged.next_steps).toContain(unsigned(0, "supplements and botanicals"));
      const youtube = sign("youtube_search", { q: discoveryQueryDigest([QUERY]), videos: [], target: researchTargetDigest(TARGET) });
      expect(await steps({ receipts: [audit, youtube, coverage] })).toContain(unsigned(0, "supplements and botanicals"));
    });
  });

  describe("a class researched is reported in the answer", () => {
    it("needs the answer's sentence on what its search found, as a step on the answer", async () => {
      const result = await call({ option_classes: [{ ...supplements, answer_quote: undefined }] });
      expect(result.next_steps).toEqual(["option_classes[0] is researched without answer_quote: say in the answer what " +
        "the search for supplements and botanicals found, and copy that sentence from answer_draft."]);
      expect(result.next_step_kinds).toEqual(["answer_draft"]);
    });

    it("accepts the sentence copied from the answer in any language", async () => {
      for (const quote of [
        "Une recherche PubMed sur les compléments n'a trouvé qu'un petit essai de l'inositol, aux résultats mitigés.",
        "サプリメントをPubMedで検索したところ、イノシトールの小規模な試験が1件だけ見つかり、結果は一定しませんでした。"
      ]) {
        expect((await call({ option_classes: [{ ...supplements, answer_quote: quote }],
          answer_draft: `${STUDY_LINE}\n\n${quote}` })).status, quote).toBe("ready");
      }
      // Compared as other quotes are: its closing mark, quotation marks, emphasis, spacing and case aside.
      expect((await call({ option_classes: [{ ...supplements, answer_quote: `"${SEARCHED.slice(0, -1).toUpperCase()}"` }],
        answer_draft: `${STUDY_LINE}\n\n**A PubMed search** for supplements found one small trial of inositol, with mixed results.` }))
        .status).toBe("ready");
    });

    it("refuses a sentence the answer does not show, or shows only outside its prose", async () => {
      for (const draft of [STUDY_LINE, `${STUDY_LINE}\n\n\`\`\`\n${SEARCHED}\n\`\`\``, `${STUDY_LINE}\n\n> ${SEARCHED}`,
        `${STUDY_LINE}\n\n<!-- ${SEARCHED} -->`]) {
        const result = await call({ answer_draft: draft });
        expect(result.next_steps, draft).toEqual(["option_classes[0].answer_quote gives text the answer does not show: " +
          "copy each sentence exactly from answer_draft."]);
        expect(result.next_step_kinds).toEqual(["answer_draft"]);
      }
    });

    it("does not use another state's field", async () => {
      // A class not researched has no search to check and no sentence to show: only its caveat applies.
      const result = await call({ option_classes: [supplements,
        { ...notResearched, search_query: "a query no receipt has", answer_quote: "A sentence the answer does not show." }] });
      expect(result).toMatchObject({ next_steps: [leftOut(NOT_RESEARCHED)], caveats: [NOT_RESEARCHED] });
    });
  });

  describe("a class not researched, or out of reach, reaches the answer", () => {
    it("adds the server's sentence for a class not researched, with its limit", async () => {
      const result = await call({ option_classes: [supplements, notResearched] });
      expect(result).toMatchObject({ status: "not_ready", next_steps: [leftOut(NOT_RESEARCHED)],
        next_step_kinds: ["answer_draft"], caveats: [NOT_RESEARCHED], limits: [NOT_RESEARCHED_LIMIT] });
      expect(await call({ option_classes: [supplements, notResearched],
        answer_draft: `${STUDY_LINE}\n\n${SEARCHED} ${NOT_RESEARCHED}` }))
        .toMatchObject({ status: "ready_with_limits", next_steps: [], caveats: [NOT_RESEARCHED] });
    });

    it("adds the server's sentence for a class out of reach, with its limit", async () => {
      const result = await call({ option_classes: [supplements, outOfReach] });
      expect(result).toMatchObject({ status: "not_ready", next_steps: [leftOut(OUT_OF_REACH)], caveats: [OUT_OF_REACH],
        limits: [OUT_OF_REACH_LIMIT] });
      const both = await call({ option_classes: [notResearched, supplements, outOfReach],
        answer_draft: `${STUDY_LINE}\n\n${SEARCHED}\n\n${NOT_RESEARCHED} ${OUT_OF_REACH}` });
      expect(both).toMatchObject({ status: "ready_with_limits", next_steps: [], caveats: [NOT_RESEARCHED, OUT_OF_REACH],
        limits: [NOT_RESEARCHED_LIMIT, OUT_OF_REACH_LIMIT] });
    });

    it("checks each as the other caveats are: its own sentence in prose a reader sees", async () => {
      const classes = { option_classes: [supplements, notResearched] };
      for (const draft of [
        `${STUDY_LINE}\n\n${SEARCHED}\n\n- **${NOT_RESEARCHED.slice(0, 20)}**${NOT_RESEARCHED.slice(20).toUpperCase()}`,
        `${STUDY_LINE}\n\n${SEARCHED} One more thing. ${NOT_RESEARCHED} Ask if you want it researched.`
      ]) expect((await call({ ...classes, answer_draft: draft })).status, draft).toBe("ready_with_limits");
      for (const draft of [
        `${STUDY_LINE}\n\n${SEARCHED}\n\nIt is false that ${NOT_RESEARCHED.charAt(0).toLowerCase()}${NOT_RESEARCHED.slice(1)}`,
        `${STUDY_LINE}\n\n${SEARCHED}\n\n${NOT_RESEARCHED.slice(0, -1)} or anything else, which is fine.`,
        `${STUDY_LINE}\n\n${SEARCHED}\n\n\`\`\`\n${NOT_RESEARCHED}\n\`\`\``,
        `${STUDY_LINE}\n\n${SEARCHED}\n\n> ${NOT_RESEARCHED}`,
        `${STUDY_LINE}\n\n${SEARCHED}\n\n${OPTION_CLASS_CAVEAT_STARTS.not_researched} every option.`
      ]) expect(await steps({ ...classes, answer_draft: draft }), draft).toEqual([leftOut(NOT_RESEARCHED)]);
    });

    it("accepts it in the answer's language through caveat_renderings, checked by place and not by words", async () => {
      const french = "Cette réponse n'a pas étudié la stimulation cérébrale.";
      const classes = { option_classes: [supplements, notResearched] };
      expect((await call({ ...classes, answer_language: "fr", caveat_renderings: [{ caveat: NOT_RESEARCHED, text: french }],
        answer_draft: `${STUDY_LINE}\n\n${SEARCHED}\n\n${french}` })).status).toBe("ready_with_limits");
      // The class may be declared in the answer's language: the server's words stay English, rendered with it.
      const declared = "la stimulation cérébrale";
      expect(await call({ option_classes: [supplements, { option_class: declared, state: "not_researched" }],
        answer_language: "fr", caveat_renderings: [{ caveat: optionClassCaveat("not_researched", declared), text: french }],
        answer_draft: `${STUDY_LINE}\n\n${SEARCHED}\n\n${french}` }))
        .toMatchObject({ status: "ready_with_limits", caveats: [`${OPTION_CLASS_CAVEAT_STARTS.not_researched} ${declared}.`] });
    });

    it("gives each class one entry, compared as harm names are, with one caveat", async () => {
      const twice = await call({ option_classes: [supplements, notResearched, { option_class: "Brain  Stimulation.", state: "inaccessible" }],
        answer_draft: `${STUDY_LINE}\n\n${SEARCHED} ${NOT_RESEARCHED}` });
      expect(twice).toMatchObject({ next_steps: ["option_classes[2] names the same class as option_classes[1]: give each " +
        "class one entry."], next_step_kinds: ["declaration"], caveats: [NOT_RESEARCHED] });
      // A class researched and declared not researched as well is one class too.
      expect(await steps({ option_classes: [supplements, { option_class: "Supplements and botanicals", state: "not_researched" }] }))
        .toEqual(["option_classes[1] names the same class as option_classes[0]: give each class one entry."]);
    });

    it("asks for the class in plain words when its caveat would show internal labels", async () => {
      const labelled = "brain_stimulation";
      expect(await steps({ option_classes: [supplements, { option_class: labelled, state: "not_researched" }],
        answer_draft: `${STUDY_LINE}\n\n${SEARCHED} ${optionClassCaveat("not_researched", labelled)}` })).toEqual([
        "option_classes[1].option_class shows internal labels (brain_stimulation): the answer names this class in its " +
          "caveat, so give it in plain words."
      ]);
      if (surface === "gate") {
        const named = "DeepBrainProtocol devices";
        const result = assertNextStepsContract(finalizeResearch(packageFor({
          option_classes: [supplements, { option_class: named, state: "inaccessible" }],
          answer_draft: `${STUDY_LINE}\n\n${SEARCHED} ${optionClassCaveat("inaccessible", named)}`
        }), { secret: SECRET, protocolNames: new Set(["DeepBrainProtocol"]) }));
        // The answer stating the caveat shows the name too, which the answer's own check names as well.
        expect(result.next_steps).toContain("option_classes[1].option_class shows internal labels (DeepBrainProtocol): " +
          "the answer names this class in its caveat, so give it in plain words.");
      }
      // A class researched reaches no caveat, so its name is not checked for labels.
      expect((await call({ option_classes: [{ ...supplements, option_class: "supplements_and_botanicals" }] })).status)
        .toBe("ready");
    });
  });

  it("keeps the classes and queries out of the finalization receipt and the carried state", async () => {
    const result = await call({ option_classes: [supplements, notResearched],
      answer_draft: `${STUDY_LINE}\n\n${SEARCHED} ${NOT_RESEARCHED}` });
    expect(result.status).toBe("ready_with_limits");
    const receipt = verifyResearchReceipt(result.finalization_receipt!, { secret: SECRET });
    expect(receipt.ok).toBe(true);
    for (const declared of ["supplements", "botanicals", "inositol", "stimulation", QUERY]) {
      expect(JSON.stringify(receipt)).not.toContain(declared);
      expect(JSON.stringify(result.carried ?? {})).not.toContain(declared);
      expect(result.carry_forward ?? "").not.toContain(declared);
    }
    // Only a class not researched or out of reach comes back, in its caveat and limit for this call; the query never does.
    const output = JSON.stringify({ ...result, caveats: [], limits: [] });
    for (const declared of ["supplements", "inositol", "stimulation"]) expect(output).not.toContain(declared);
  });

  it.each([
    { state: "partly" }, { option_class: "" }, { option_class: "o".repeat(121) }, { search_query: "q".repeat(501) },
    { answer_quote: "a".repeat(1_001) }, { extra: "unexpected" }
  ])("rejects a malformed entry (%j) with every problem named and the check not run", async (invalid) => {
    const input = { ...packageFor(), option_classes: [{ ...supplements, ...invalid }] };
    expect(finalizeResearchInputSchema.safeParse(input).success).toBe(false);
    const result = surface === "gate"
      ? finalizeResearch(input, { secret: SECRET })
      : (await client!.callTool({ name: "finalize_research", arguments: input })).structuredContent as FinalizeResearchOutput;
    expect(result).toMatchObject({ status: "not_ready", answer_checked: false, receipts_verified: 0 });
    expect(result.next_steps.join("\n")).toContain("option_classes[0]");
    expect(new Set(result.next_step_kinds)).toEqual(new Set(["input_invalid"]));
  });

  it("bounds the list at 20 entries and each class at 120 characters", async () => {
    const twenty = Array.from({ length: 20 }, (_, index): OptionClass =>
      ({ option_class: `class ${index} ${"c".repeat(110)}`, state: "not_researched" }));
    const atLimit = await call({ option_classes: twenty });
    expect(atLimit.answer_checked).toBe(true);
    expect(atLimit.caveats).toHaveLength(20);
    const over = await call({ option_classes: [...twenty, notResearched] });
    expect(over).toMatchObject({ status: "not_ready", answer_checked: false });
    expect(over.next_steps).toContain("option_classes: Too big: expected array to have <=20 items");
  });

  if (surface === "MCP endpoint") it("publishes option_classes flat, with its catalog text", async () => {
    const { tools } = await client!.listTools();
    expect(tools).toHaveLength(33);
    const tool = tools.find(({ name }) => name === "finalize_research")!;
    expect(tool.description).toContain("and whether the answer compares treatment options; with a comparison, each " +
      "plausible class of treatment, researched by name, not researched or out of reach (option_classes);");
    // Primitives only, so ChatGPT's app shows the model each field: nothing of it needs JSON in the description.
    type Node = { type?: string; description?: string; enum?: string[]; items?: Node; properties?: Record<string, Node> };
    for (const relaxed of [true, false]) {
      const published = finalizeResearchPublishedInputSchema({ relaxed }) as { properties: Record<string, Node> };
      const classes = published.properties.option_classes!;
      expect(classes.type).toBe("array");
      expect(classes.description).toContain("when treatment_choice is compared, in a first pass too");
      expect(classes.description).toContain(`a class not_researched adds the caveat "${OPTION_CLASS_CAVEAT_STARTS.not_researched} [class]."`);
      const fields = classes.items!.properties!;
      expect(Object.keys(fields)).toEqual(["option_class", "state", "search_query", "answer_quote"]);
      for (const field of Object.values(fields)) expect(field.type).toBe("string");
      expect(fields.state!.enum).toEqual([...OPTION_CLASS_STATES]);
    }
    expect(FINALIZE_RESEARCH_SHAPES_DESCRIPTION).not.toContain("option_classes");
  });
});
