import { createHash } from "node:crypto";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InMemoryResearchContributorAccessStore,
  RESEARCH_ACCOUNT_REFERENCE_CHARACTERS,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
  researchAccountReference,
} from "@askrigor/evidence-repository";

import { DEV_ACCOUNT_REFERENCE_CHARACTERS, devAccountKeysFromEnv } from "../apps/research-mcp/src/config.js";
import { findingsCardSchema } from "../apps/research-mcp/src/findings/card.js";
import type { FindingsSaveResult } from "../apps/research-mcp/src/findings/contracts.js";
import type { FindingsSaveContext } from "../apps/research-mcp/src/findings/service.js";
import { RESEARCH_OPERATIONS, registerTools, type RegisterToolsOptions } from "../apps/research-mcp/src/register-tools.js";
import {
  manageResearchAccessInputSchema, plainAnswerRequest
} from "../apps/research-mcp/src/research-contributor-access-tool.js";
import {
  FINALIZE_REMINDER, FINALIZE_RESEARCH_SHAPES_DESCRIPTION, TOOL_LIST_REFRESH_HINT, finalizeResearch,
  finalizeResearchInputSchema, plainAnswerClaimDigest, type FinalizeResearchInput
} from "../apps/research-mcp/src/research-finalization-gate.js";
import {
  discoveryQueryDigest, issueResearchReceipt, plainAnswerAccountBinding, researchTargetDigest, verifyResearchReceipt
} from "../apps/research-mcp/src/research-receipts.js";
import { withCommunitySkip } from "./helpers/community-skip.js";
import { CARD } from "./helpers/findings-fixtures.js";
import { assertNextStepsContract } from "./helpers/finalize-next-steps-contract.js";

// Owner answer 140b (2026-10-20): "for paid and dev accounts at once. Before research, the AI writes the short answer
// it would give without AskRigor's tools and AskRigor signs it with the time; the research checks each of its claims
// and looks beyond them; and the answer ends with a short note quoting the plain answer and saying what changed and
// what backs each change, on by default, with a per-account setting to turn it off."
const SECRET = "plain-answer-test-secret-0123456789abcdefghij";
const TARGET = "Whether vitamin D supplements prevent colds in adults";
const DOI = "10.1000/vitamin-d-trial";
const CLAIMS = ["Vitamin D supplements prevent colds in most adults.", "A daily dose of 1,000 IU is enough."];
const PLAIN_TEXT = `${CLAIMS[0]} ${CLAIMS[1]} Sunlight helps too.`;
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
// The account the gate's calls are made for, by the binding its plain-answer receipts sign.
const ACCOUNT = plainAnswerAccountBinding(SECRET, "a".repeat(64));
// Receipts sign their issue order `t`; the research here begins at t = 2000.
const plainReceipt = (t: number, claims: readonly string[] = CLAIMS, target = TARGET, acct = ACCOUNT) =>
  issueResearchReceipt("plain_answer", {
    claims: claims.map(plainAnswerClaimDigest), text: sha256(PLAIN_TEXT), target: researchTargetDigest(target), acct, t
  }, { secret: SECRET });
const audit = (t = 2_000) => issueResearchReceipt("study_audit", {
  id: DOI, status: "complete_no_unresolved_fields", t
}, { secret: SECRET });
const declaration = { status: "not_applicable" as const, reason: "Synthetic fixture isolates the plain answer." };
const LINK = `[Trial](https://doi.org/${DOI}) was read in full.`;
const CORRECTED = "In three large trials, vitamin D did not prevent colds in adults with normal levels.";
const QUALIFIED = "The trials gave 1,000 to 4,000 IU a day, and only people low in vitamin D might benefit.";
type Comparison = NonNullable<FinalizeResearchInput["plain_answer_comparison"]>;
const COMPARISON: Comparison = [
  { claim: CLAIMS[0]!, outcome: "corrected", answer_quote: CORRECTED, sources: [DOI] },
  { claim: CLAIMS[1]!, outcome: "not_checked" }
];
const base = (overrides: Partial<FinalizeResearchInput> = {}): FinalizeResearchInput => withCommunitySkip({
  receipts: [plainReceipt(1_000), audit()],
  research_target: TARGET, research_depth: "deep", treatment_choice: "not_compared",
  community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome",
  not_relevant_reason: "Synthetic fixture isolates the plain answer.",
  commercial_review_applicability: declaration, intervention_identity: declaration, lab_preparation: declaration,
  full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates the plain answer." },
  key_sources: [{ id: DOI, status: "validated", read_depth: "full_text_audited", answer_marker: "Trial" }],
  absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], safety_claims: [], safety_question: false, key_terms: [],
  mechanism_claims: [], recommendations: [],
  answer_draft: `${LINK}\n\n${CORRECTED} ${QUALIFIED}`,
  plain_answer_comparison: COMPARISON,
  ...overrides
});
// An account asked for a plain answer, with its note on, unless a test passes its setting, or null for another account.
const check = (overrides: Partial<FinalizeResearchInput> = {}, note: boolean | null = true) =>
  assertNextStepsContract(finalizeResearch(base(overrides), {
    secret: SECRET, ...(note === null ? {} : { plainAnswer: { note, account: ACCOUNT } })
  }));
const steps = (overrides: Partial<FinalizeResearchInput> = {}) =>
  check(overrides).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT);
const NOTE = "Without AskRigor, a quick answer would have said: “Vitamin D supplements prevent colds in most " +
  "adults.” This research corrected that, from a full-text audit of 1 study: “In three large trials, " +
  "vitamin D did not prevent colds in adults with normal levels.” It would also have said: “A daily dose of " +
  "1,000 IU is enough.” This research did not check that.";

describe("finalize_research compares the answer with the plain answer registered before research (owner answer 140b)", () => {
  it("writes the note from the comparison, quoting the registered claims exactly and naming what backs a change", () => {
    const result = check();
    expect(result).toMatchObject({
      status: "ready_with_limits", next_steps: [], plain_answer: { status: "registered", claims: 2 }
    });
    expect(result.plain_answer_note).toBe(NOTE);
    // The note is written for the end of the answer; it is not a caveat the draft must already carry.
    expect(result.caveats.join(" ")).not.toContain("quick answer would have said");
    // In the registered order, whatever the comparison's order; a qualification and a confirmation, with the work
    // behind them in the server's words.
    const both = check({ plain_answer_comparison: [
      { claim: CLAIMS[1]!, outcome: "qualified", answer_quote: QUALIFIED, sources: [DOI, `https://doi.org/${DOI.toUpperCase()}`] },
      { claim: CLAIMS[0]!, outcome: "confirmed" }
    ] });
    expect(both.plain_answer_note).toBe("Without AskRigor, a quick answer would have said: “Vitamin D supplements " +
      "prevent colds in most adults.” This research confirmed that. It would also have said: “A daily dose of " +
      "1,000 IU is enough.” This research qualified that, from a full-text audit of 1 study: “The trials gave " +
      "1,000 to 4,000 IU a day, and only people low in vitamin D might benefit.”");
    // A claim copied with other quotation marks, spacing or case is the same claim.
    expect(check({ plain_answer_comparison: [
      { ...COMPARISON[0]!, claim: `  ${CLAIMS[0]!.toUpperCase()} ` }, COMPARISON[1]!
    ] })).toMatchObject({ next_steps: [], plain_answer: { status: "registered" } });
  });

  it("quotes claims in any language exactly as the comparison copies them", () => {
    const claims = ["ビタミンDは大人の風邪を予防する", "Один грамм в день достаточно."];
    const corrected = "三つの大規模試験では、ビタミンDは風邪を予防しなかった。";
    const result = check({
      receipts: [plainReceipt(1_000, claims), audit()],
      answer_draft: `${LINK}\n\n${corrected}`, answer_language: "ja",
      plain_answer_comparison: [
        { claim: claims[1]!, outcome: "not_checked" },
        { claim: claims[0]!, outcome: "corrected", answer_quote: corrected, sources: [DOI] }
      ]
    });
    expect(result.plain_answer_note).toBe("Without AskRigor, a quick answer would have said: " +
      `“${claims[0]}”. This research corrected that, from a full-text audit of 1 study: “${corrected}” ` +
      `It would also have said: “${claims[1]}” This research did not check that.`);
  });

  it("asks for the comparison, and blocks until it is given or the plain answer's receipt is left out", () => {
    const result = check({ plain_answer_comparison: undefined });
    expect(result.status).toBe("not_ready");
    expect(result.next_steps).toEqual([
      "Give plain_answer_comparison: for each of the 2 claims of the plain answer registered before this research, " +
        "copied exactly as manage_research_access listed it, whether the research confirmed, corrected or qualified " +
        "it, or did not check it (outcome); a correction or a qualification also gives the answer's sentence stating " +
        "it (answer_quote) and what backs it (sources). Without that field, leave the plain answer's research_receipt " +
        "out of receipts: the answer then ends without the note.",
      TOOL_LIST_REFRESH_HINT
    ]);
    expect(result).not.toHaveProperty("plain_answer_note");
    expect(result.finalization_receipt).toBeUndefined();
    expect(check({ plain_answer_comparison: undefined, receipts: [audit()] }).status).toBe("ready_with_limits");
  });

  it("refuses a change without the work that backs it, naming the problem", () => {
    const corrected = (entry: Partial<Comparison[number]>): Comparison => [{ ...COMPARISON[0]!, ...entry }, COMPARISON[1]!];
    expect(steps({ plain_answer_comparison: corrected({ sources: undefined }) })).toEqual([
      "plain_answer_comparison[0] is corrected with nothing behind it that a quick answer could not have: give in " +
        "sources a study audited in full text here or a video whose comments were read here, or quote as answer_quote " +
        "a sentence that absence_claims or corrections (with by_user false) also declare."
    ]);
    expect(steps({ plain_answer_comparison: corrected({ answer_quote: undefined }) })).toEqual([
      "plain_answer_comparison[0] is corrected without answer_quote: copy the answer's sentence that states the change " +
        "from answer_draft."
    ]);
    expect(steps({ plain_answer_comparison: corrected({ sources: [DOI, "10.1000/never-audited"] }) })).toEqual([
      "plain_answer_comparison[0].sources lists 10.1000/never-audited, which no full-text method audit or comment audit " +
        "passed here covers: list studies audited in full text here (DOI, PMID or PMCID) and videos whose comments " +
        "were read here (video ID), or leave sources out."
    ]);
    expect(steps({ plain_answer_comparison: corrected({ answer_quote: "Vitamin D never works." }) })).toEqual([
      "plain_answer_comparison[0].answer_quote gives text the answer does not show: copy each sentence exactly from " +
        "answer_draft."
    ]);
    expect(check({ plain_answer_comparison: corrected({ sources: undefined }) })).not.toHaveProperty("plain_answer_note");
  });

  it("needs each registered claim once, copied as registered", () => {
    expect(steps({ plain_answer_comparison: [COMPARISON[0]!] })).toEqual([
      "plain_answer_comparison leaves out claim 1 of the plain answer registered before this research, as " +
        "manage_research_access numbered them: give each, copied exactly, with whether the research confirmed, " +
        "corrected or qualified it, or did not check it."
    ]);
    expect(steps({ plain_answer_comparison: [
      ...COMPARISON, { claim: CLAIMS[0]!, outcome: "confirmed" }, { claim: "Vitamin D cures colds.", outcome: "not_checked" }
    ] })).toEqual([
      "plain_answer_comparison[2] gives the same claim as plain_answer_comparison[0]: give each claim one entry.",
      "plain_answer_comparison[3].claim is not one of the 2 claims of the plain answer registered before this " +
        "research: copy it exactly as manage_research_access listed it."
    ]);
  });

  it("accepts a checked absence claim or the research's own correction as what backs a change", () => {
    const absent = "No trial has tested vitamin D against colds in children under two (searched in PubMed).";
    const search = issueResearchReceipt("literature_search", {
      src: "pubmed", q: discoveryQueryDigest(["vitamin D colds infants"]), ret: 0, n: 0, t: 3_000
    }, { secret: SECRET });
    const bounded = "Where this answer says something was not found, it means the searches made here (PubMed) did " +
      "not find it, and they did not cover older or variant terms, citation chains and grey literature; that is not " +
      "evidence that it does not exist.";
    const result = check({
      receipts: [plainReceipt(1_000), audit(), search],
      answer_draft: `${LINK}\n\n${CORRECTED} ${absent}\n\n${bounded}`,
      absence_claims: [{ quote: absent, state: "support_not_located" }],
      plain_answer_comparison: [COMPARISON[0]!, { claim: CLAIMS[1]!, outcome: "qualified", answer_quote: absent }]
    });
    expect(result).toMatchObject({ status: "ready_with_limits", next_steps: [] });
    expect(result.plain_answer_note).toContain("This research qualified that, from a check of what the evidence does " +
      `not show: “${absent}”`);
    const fixed = "Earlier I gave the dose in milligrams; it is 1,000 IU, about 25 micrograms.";
    const corrected = check({
      answer_draft: `${LINK}\n\n${CORRECTED} ${fixed}`,
      corrections: [{ retracted: "The dose is 1,000 mg a day.", change: fixed, by_user: false }],
      plain_answer_comparison: [COMPARISON[0]!, { claim: CLAIMS[1]!, outcome: "corrected", answer_quote: fixed }]
    });
    expect(corrected).toMatchObject({ status: "ready_with_limits", next_steps: [] });
    expect(corrected.plain_answer_note).toContain("This research corrected that, from a correction the research made " +
      `to an earlier statement: “${fixed}”`);
  });

  it("gives no note, and holds nothing back, without this account's plain answer registered before this research", () => {
    const later = " For a later question, register its plain answer before researching it.";
    const afterResearch = "The plain answer passed was registered after a research receipt passed here was issued, so " +
      "it cannot show what a quick answer would have said, and the answer ends without the note. For a later question, " +
      "register its plain answer before researching it, and pass only receipts issued after it.";
    const otherDiscovery = issueResearchReceipt("youtube_search", {
      videos: [], q: "a1a1a1a1a1a1", target: researchTargetDigest("Another question"), t: 200
    }, { secret: SECRET });
    const cases: Array<[string[], string, string]> = [
      [[audit()], "no_receipt", "No plain answer registered with manage_research_access before this research was " +
        `passed in receipts, so the answer ends without the note comparing it with one.${later}`],
      [[audit(), plainReceipt(2_500)], "after_research", afterResearch],
      [[plainReceipt(1_000, CLAIMS, "Another question"), audit()], "other_target", "The plain answer passed was " +
        `registered for another research target, so the answer ends without the note comparing it with this research.${later}`],
      [[plainReceipt(1_000, CLAIMS, TARGET, plainAnswerAccountBinding(SECRET, "b".repeat(64))), audit()], "other_account",
        `The plain answer passed was registered by another account, so the answer ends without the note comparing it with one.${later}`],
      // Research began with the earliest receipt passed, whatever it was made for: a study audit names no research
      // target, and discovery for an earlier question came before this plain answer too.
      [[audit(500), plainReceipt(1_000), audit()], "after_research", afterResearch],
      [[otherDiscovery, plainReceipt(1_000), audit()], "after_research", afterResearch]
    ];
    for (const [receipts, status, reason] of cases) {
      for (const comparison of [undefined, COMPARISON]) {
        const result = check({ receipts, plain_answer_comparison: comparison });
        expect(result, status).toMatchObject({ status: "ready_with_limits", next_steps: [], plain_answer: { status, reason } });
        expect(result).not.toHaveProperty("plain_answer_note");
      }
    }
  });

  it("compares the latest plain answer this account signed before the research", () => {
    const earlier = plainReceipt(500, ["Vitamin D cures colds."]);
    const result = check({ receipts: [plainReceipt(1_000), earlier, audit()] });
    expect(result).toMatchObject({ next_steps: [], plain_answer: { status: "registered", claims: 2 } });
    expect(result.plain_answer_note).toBe(NOTE);
  });

  it("removes only the note when the account turned it off: the comparison is still asked for and checked", () => {
    const off = check({}, false);
    expect(off).toMatchObject({
      status: "ready_with_limits", next_steps: [],
      plain_answer: {
        status: "note_off", claims: 2,
        reason: "This account has turned off the note comparing the answer with its plain answer, so the answer ends " +
          "without it; manage_research_access with action set_plain_answer_note turns it back on."
      }
    });
    expect(off).not.toHaveProperty("plain_answer_note");
    expect(check({ plain_answer_comparison: undefined }, false).status).toBe("not_ready");
  });

  it("counts a plain-answer receipt for nothing from an account not asked for one", () => {
    const free = check({}, null);
    expect(free).toMatchObject({ status: "ready_with_limits", next_steps: [] });
    expect(free).not.toHaveProperty("plain_answer");
    expect(free).not.toHaveProperty("plain_answer_note");
    expect(check({ plain_answer_comparison: undefined }, null).status).toBe("ready_with_limits");
    // The saved card's stamp counts research receipts, and a plain answer is not research.
    const verified = verifyResearchReceipt(check().finalization_receipt!, { secret: SECRET });
    expect(verified.ok && verified.claims.receipts).toBe("1");
  });

  it("gives the hidden nested input its JSON in the tool description", () => {
    expect(FINALIZE_RESEARCH_SHAPES_DESCRIPTION).toContain("plain_answer_comparison[].sources [\"10.1000/example\"]");
    expect(finalizeResearchInputSchema.shape.plain_answer_comparison.safeParse([
      { claim: "…", outcome: "corrected", answer_quote: "…", sources: ["10.1000/example"] }
    ]).success).toBe(true);
    expect(finalizeResearchInputSchema.shape.plain_answer_comparison.safeParse([
      { claim: "…", outcome: "contradicted" }
    ]).success).toBe(false);
  });
});

describe("manage_research_access and finalize_research through the connector (owner answer 140b)", () => {
  const IDENTITY_SECRET = new TextEncoder().encode("synthetic-plain-answer-identity-secret-of-32-bytes-or-more");
  const AGREEMENT = {
    noticeVersion: RESEARCH_USE_NOTICE_VERSION,
    eligibleDeidentifiedResearchContributionRequired: true,
    prohibitedPrivateAndRawContentExcluded: true,
    proposalReviewAndNoAuthorityAcknowledged: true,
    paidPrivateAlternativeAcknowledged: true
  } as const;

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function accounts() {
    const store = new InMemoryResearchContributorAccessStore();
    const service = new ResearchContributorAccessService({ store, identitySecret: IDENTITY_SECRET });
    await service.acceptFreeContributor("auth0|free", AGREEMENT);
    await service.acceptFreeContributor("auth0|dev", AGREEMENT);
    store.grantPrivateEntitlement({
      entitlementId: "77777777-7777-4777-a777-777777777777",
      accountKey: service.accountKeyForSubject("auth0|paid"),
      status: "ACTIVE", source: "OWNER_GRANTED", externalReferenceSha256: null,
      grantedAt: "2026-09-01T00:00:00.000Z", expiresAt: null, revokedAt: null
    });
    await service.activatePaidPrivate("auth0|paid");
    // The owner's account is marked dev in the server's settings, as a comma-separated list of the account references
    // manage_research_access shows (or of whole account keys).
    vi.stubEnv("ASKRIGOR_DEV_ACCOUNT_KEYS",
      ` ${"f".repeat(64)}, ${researchAccountReference(service.accountKeyForSubject("auth0|dev")).toUpperCase()} ,not-a-key`);
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    return { store, service };
  }

  function tool(name: "manage_research_access" | "finalize_research", options: RegisterToolsOptions) {
    let handler: ((input: unknown, extra?: unknown) => Promise<CallToolResult>) | undefined;
    registerTools({
      registerTool: (registered: string, _config: unknown, execute: typeof handler) => {
        if (registered === name) handler = execute;
      }
    } as unknown as McpServer, { researchAccessRequired: true, mcpSurface: "/mcp/claude", ...options });
    return async (input: Record<string, unknown>, subject: string) => handler!(
      (name === "finalize_research" ? finalizeResearchInputSchema : manageResearchAccessInputSchema).parse(input), {
        authInfo: {
          token: "synthetic-token", clientId: "synthetic-client", scopes: ["research:use"],
          expiresAt: Math.floor(Date.now() / 1_000) + 60, extra: { subject }
        }
      });
  }
  const text = (result: CallToolResult) => (result.content as Array<{ text: string }>).map(({ text }) => text).join("\n");
  const register = (overrides: Record<string, unknown> = {}) => ({
    action: "register_plain_answer",
    plainAnswer: { researchTarget: TARGET, text: PLAIN_TEXT, claims: CLAIMS, ...overrides }
  });
  // The research a fixture reports: one audited study, passed after the plain answer was registered.
  const request = (receipts: string[], overrides: Record<string, unknown> = {}) => ({ ...base({ receipts }), ...overrides });
  const laterAudit = () => audit(Date.now() + 60_000);

  it("reads the dev accounts from the server's settings, ignoring entries that are not references or keys", () => {
    // A whole key counts as its reference; an entry of another length is ignored.
    expect([...devAccountKeysFromEnv(` ${"A".repeat(64)},${"b".repeat(12)} , ${"c".repeat(63)},${"d".repeat(13)},`)])
      .toEqual(["a".repeat(12), "b".repeat(12)]);
    expect(devAccountKeysFromEnv(undefined).size).toBe(0);
    expect(DEV_ACCOUNT_REFERENCE_CHARACTERS).toBe(RESEARCH_ACCOUNT_REFERENCE_CHARACTERS);
  });

  it("shows each account its reference, the one the dev list takes", async () => {
    const { service } = await accounts();
    const manage = tool("manage_research_access", { researchContributorAccessService: service });
    for (const subject of ["auth0|free", "auth0|paid", "auth0|dev", "auth0|new"]) {
      const inspected = await manage({ action: "inspect" }, subject);
      const reference = researchAccountReference(service.accountKeyForSubject(subject));
      expect(reference).toMatch(/^[a-f0-9]{12}$/u);
      expect(inspected.structuredContent).toMatchObject({ ok: true, accountReference: reference });
      expect(text(inspected)).toContain(`This account's reference, to give the user only when they ask for it: ${reference}.`);
    }
  });

  it("asks paid private and dev accounts, and only them, for a plain answer before research", async () => {
    const { service } = await accounts();
    const manage = tool("manage_research_access", { researchContributorAccessService: service });
    for (const subject of ["auth0|paid", "auth0|dev"]) {
      const inspected = await manage({ action: "inspect" }, subject);
      expect(inspected.structuredContent).toMatchObject({ ok: true, plainAnswer: { requested: true, note: true } });
      expect(text(inspected)).toContain(plainAnswerRequest(true));
    }
    expect(plainAnswerRequest(true)).toBe("Before any research call, write the short answer you would give without " +
      "AskRigor's tools, and register it with action register_plain_answer: plainAnswer.text, that answer (at most " +
      "1,500 characters); plainAnswer.claims, its main claims, 1 to 5 whole sentences each copied exactly from it (at " +
      "most 250 characters each); and plainAnswer.researchTarget, the research target you will give finalize_research. " +
      "AskRigor signs it with the time. Then treat each claim as something to check, confirm or correct, and look " +
      "beyond the claims too. The final check then writes a short note comparing the checked answer with this plain " +
      "answer, for the end of the answer.");
    const free = await manage({ action: "inspect" }, "auth0|free");
    expect(free.structuredContent).not.toHaveProperty("plainAnswer");
    expect(text(free)).not.toContain("register_plain_answer");
    // Gemini's catalog does not list the tool, and its surface asks for no plain answer.
    const gemini = tool("manage_research_access", { researchContributorAccessService: service, mcpSurface: "/mcp/gemini" });
    expect((await gemini({ action: "inspect" }, "auth0|paid")).structuredContent).not.toHaveProperty("plainAnswer");
    expect((await gemini(register(), "auth0|paid")).structuredContent).toMatchObject({
      ok: false, error: { code: "plain_answer_not_requested" }
    });
  });

  it("signs digests of the plain answer's whole-sentence claims with the time, and keeps none of its text", async () => {
    const { store, service } = await accounts();
    const manage = tool("manage_research_access", { researchContributorAccessService: service });
    const registered = await manage(register(), "auth0|paid");
    expect(registered.isError).not.toBe(true);
    const receipt = (registered.structuredContent as { research_receipt: string }).research_receipt;
    expect(registered.structuredContent).toEqual({
      ok: true, plainAnswer: { requested: true, note: true, claims: 2 }, research_receipt: receipt
    });
    const verified = verifyResearchReceipt(receipt, { secret: SECRET });
    expect(verified).toMatchObject({
      ok: true, kind: "plain_answer",
      claims: {
        claims: CLAIMS.map(plainAnswerClaimDigest), text: sha256(PLAIN_TEXT), target: researchTargetDigest(TARGET),
        acct: plainAnswerAccountBinding(SECRET, service.accountKeyForSubject("auth0|paid"))
      }
    });
    expect(verified.ok && typeof verified.claims.t === "string").toBe(true);
    expect(CLAIMS.map(plainAnswerClaimDigest).every((digest) => /^[a-f0-9]{16}$/u.test(digest))).toBe(true);
    // Neither the receipt nor the account row holds the plain answer, or the account key.
    for (const word of ["Vitamin", "colds", "1,000", service.accountKeyForSubject("auth0|paid")]) {
      expect(decodeURIComponent(receipt)).not.toContain(word);
    }
    expect(JSON.stringify(store.allAccounts())).not.toContain("Vitamin");
    expect(text(registered)).toContain(`research_receipt: ${receipt}`);
    expect(text(registered)).toContain(FINALIZE_REMINDER);
    expect(text(registered)).toContain(`Claims: 0 ${JSON.stringify(CLAIMS[0])}; 1 ${JSON.stringify(CLAIMS[1])}.`);

    const refused = async (input: Record<string, unknown>, problems: string[]) => {
      const result = await manage(input, "auth0|dev");
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ ok: false, problems, error: { code: "invalid_request" } });
      expect(result.structuredContent).not.toHaveProperty("research_receipt");
    };
    const notWhole = (index: number) => `plainAnswer.claims[${index}] is not one or more whole sentences copied ` +
      "exactly from plainAnswer.text: copy each claim as the text writes it, from the start of a sentence to its end, " +
      "within one paragraph.";
    await refused(register({ claims: [CLAIMS[0], "Vitamin D cures colds."] }), [notWhole(1)]);
    // A fragment of a sentence is not a claim the note could quote as the plain answer's.
    await refused(register({ claims: ["Vitamin", "1,000 IU is enough."] }), [notWhole(0), notWhole(1)]);
    await refused(register({ claims: [CLAIMS[0], `  ${CLAIMS[0]!.toUpperCase().replace(".", "")} `] }),
      ["plainAnswer.claims[1] repeats plainAnswer.claims[0]: give each claim once."]);
    // Typographic quotation marks, dashes and case are compared as the final check compares answer quotes, and the
    // receipt's size is the same in any script.
    const typographic = await manage(register({
      text: "Vitamin D won’t prevent colds — not in most adults.",
      claims: ["vitamin d won't prevent colds - not in most adults"]
    }), "auth0|dev");
    expect(typographic.structuredContent).toMatchObject({ ok: true, plainAnswer: { claims: 1 } });
    const long = Array.from({ length: 5 }, (_, index) => `${"Витамин ".repeat(30)}${index}.`);
    const cyrillic = await manage(register({ text: long.join(" "), claims: long }), "auth0|dev");
    expect(cyrillic.structuredContent).toMatchObject({ ok: true, plainAnswer: { claims: 5 } });
    expect((cyrillic.structuredContent as { research_receipt: string }).research_receipt.length).toBeLessThan(400);

    const free = await manage(register(), "auth0|free");
    expect(free.structuredContent).toMatchObject({ ok: false, error: { code: "plain_answer_not_requested" } });
    expect((await manage({ action: "register_plain_answer" }, "auth0|paid")).structuredContent)
      .toMatchObject({ ok: false, error: { code: "invalid_request" } });
    expect((await manage({ action: "inspect", plainAnswerNote: false }, "auth0|paid")).structuredContent)
      .toMatchObject({ ok: false, error: { code: "invalid_request" } });
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", "");
    vi.stubEnv("ASKRIGOR_YOUTUBE_CONTINUATION_SECRET", "");
    expect((await manage(register(), "auth0|paid")).structuredContent)
      .toMatchObject({ ok: false, error: { code: "receipts_unavailable" } });
  });

  it("turns the note off and back on for the account, and the final check follows the setting", async () => {
    const { store, service } = await accounts();
    const manage = tool("manage_research_access", { researchContributorAccessService: service });
    const finalize = tool("finalize_research", { researchContributorAccessService: service, findingsLibrary: false });
    const receipt = (await manage(register(), "auth0|paid")).structuredContent as { research_receipt: string };
    const checked = () => finalize(request([receipt.research_receipt, laterAudit()]), "auth0|paid");

    const on = await checked();
    expect(on.structuredContent).toMatchObject({ status: "ready_with_limits", plain_answer: { status: "registered" } });
    expect((on.structuredContent as { plain_answer_note: string }).plain_answer_note).toBe(NOTE);

    const off = await manage({ action: "set_plain_answer_note", plainAnswerNote: false }, "auth0|paid");
    expect(off.structuredContent).toEqual({ ok: true, plainAnswer: { requested: true, note: false } });
    expect(store.allAccounts().find(({ accountKey }) => accountKey === service.accountKeyForSubject("auth0|paid")))
      .toMatchObject({ plainAnswerNote: false });
    const inspected = await manage({ action: "inspect" }, "auth0|paid");
    expect(inspected.structuredContent).toMatchObject({ plainAnswer: { requested: true, note: false } });
    expect(text(inspected)).toContain(plainAnswerRequest(false));
    const quiet = await checked();
    expect(quiet.structuredContent).toMatchObject({ status: "ready_with_limits", plain_answer: { status: "note_off" } });
    expect(quiet.structuredContent).not.toHaveProperty("plain_answer_note");
    expect(text(quiet)).toContain("Plain answer: This account has turned off the note comparing the answer with its " +
      "plain answer, so the answer ends without it;");

    await manage({ action: "set_plain_answer_note", plainAnswerNote: true }, "auth0|paid");
    expect((await checked()).structuredContent).toMatchObject({ plain_answer_note: NOTE });
    // An account not asked for a plain answer has no such setting.
    expect((await manage({ action: "set_plain_answer_note", plainAnswerNote: false }, "auth0|free")).structuredContent)
      .toMatchObject({ ok: false, error: { code: "plain_answer_not_requested" } });
  });

  it("ends a dev account's answer with the note, then the saved line, then the check line", async () => {
    const { service } = await accounts();
    const saved: unknown[] = [];
    const manage = tool("manage_research_access", { researchContributorAccessService: service });
    const finalize = tool("finalize_research", {
      researchContributorAccessService: service, findingsLibrary: true,
      findingsSave: async (raw: unknown, _context: FindingsSaveContext): Promise<FindingsSaveResult> => {
        saved.push(raw);
        return { status: "saved", retryable: false, card_id: "ARF-0042", occurrence_count: 1 };
      }
    });
    const receipt = (await manage(register(), "auth0|dev")).structuredContent as { research_receipt: string };
    const card = findingsCardSchema.parse({
      ...CARD, findings: [{ ...CARD.findings[0]!, answer_quote: CORRECTED, sources: [DOI], tags: ["full_text_read"] }]
    });
    const result = await finalize(request([receipt.research_receipt, laterAudit()], { findings_card: card }), "auth0|dev");
    expect(result.structuredContent).toMatchObject({
      status: "ready_with_limits", plain_answer_note: NOTE,
      saved_line: "Saved to AskRigor's findings library for review as ARF-0042."
    });
    const output = text(result);
    const note = output.indexOf("\nNear the end of the answer, before the saved line and the check line, give this " +
      "note comparing the answer with the plain answer registered before research, its quotations exactly as they are " +
      `and its other words in the answer's language when the answer is not in English: ${NOTE}`);
    const savedLine = output.indexOf("\nJust before the check line, end the answer with this line");
    const checkLine = output.indexOf("\nEnd the answer with this line, as written");
    expect(note).toBeGreaterThan(0);
    expect(savedLine).toBeGreaterThan(note);
    expect(checkLine).toBeGreaterThan(savedLine);
    // The saved card holds none of the plain answer: it reaches only the answer.
    expect(saved).toHaveLength(1);
    expect(JSON.stringify(saved)).not.toContain("prevent colds in most adults");
    expect(JSON.stringify(saved)).not.toContain("1,000 IU is enough");

    // Another account's plain answer is not this one's.
    const closed = tool("finalize_research", { researchContributorAccessService: service, findingsLibrary: false });
    const paid = await closed(request([receipt.research_receipt, laterAudit()]), "auth0|paid");
    expect(paid.structuredContent).toMatchObject({ status: "ready_with_limits", plain_answer: { status: "other_account" } });
    expect(paid.structuredContent).not.toHaveProperty("plain_answer_note");

    // A free account not marked dev is not compared, and gets no word about it.
    const free = await finalize(request([audit()], { findings_card: card }), "auth0|free");
    expect(free.structuredContent).not.toHaveProperty("plain_answer");
    expect(text(free)).not.toContain("Plain answer");
  });

  it("tells a paid account why its answer ends without a note, and holds the answer back for nothing", async () => {
    const { service } = await accounts();
    const finalize = tool("finalize_research", { researchContributorAccessService: service, findingsLibrary: false });
    const result = await finalize(request([audit()], { plain_answer_comparison: undefined }), "auth0|paid");
    expect(result.structuredContent).toMatchObject({ status: "ready_with_limits", plain_answer: { status: "no_receipt" } });
    expect(text(result)).toContain("\nPlain answer: No plain answer registered with manage_research_access before " +
      "this research was passed in receipts, so the answer ends without the note comparing it with one.");
  });

  it("adds no tool: the catalog stays at 33, and neither tool has a Custom GPT Action path", () => {
    expect(RESEARCH_OPERATIONS).toHaveLength(33);
    for (const name of ["manage_research_access", "finalize_research"]) {
      expect(RESEARCH_OPERATIONS.find((operation) => operation.name === name)?.actionEnabled).toBe(false);
    }
  });
});
