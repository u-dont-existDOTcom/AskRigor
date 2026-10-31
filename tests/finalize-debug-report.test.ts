import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  CHECK_REPORT_MAX_CHARACTERS, CHECK_REPORT_TOKEN_MAX_CHARACTERS, buildCheckReport,
  issueCheckReportToken, verifyCheckReportToken
} from "../apps/research-mcp/src/check-report.js";
import { maskedRule, rule, joinRules, ruleParts, ruleText } from "../apps/research-mcp/src/check-rules.js";
import { reportValueCheck } from "../apps/research-mcp/src/check-report-values.js";
import {
  CORRECTION_REPORT_OFFER, finalizeResearch, finalizeResearchInputSchema, type FinalizeResearchInput,
  type FinalizeResearchOutput, protocolNamesFrom
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { issueResearchReceipt, researchTargetDigest } from "../apps/research-mcp/src/research-receipts.js";
import { currentProtocolElementNames, protocolElementNamesFrom } from "../apps/research-mcp/src/protocol-rule-names.js";
import { REPORT_PROTOCOL_VERSIONS } from "../apps/research-mcp/src/check-report-vocabulary.js";
import { renderedCheckReportVocabulary } from "../scripts/generate-check-report-vocabulary.mts";
import { uncheckedAnswerInstructions } from "../apps/research-mcp/src/register-tools.js";

const SECRET = "debug-report-fixture-secret-0123456789abcdef";
const NOW = () => new Date("2026-10-26T12:00:00.000Z");
const TARGET = "Synthetic private target 张三 عائشة";
const versions = { build: "6f229e39", ...REPORT_PROTOCOL_VERSIONS };
const allowed = reportValueCheck(finalizeResearchInputSchema, Object.values(REPORT_PROTOCOL_VERSIONS));
const receipt = (kind: Parameters<typeof issueResearchReceipt>[0], claims: Parameters<typeof issueResearchReceipt>[1]) =>
  issueResearchReceipt(kind, claims, { secret: SECRET, now: NOW });
const base = (overrides: Partial<FinalizeResearchInput> = {}): FinalizeResearchInput => ({
  receipts: [], research_target: TARGET, research_depth: "deep", treatment_choice: "not_compared",
  community_evidence: "not_relevant", not_relevant_basis: "emergency_before_triage",
  not_relevant_reason: "Synthetic emergency fixture", key_sources: [],
  answer_draft: "No study's methods were checked in full text for this answer.", absence_claims: [],
  scale_results: [], binary_results: [], safety_question: false, safety_claims: [], key_terms: [], mechanism_claims: [],
  recommendations: [], user_observations: [], proposed_tests: [], ...overrides
});
function stopped(input: FinalizeResearchInput): FinalizeResearchOutput {
  input = { ...input, answer_draft: `${input.answer_draft}\n\nThe private assertion was correct.`,
    corrections: [{ retracted: "The private assertion was correct.", change: "That assertion was wrong.", by_user: false }] };
  let result = finalizeResearch(input, { secret: SECRET, now: NOW, runningVersions: versions });
  for (let n = 1; n < 10 && result.status === "not_ready"; n += 1) {
    result = finalizeResearch({ ...input, round_token: result.round_token }, { secret: SECRET, now: NOW, runningVersions: versions });
  }
  expect(result.status).toBe("stopped");
  return result;
}

describe("the final check's private debug report", () => {
  it("keeps exact step text and masks by membership, in every script", () => {
    const values = ["audit_youtube_video_community", "community_searches[2].threads_read[0].url", "signature_invalid",
      7, REPORT_PROTOCOL_VERSIONS.hrp, "10.1000/private", "aPxddfPf5UQ", '"a private quotation"', "Alice Smith",
      "张三的健康故事", "قصة عائشة", "личная история", "私の話", "नाम और विषय", "https://private.example/", "user_observations[0].made_up"];
    for (const [index, value] of values.entries()) {
      const tagged = rule`Server rule: ${value}.`;
      expect(ruleText(tagged)).toBe(`Server rule: ${value}.`);
      expect(tagged.parts).toEqual(["Server rule: ", "."]);
      expect(tagged.values).toEqual([value]);
      expect(maskedRule(tagged, allowed)).toBe(`Server rule: ${index < 5 ? value : "…"}.`);
    }
    expect(allowed("key_sources[0].id[0]")).toBe(false);
    expect(allowed("key_sources[01].id")).toBe(false);
    expect(allowed(" key_sources[0].id")).toBe(false);
    expect(allowed("finalize_research now")).toBe(false);
    expect(maskedRule(rule`${{ text: "private", parts: ["private"], values: [] }}`, allowed)).toBe("…");
    expect(maskedRule(ruleParts("An untagged dynamic string"), allowed)).toBe("…");
  });

  it("derives the vocabulary from exact runtime schemas even when published output values are open", async () => {
    expect(await readFile(new URL("../apps/research-mcp/src/check-report-vocabulary.ts", import.meta.url), "utf8"))
      .toBe(await renderedCheckReportVocabulary());
    expect(allowed("youtube_video_audit_identifier_membership_boundary")).toBe(true);
    for (const code of ["continue_research", "ledger_consistent_for_synthesis", "ATLAS_LINK_CYCLE"]) {
      expect(allowed(code), code).toBe(true);
    }
  });

  it("records the video-audit step instead of just saying research failed", () => {
    const video = "aPxddfPf5UQ";
    const result = stopped(base({ community_evidence: "researched", not_relevant_basis: undefined,
      material_video_ids: [video], receipts: [
        receipt("youtube_survey", { target: researchTargetDigest(TARGET), videos: [video], q: "one", inc: 0, rl: 0 }),
        receipt("youtube_community_audit", { target: researchTargetDigest(TARGET), videos: [video], read: [video] })
      ] }));
    const report = JSON.stringify(result.check_report);
    expect(result.notes!.join(" ")).toContain("has only a one-call community audit");
    expect(report).not.toContain("has only a one-call community audit");
    expect(report).not.toContain("audit_youtube_video_community");
    expect(report).not.toContain(video);
    expect(report).not.toContain(TARGET);
    expect(result.bug_report).toContain("rule still unmet:");
    expect(result.check_report!.receipts).toEqual(expect.arrayContaining([
      { kind: "youtube_survey", count: 1, rejected: [] }, { kind: "youtube_community_audit", count: 1, rejected: [] }
    ]));
  });

  it("records a no-DOI source's acquisition boundary and masks the source identifier", () => {
    const result = stopped(base({ key_sources: [{ id: "PMC5640576", status: "lead_only", read_depth: "partial_text", answer_marker: "Source" }],
      full_text_search: { status: "not_needed", reason: "Synthetic source fixture." },
      lab_preparation: { status: "not_applicable", reason: "Synthetic source fixture." },
      intervention_identity: { status: "not_applicable", reason: "Synthetic source fixture." },
      receipts: [receipt("pubmed_record", { pmcid: "PMC5640576", pmid: "12345678", doi: "" })] }));
    expect(result.notes).toContain("Cite \"Source\" (PMC5640576) as a lead: no DOI is known; acquire_open_full_text requires a DOI, so its methods were not audited.");
    expect(result.check_report!.limits).toEqual([]);
    expect(JSON.stringify(result.check_report)).not.toContain("PMC5640576");
    expect(result.bug_report).toContain("rule still unmet:");
  });

  it("q132: records quota-stopped searches as limits, never round steps in a stopped report", () => {
    const result = stopped(base({ community_evidence: "researched", not_relevant_basis: undefined,
      receipts: [receipt("youtube_search", { target: researchTargetDigest(TARGET), videos: [], inc: 5, rl: 5, q: "one" })] }));
    expect(result.check_report!.next_turn.some(({ rule }) => rule.includes("daily quota"))).toBe(false);
    expect(result.check_report!.could_not.some(({ rule }) => rule.includes("daily quota"))).toBe(false);
    expect(result.check_report!.limits).toEqual([]);
    expect(result.limits).toContain("YouTube's daily search limit stopped 5 searches in this research; a later turn can rerun them after the limit resets.");
    expect(result.caveats).toContain("YouTube's daily search limit stopped 5 searches in this research; a later turn can rerun them after the limit resets.");
    expect(JSON.stringify(result.check_report)).not.toContain(TARGET);
  });

  it("records the community-address requirement and masks the community name", () => {
    const name = "Invented private community 张三";
    const result = stopped(base({ community_evidence: "researched", not_relevant_basis: undefined,
      principal_communities: [{ name, platform: "forum" }],
      community_searches: [{ community: name, platform: "forum", queries: [TARGET], threads_read: [], access_boundary: "login_required" }] }));
    expect(result.notes!.join(" ")).toContain("address");
    expect(JSON.stringify(result.check_report)).not.toContain("address");
    expect(JSON.stringify(result.check_report)).not.toContain(name);
    expect(result.bug_report).toContain("rule still unmet:");
  });

  it("counts rejected receipts by kind and gives their verifier's reason", () => {
    const valid = receipt("pubmed_record", { pmid: "12345678" });
    const bad = valid.slice(0, -3) + (valid.at(-3) === "a" ? "b" : "a") + valid.slice(-2);
    const result = stopped(base({ receipts: [bad, "not a receipt"] }));
    expect(result.check_report!.receipts).toEqual([
      { kind: "pubmed_record", count: 1, rejected: [{ reason: "signature_invalid", count: 1 }] },
      { kind: "unverified", count: 1, rejected: [{ reason: "malformed", count: 1 }] }
    ]);
    expect(result.notes!.join(" ")).toContain("receipts[0]");
    expect(result.bug_report).not.toContain("does not verify");
  });

  it("bounds its structured report, counts omissions and preserves its signed exact bytes", () => {
    const step = { kind: "research" as const, text: "", consecutive: 3, rule: rule`Fixed ${"private"} ${"X".repeat(1000)} ${"video"}.` };
    const report = buildCheckReport({ status: "stopped", reason: "stuck", round: 3,
      couldNot: Array.from({ length: 400 }, () => ({ ...step, rule: joinRules(rule`Fixed ${"private"}. `, ...Array.from({ length: 100 }, () => rule`Fixed wording. `)) })), nextTurn: [step] },
      { versions, allowed, receipts: [] });
    expect(JSON.stringify(report).length).toBeLessThanOrEqual(CHECK_REPORT_MAX_CHARACTERS);
    expect(report.omitted_steps).toBeGreaterThan(0);
    expect(report.could_not[0]!.omitted_characters).toBeGreaterThan(0);
    const manyKinds = buildCheckReport({ status: "stopped", reason: "stuck", round: 3, couldNot: [], nextTurn: [] },
      { versions, allowed: () => true, receipts: Array.from({ length: 31 }, (_, i) => ({ kind: `kind${i}` })) });
    expect(manyKinds.receipts).toHaveLength(30);
    expect(manyKinds.omitted_receipt_kinds).toBe(1);
    const token = issueCheckReportToken(report, SECRET);
    expect(token.length).toBeLessThanOrEqual(CHECK_REPORT_TOKEN_MAX_CHARACTERS);
    expect(verifyCheckReportToken(token, SECRET)).toEqual(report);
    expect(verifyCheckReportToken(token, "foreign server")).toBeUndefined();
    expect(verifyCheckReportToken(token.replace("br1", "cs1"), SECRET)).toBeUndefined();
    expect(verifyCheckReportToken(token + "a", SECRET)).toBeUndefined();
    expect(verifyCheckReportToken("a".repeat(CHECK_REPORT_TOKEN_MAX_CHARACTERS + 1), SECRET)).toBeUndefined();
  });

  it("returns its token and tells the model to pass it only after consent", () => {
    const result = stopped(base({ proposed_tests: [{ quote: "Try it.", repeats: 7, blinded: true }] }));
    expect(verifyCheckReportToken(result.check_report_token!, SECRET)).toEqual(result.check_report);
    expect(result.check_report!.could_not[0]).toEqual({ kind: "answer_draft", consecutive_rounds: 3,
      rule: "corrections[0]'s wrong statement still appears in the answer outside its change sentence: correct it everywhere, including headings, tables and summaries.", omitted_characters: 0 });
    expect(uncheckedAnswerInstructions(result)).toContain("If the user says yes");
    expect(uncheckedAnswerInstructions(result)).toContain("pass check_report_token exactly as returned");
  });
});

describe("a correction's preventing rule", () => {
  const report = "When a claim is corrected, AskRigor should carry the correction into its answer because the earlier claim was wrong.";
  const correction = { by_user: true, retracted: "The earlier incorrect assertion.", change: "Corrected.", report };
  it("parses actual XML element names, not attributes, text or commented examples", () => {
    expect(protocolElementNamesFrom(['<Protocol><actual example="not_an_element">word &lt;fake&gt;</actual><!-- <commented/> --></Protocol>']))
      .toEqual(new Set(["Protocol", "actual"]));
  });
  it("accepts HRP and lowercase Universal elements, rejects non-elements and requires the rule in the shown report", async () => {
    const elements = await currentProtocolElementNames();
    const texts = await Promise.all(["HRP_Full.xml", "Universal_Instructions.xml"].map((file) => readFile(new URL(`../protocols/${file}`, import.meta.url), "utf8")));
    for (const name of ["HarmWarningCalibration", "corrections_and_calibration"]) {
      const line = `Rule that should have prevented the error: ${name}`;
      const input = base({ corrections: [{ ...correction, preventing_rule: name }],
        answer_draft: `${base().answer_draft}

Corrected.

${report}

${line}

${CORRECTION_REPORT_OFFER}` });
      const result = finalizeResearch(input, { secret: SECRET, protocolElements: elements, protocolNames: protocolNamesFrom(texts) });
      expect(result.next_steps.join("\n")).not.toContain("preventing_rule");
      expect(result.next_steps.join("\n")).not.toContain("internal labels");
      expect(result.caveats).toContain(line);
    }
    const invalid = finalizeResearch(base({ corrections: [{ ...correction, preventing_rule: "DefinitelyNotAnElement" }] }), { secret: SECRET, protocolElements: elements });
    expect(invalid.notes!.join("\n")).toContain("is not an element name");
    const absent = finalizeResearch(base({ corrections: [correction] }), { secret: SECRET, protocolElements: elements });
    expect(absent.notes!.join("\n")).toContain("Give corrections[0].preventing_rule");
    const missing = finalizeResearch(base({ corrections: [{ ...correction, preventing_rule: "no_rule" }] }), { secret: SECRET, protocolElements: elements });
    expect(missing.notes!.join("\n")).toContain("Give corrections[0].missing_rule");
    const named = finalizeResearch(base({ corrections: [{ ...correction, preventing_rule: "no_rule", missing_rule: "Check source identity before ranking." }] }), { secret: SECRET, protocolElements: elements });
    expect(named.next_steps.join("\n")).not.toContain("Give corrections[0].missing_rule");
    expect(named.caveats).toContain("Missing rule: Check source identity before ranking.");
  });
});
