import { getProtocolManifest, loadProtocol } from "@askrigor/protocol";
import {
  InMemoryResearchContributorAccessStore,
  InMemoryResearchDossierStore,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
} from "@askrigor/evidence-repository";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";

import { MCP_RESULT_MAX_BYTES, SERVER_INSTRUCTIONS } from "../apps/research-mcp/src/config.js";
import { RESEARCH_DOSSIER_CARD_SENTENCE } from "../apps/research-mcp/src/findings/dossier-disposition.js";
import {
  RESEARCH_DOSSIER_GUARDS,
  RESEARCH_DOSSIER_REMINDER,
  RESEARCH_DOSSIER_REQUEST,
  RESEARCH_DOSSIER_SHAPE,
  researchDossierAllowed,
  saveResearchDossier,
} from "../apps/research-mcp/src/findings/dossier.js";
import { withLaterInputs } from "../apps/research-mcp/src/later-inputs.js";
import { registerTools, type RegisterToolsOptions } from "../apps/research-mcp/src/register-tools.js";
import {
  createManageResearchAccessHandler,
  manageResearchAccessInputSchema,
} from "../apps/research-mcp/src/research-contributor-access-tool.js";
import { issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { PLAN_LIMITS } from "../apps/research-mcp/src/research-steering.js";
import { clientResultBytes } from "../apps/research-mcp/src/tool-result.js";
import { withSourceReading } from "./helpers/source-reading.js";

// AskRigor#477 stage 1, Codex's finding 9 and its red team of the instruction proposal (16 Nov 2026): the dossier is
// asked for before the first final check, with one rule for every ask, and HRP says so in the wording Codex corrected.
// What was left out, and why, is in /home/joel/askrigor-releases/20261116-477/instruction-disagreements.md.

const SECRET = "research-dossier-instructions-secret-0123456789";
const SUBJECT = "auth0|dossier-instructions";
const AGREEMENT = {
  noticeVersion: RESEARCH_USE_NOTICE_VERSION, eligibleDeidentifiedResearchContributionRequired: true,
  prohibitedPrivateAndRawContentExcluded: true, proposalReviewAndNoAuthorityAcknowledged: true,
  paidPrivateAlternativeAcknowledged: true,
} as const;
const auth = {
  authInfo: { token: "synthetic-token", clientId: "synthetic-client", scopes: ["research:use"],
    expiresAt: Math.floor(Date.now() / 1_000) + 300, extra: { subject: SUBJECT } },
};
const texts = (result: CallToolResult) => result.content.flatMap((block) => block.type === "text" ? [block.text] : []);
const ASK = `${RESEARCH_DOSSIER_REQUEST} ${RESEARCH_DOSSIER_SHAPE} ${RESEARCH_DOSSIER_GUARDS}`;

async function account(kind: "free" | "paid" | "saving_off" = "free") {
  const store = new InMemoryResearchContributorAccessStore();
  const service = new ResearchContributorAccessService({ store, identitySecret: Buffer.alloc(32, 23) });
  if (kind === "paid") {
    store.grantPrivateEntitlement({
      entitlementId: "77777777-7777-4777-a777-777777777777", accountKey: service.accountKeyForSubject(SUBJECT),
      status: "ACTIVE", source: "OWNER_GRANTED", externalReferenceSha256: null,
      grantedAt: "2026-11-01T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z", revokedAt: null,
    });
    await service.activatePaidPrivate(SUBJECT);
  } else {
    await service.acceptFreeContributor(SUBJECT, AGREEMENT);
    if (kind === "saving_off") await service.setFindingsSave(SUBJECT, false);
  }
  return service;
}

describe("HRP 20.6.43: the private research dossier in DeepResearchTimeSavingAtlasPreservation", () => {
  it("says, as Codex corrected it, to include a requested dossier with the first final check, card or no card", async () => {
    const hrp = await loadProtocol("hrp");
    const rule = /<Rule name="DeepResearchTimeSavingAtlasPreservation" priority="Critical">([\s\S]*?)<\/Rule>/u.exec(hrp)?.[1];
    const flat = (rule ?? "").replace(/\s+/gu, " ");
    expect(flat).toContain("Separately, when AskRigor requests a private research dossier and saving remains allowed, " +
      "include it with the first final check if the completed work saves a later reader substantial effort, whether " +
      "or not a card qualifies. Saving this dossier does not publish it.");
    expect(flat).toContain("A limited five-finding card is not the entire research record: where AskRigor asks for a " +
      "research dossier, the dossier holds the rest; otherwise, or for what its shape cannot hold, mark the dossier " +
      "partial and file an actionable continuation until an authorized repository can store it.");
    // Left as it was (instruction-disagreements.md): the card's own sentence keeps "during this turn".
    expect(flat).toContain("preserve eligible work during this turn through a source-verified findings_card plus, " +
      "when supported, the structured research map.");
    expect(hrp).toContain('<Revision version="20.6.43" priority="Critical">');
    await expect(getProtocolManifest("hrp")).resolves.toMatchObject({ version: "20.6.43", revisionDate: "2026-11-16" });
  });

  it("leaves the server instructions within their cap, unchanged", () => {
    expect(Buffer.byteLength(SERVER_INSTRUCTIONS)).toBeLessThanOrEqual(2_048);
    expect(SERVER_INSTRUCTIONS).not.toMatch(/dossier/iu);
  });
});

describe("one rule for every ask of a dossier (Codex's red team, item 3)", () => {
  it("asks only for a free contributor whose yes covers notice v6, with saving on, in a call not marked off", () => {
    const free = { mode: "FREE_CONTRIBUTOR" as const, findingsSave: true, noticeVersion: RESEARCH_USE_NOTICE_VERSION };
    expect(researchDossierAllowed(true, free)).toBe(true);
    expect(researchDossierAllowed(false, free)).toBe(false);
    expect(researchDossierAllowed(true, undefined)).toBe(false);
    expect(researchDossierAllowed(true, { ...free, mode: "PAID_PRIVATE" })).toBe(false);
    expect(researchDossierAllowed(true, { ...free, noticeVersion: "free-contributor-v5-2026-11-05" })).toBe(false);
    expect(researchDossierAllowed(true, { ...free, findingsSave: false })).toBe(false);
    expect(researchDossierAllowed(true, free, true)).toBe(false);
  });
});

describe("plan_research asks for the dossier before the first final check (Codex's red team, item 1)", () => {
  const GOES_ON = { research_target: "Does magnesium ease night cramps in adults?", steering_could_help: false,
    tasks: [{ task: "Search trials of magnesium for night cramps", kind: "study_search", could_change: "confidence" }] };
  async function plan(menu: Record<string, unknown>, options: { dossiers?: boolean; kind?: "free" | "paid" | "saving_off" } = {}) {
    const service = await account(options.kind);
    const handler = createManageResearchAccessHandler({ service, ...(options.dossiers === false ? {} : { researchDossiers: true }) });
    const { execute } = withLaterInputs("manage_research_access", manageResearchAccessInputSchema, handler);
    return execute({ action: "plan_research", later_inputs: { researchMenu: menu } }, auth);
  }

  it("gives the instruction, the shape and the guards after the plan's own texts, and in a runtime field, never next_step", async () => {
    const result = await plan(GOES_ON);
    expect(result.isError).not.toBe(true);
    const structured = result.structuredContent as Record<string, any>;
    expect(structured.researchMenu.next).toBe("go_on");
    expect(texts(result).at(-1)).toBe(ASK);
    expect(structured.research_dossier_request).toEqual({ instruction: RESEARCH_DOSSIER_REQUEST,
      shape: RESEARCH_DOSSIER_SHAPE, guards: RESEARCH_DOSSIER_GUARDS });
    expect(structured.next_step).not.toMatch(/dossier/iu);
    // Codex's corrected words: the first final check, no filler, no permission question, no personal research.
    expect(RESEARCH_DOSSIER_REQUEST).toContain("before the first final check");
    expect(RESEARCH_DOSSIER_REQUEST).toContain("Do not ask the person for permission to save it.");
    expect(RESEARCH_DOSSIER_REQUEST).toContain("If this research is personal to the conversation, send no dossier.");
    expect(RESEARCH_DOSSIER_GUARDS).toContain("After a privacy or YouTube refusal, leave the dossier unsaved");
  });

  it("asks nothing without the store, for a paid or saving-off account, before the person answers, or for a light look-up", async () => {
    const quiet = async (result: Promise<CallToolResult>) => {
      const done = await result;
      expect(done.isError).not.toBe(true);
      expect(texts(done).join("\n")).not.toContain(RESEARCH_DOSSIER_REQUEST);
      expect(done.structuredContent).not.toHaveProperty("research_dossier_request");
      return done;
    };
    await quiet(plan(GOES_ON, { dossiers: false }));
    await quiet(plan(GOES_ON, { kind: "paid" }));
    await quiet(plan(GOES_ON, { kind: "saving_off" }));
    const asks = await quiet(plan({ ...GOES_ON, steering_could_help: true, tasks: [
      { task: "Read the 2018 cohort's full text", kind: "full_text", could_change: "conclusion" },
      { task: "Search trials of potassium-enriched salt", kind: "study_search", sources: 2, could_change: "confidence" },
      { task: "Read the two longest forum threads", kind: "forum_thread", sources: 2, could_change: "detail" },
    ] }));
    expect((asks.structuredContent as Record<string, any>).researchMenu.next).toBe("ask");
    const light = await quiet(plan({ ...GOES_ON, lane: "light" }));
    expect((light.structuredContent as Record<string, any>).researchMenu.lane).toBe("light");
  });

  it("fits a client's result with the largest menu the schema allows (Codex's red team, size)", async () => {
    const tasks = Array.from({ length: PLAN_LIMITS.tasks }, (_, index) => ({
      task: `Search trials ${index} `.padEnd(PLAN_LIMITS.task, "x"), kind: "study_search", could_change: "confidence",
      sources: PLAN_LIMITS.sources, minutes: [PLAN_LIMITS.minutes, PLAN_LIMITS.minutes] }));
    const result = await plan({ research_target: "x".repeat(5_000), tasks, provisional_answer: "y".repeat(PLAN_LIMITS.provisional),
      steering_choice: "none", person_answered: true,
      allocation: tasks.map((_, index) => ({ task: index + 1, minutes: PLAN_LIMITS.minutes })) });
    expect(result.isError).not.toBe(true);
    expect((result.structuredContent as Record<string, any>).research_dossier_request).toBeDefined();
    expect(clientResultBytes(result)).toBeLessThanOrEqual(MCP_RESULT_MAX_BYTES);
  });
});

describe("finalize_research's dossier asks (Codex's red team, items 2 and 3)", () => {
  afterEach(() => {
    delete process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET;
  });

  function finalizeTool(options: RegisterToolsOptions) {
    let handler: ((input: unknown, extra?: unknown) => Promise<CallToolResult>) | undefined;
    registerTools({
      registerTool: (registered: string, _config: unknown, execute: typeof handler) => {
        if (registered === "finalize_research") handler = execute;
      },
    } as unknown as McpServer, { researchAccessRequired: true, mcpSurface: "/mcp/claude", ...options });
    return async (input: Record<string, unknown>) => handler!(withSourceReading(input), auth);
  }
  // After research that validated a source and was no short look-up, with the findings library on and no card: the
  // check passes with the card guidance among its notes; with a second source no receipt shows, it is not ready.
  const call = (laterInputs: Record<string, unknown> = {}, ready = true) => ({
    lab_preparation: { status: "not_applicable", reason: "Synthetic fixture interprets no lab result and plans no test." },
    full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates the dossier asks." },
    receipts: [issueResearchReceipt("study_audit", { id: "PMC10518852", doi: "10.1002/art.41142",
      status: "complete_no_unresolved_fields" }, { secret: SECRET })],
    community_evidence: "researched",
    commercial_review_applicability: { status: "not_applicable", reason: "Nothing here is bought." },
    treatment_choice: "not_compared",
    research_target: "How quickly does the body clear this drug in adults",
    research_depth: "deep",
    intervention_identity: { status: "not_applicable", reason: "No coded product." },
    key_sources: [{ read_depth: "partial_text", answer_marker: "Study", id: "PMC10518852", status: "validated" },
      ...(ready ? [] : [{ read_depth: "partial_text", answer_marker: "Other", id: "PMC99999999", status: "validated" }])],
    absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [],
    safety_claims: [], safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [],
    answer_draft: "The liver clears this drug within a few hours.\n\n[Study](https://pmc.ncbi.nlm.nih.gov/articles/PMC10518852/)" +
      (ready ? "" : " [Other](https://pmc.ncbi.nlm.nih.gov/articles/PMC99999999/)"),
    ...(Object.keys(laterInputs).length === 0 ? {} : { later_inputs: laterInputs }),
  });
  const run = async (options: { dossiers?: boolean; kind?: "free" | "paid" | "saving_off" } = {}, laterInputs = {},
    ready = true) => {
    process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET = SECRET;
    const finalize = finalizeTool({ researchContributorAccessService: await account(options.kind), findingsLibrary: true,
      ...(options.dossiers === false ? {} : { researchDossiers: new InMemoryResearchDossierStore() }) });
    const result = await finalize(call(laterInputs, ready));
    const structured = result.structuredContent as Record<string, any>;
    return { structured, notes: (structured.notes ?? []) as string[] };
  };

  it("says the dossier's own value test beside the card guidance, and reminds a check that is not ready yet", async () => {
    const passing = await run();
    expect(passing.structured.status).toBe("ready");
    expect(passing.notes.some((note) => note.includes(`send no card. ${RESEARCH_DOSSIER_CARD_SENTENCE}`))).toBe(true);
    expect(passing.structured.research_dossier).toEqual({ status: "not_sent" });
    const notReady = await run({}, {}, false);
    expect(notReady.structured.status).toBe("not_ready");
    expect(notReady.notes).toContain(`Research dossier: ${RESEARCH_DOSSIER_REMINDER}`);
    expect(notReady.structured.research_dossier).toBeUndefined();
    expect(RESEARCH_DOSSIER_REMINDER).toContain("Do not make another check solely to add or repair it.");
  });

  it("asks nothing without the store, for a paid or saving-off account, or in a call marked findings_save off", async () => {
    for (const [options, laterInputs] of [[{ dossiers: false }, {}], [{ kind: "paid" }, {}], [{ kind: "saving_off" }, {}],
      [{}, { findings_save: "off" }]] as const) {
      for (const ready of [true, false]) {
        const { structured, notes } = await run(options, laterInputs, ready);
        const label = JSON.stringify({ options, laterInputs, ready });
        expect(notes.some((note) => note.startsWith("Research dossier") || note.includes(RESEARCH_DOSSIER_CARD_SENTENCE)),
          label).toBe(false);
        expect(structured.research_dossier === undefined || structured.research_dossier.status === "consent_blocked" ||
          structured.research_dossier.status === "private", label).toBe(true);
      }
    }
  });
});

describe("the save's own notes (Codex's red team, item 2)", () => {
  const request = {
    account: { mode: "FREE_CONTRIBUTOR" as const, accountKey: "a".repeat(64), findingsSave: true,
      noticeVersion: RESEARCH_USE_NOTICE_VERSION },
    callSavingOff: false, shortLookup: false, validatedSources: 2, receipts: [], atlasReuse: [], cardId: undefined,
    commentsRead: false, secret: SECRET, versions: { askrigor: "0.1.0", build: "0123abc" },
  };
  const passed = () => issueResearchReceipt("finalization", { status: "ready", target: "t".repeat(12),
    answer: "b".repeat(64) }, { secret: SECRET });

  it("opens the not-sent note without claiming the research saved work, and asks for no extra check", async () => {
    const outcome = await saveResearchDossier(new InMemoryResearchDossierStore(), { ...request,
      dossier: { given: false }, finalizationReceipt: passed() });
    expect(outcome?.disposition).toEqual({ status: "not_sent" });
    expect(outcome?.note).toBe("Research dossier: No research dossier was sent, so none was saved. This does not " +
      `establish whether the research would save a later reader substantial work. ${RESEARCH_DOSSIER_REMINDER}`);
  });

  it("makes a privacy or YouTube refusal final, and asks for any other correction only at a check already needed", async () => {
    const personal = await saveResearchDossier(new InMemoryResearchDossierStore(), { ...request,
      finalizationReceipt: passed(), dossier: { given: true, value: {
        scope: "public", value: { saves_work: "substantial" }, question: "Is it safe for me to take magnesium?",
        topic: { key: "magnesium", name: "Magnesium" },
        studies: [{ id: "s1", identifiers: ["PMID 12121212"], kind: "human_trial", decision: "used" }],
        findings: [{ id: "f1", claim: "No trial was read here.", certainty: "low", kind: "not_known", applies_to: "Adults",
          rests_on: ["s1"], what_would_change_it: "A trial", importance: "context" }],
        coverage: Object.fromEntries(["benefits", "harms", "null_results", "conflicts", "mainstream_options",
          "people_reports"].map((area) => [area, { status: "not_researched", reason: "Not asked." }])),
      } } });
    expect(personal?.note).toContain("A privacy or YouTube refusal is final for this research: leave the dossier " +
      "unsaved, and do not rewrite it to get past the screen.");
    const shapeOnly = await saveResearchDossier(new InMemoryResearchDossierStore(), { ...request,
      finalizationReceipt: passed(), dossier: { given: true, value: { scope: "public", value: { saves_work: "substantial" } } } });
    expect(shapeOnly?.note).toContain("Correct them and send it again only with a final check already needed for this " +
      "research; do not make another check solely to repair it.");
  });
});
