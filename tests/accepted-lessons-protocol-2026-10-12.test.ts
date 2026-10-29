import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { getProtocolManifest } from "@askrigor/protocol";
import {
  undoAcceptedLessonsHrp, undoAcceptedLessonsUniversal, undoHandoffTarget, undoOwnerQuestions86To89Hrp,
  undoOwnerQuestions86To89Universal, undoReviewProvenance,
} from "./helpers/undo-read-depth.js";

const ROOT = new URL("../", import.meta.url);
const parser = new XMLParser({ parseTagValue: false });
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const loadCurrent = (protocol: "hrp" | "universal") => readFile(new URL(
  `protocols/${protocol === "hrp" ? "HRP_Full.xml" : "Universal_Instructions.xml"}`, ROOT,
), "utf8");
// The state right after question 84's edits: the newer questions 86 to 89 are undone first.
const load = async (protocol: "hrp" | "universal") => (
  protocol === "hrp" ? undoOwnerQuestions86To89Hrp : undoOwnerQuestions86To89Universal
)(await loadCurrent(protocol));
interface Edits {
  from: { version: string; sha256: string }; to: { version: string; sha256: string };
  edits: Array<[string, string]>;
}

// Independent of the recorded fixtures: exact question 84 plan approved by the owner as "84a", 2026-10-12.
const APPROVED = {
  universalRevision: 'Owner-approved, question 84 (2026-10-12), from accepted lessons #21, #11 and #17: "Next step: none" now needs no executable work left as well as no user action; the epistemic-phase router checks that an evaluation could detect an effect confined to a subgroup or state; and forum frequency labels need a sample not selected by outcome.',
  hrpRevision: "Owner-approved, question 84 (2026-10-12), from accepted lessons #21 and #20: added InstallmentIsNotCompletion, which keeps a finished installment apart from the user's research objective while authorized leads remain, and ClinicianEndorsementAudit, which weighs a clinician's endorsement of a health product as promotion and checks its incentives, text, credentials and cited studies, with two stress cases and final checks FS224 and FS225.",
  selfResolutionBefore: "If no user action remains, state:",
  selfResolutionAfter: "If neither user action nor executable work remains, state:",
  phaseRule: "12. Before designing or running an evaluation of an effect that may be confined to a minority, an intermittent state or a condition, name at least one plausible way the effect could be real and check that the design would detect it, for example by a power calculation or a simulation. An average that could not detect that form of the effect does not test whether it exists.",
  forumBefore: "classify the searched sample as common, mixed, minority, rare, absent, or indeterminate",
  forumAfter: "classify the searched sample as common, mixed, minority, rare, absent, or indeterminate only when it was not selected by outcome (an outcome-keyword search shows that an experience exists, not how often)",
  rules: [
    {
      id: "InstallmentIsNotCompletion", after: "ProactiveDiminishingReturns", next: "PreflightOnlyResponse",
      text: "Ending a research installment, or saving its report or file, does not complete the user's research while material, authorized leads remain open. Keep the status of the current pass apart from the status of the user's objective, continue the next executable lead when the tools allow, and when they don't, say exactly what was completed and what remains. A first pass that stops to offer deeper work lists its open leads as the next step, not as finished work.",
    },
    {
      id: "ClinicianEndorsementAudit", after: "CommercialAndCommunityBias", next: "ClosedPlatformAndAccessDisclosure",
      text: "Treat a clinician's endorsement of a health product as promotion until shown otherwise. Check whether the platform supplies prewritten or AI-assisted endorsement text, state any free samples, commissions or discount codes beside the endorsement, verify the clinician's credentials independently, and keep being listed apart from firsthand use, prescribing or observed patient outcomes. Check each study an endorsement cites against what it actually measured. Incentives or machine-like wording do not show that an endorser is fictitious or fraudulent.",
    },
  ],
  cases: [
    {
      id: "InstallmentSavedLeadsOpen",
      prompt: "In a continuing survey of unusual plants with clinically interesting effects, the assistant has saved a report on 12 candidates, while three original trials can still be checked and several plant classes are unexplored.",
      expected: "Say the installment is complete and the project open, name the remaining leads, and check the original trials next; do not say the research is complete or that no step remains.",
    },
    {
      id: "ClinicianEndorsementDirectory",
      prompt: "A wellness product lists many clinicians on a discount-sharing directory, with only a few written endorsements; the directory offers free samples and optional draft review text, and one endorsement claims a human benefit from a study in laboratory animals.",
      expected: "Separate the clinicians' identity from any product experience, state the incentives, report that the cited study tested animals, and do not call the clinicians fictitious or fraudulent without evidence.",
    },
  ],
  checks: [
    { id: "FS224", text: "A finished installment or saved report was not called completion while material, authorized leads remained open, and the pass and the user's objective kept separate statuses (InstallmentIsNotCompletion)." },
    { id: "FS225", text: "A clinician's endorsement was weighed as promotion: its incentives, the source of its text, the endorser's credentials and the studies it cites were checked, and no fraud was alleged without evidence (ClinicianEndorsementAudit)." },
  ],
} as const;
const PINS = {
  hrp: {
    from: { version: "20.6.20", sha256: "faa656b4d51a2554ff4b668c713bf35fb065624cc53e7871cdd5c16910fc74d0" },
    to: { version: "20.6.21", sha256: "e43fcb2174645f30fc7d8e7f143e2d17403c69d39d5824efc1d6a0d764bf68d7" },
  },
  universal: {
    from: { version: "20.5.40", sha256: "cff12a57417fd3136d382d79300d08d04ff35644f83494e1c1093ceecfa059d8" },
    to: { version: "20.5.41", sha256: "115b22a595b4cdcd663bb60986bd3dba0fb0d3f65f64bcc7bbb6d5a4bfd8a708" },
  },
} as const;
const plain = (body: string) => (parser.parse(`<text>${body}</text>`).text as string).replace(/\s+/gu, " ").trim();
function section(text: string, tag: string): string {
  const matches = [...text.matchAll(new RegExp(`<${tag}(?: [^>]*)?>([\\s\\S]*?)</${tag}>`, "gu"))];
  expect(matches, tag).toHaveLength(1);
  return matches[0]![1]!;
}
function element(text: string, tag: string, attr: string, id: string): string {
  const matches = [...text.matchAll(new RegExp(`<${tag} ${attr}="${id}"[^>]*>([\\s\\S]*?)</${tag}>`, "gu"))];
  expect(matches, id).toHaveLength(1);
  return matches[0]![1]!;
}
function replaceOnce(text: string, before: string, after: string): string {
  expect(text.split(before), before.slice(0, 80)).toHaveLength(2);
  const result = text.replace(before, after);
  expect(result.split(after), after.slice(0, 80)).toHaveLength(2);
  return result;
}
function wrapped(body: string): void {
  for (const line of body.split("\n")) expect(line.length).toBeLessThanOrEqual(118);
}

describe("owner-approved question 84: accepted lessons, 84a (2026-10-12)", () => {
  for (const protocol of ["hrp", "universal"] as const) {
    it(`chains only the recorded ${protocol} edits from the exact predecessor and derives its manifest`, async () => {
      const recorded = JSON.parse(await readFile(new URL(
        `tests/fixtures/protocol-edits/2026-10-12-accepted-lessons-${protocol}.json`, ROOT,
      ), "utf8")) as Record<string, Edits>;
      expect(Object.keys(recorded)).toEqual(["purpose", protocol]);
      const fixture = recorded[protocol]!;
      const previous = JSON.parse(await readFile(new URL(
        `tests/fixtures/protocol-edits/2026-10-12-${protocol === "hrp" ? "handoff-target" : "review-provenance"}.json`, ROOT,
      ), "utf8"))[protocol] as Edits;
      expect(fixture.from).toEqual(previous.to);
      expect(fixture.from).toEqual(PINS[protocol].from);
      expect(fixture.to).toEqual(PINS[protocol].to);
      expect(fixture.edits).toHaveLength(protocol === "hrp" ? 6 : 5);
      const current = await load(protocol);
      expect(XMLValidator.validate(current)).toBe(true);
      expect(current).toContain(`version="${fixture.to.version}" revisionDate="2026-10-12"`);
      expect(hash(current)).toBe(fixture.to.sha256);
      const prior = [...fixture.edits].reverse().reduce((text, [before, after]) => replaceOnce(text, after, before), current);
      expect(XMLValidator.validate(prior)).toBe(true);
      expect(prior).toContain(`version="${fixture.from.version}" revisionDate="2026-10-12"`);
      expect(hash(prior)).toBe(fixture.from.sha256);
      expect(fixture.edits.reduce((text, [before, after]) => replaceOnce(text, before, after), prior)).toBe(current);
      await expect((protocol === "hrp" ? undoAcceptedLessonsHrp : undoAcceptedLessonsUniversal)(await loadCurrent(protocol))).resolves.toBe(prior);
      const beforePrevious = [...previous.edits].reverse().reduce((text, [before, after]) => replaceOnce(text, after, before), prior);
      expect(hash(beforePrevious)).toBe(previous.from.sha256);
      await expect((protocol === "hrp" ? undoHandoffTarget : undoReviewProvenance)(await loadCurrent(protocol))).resolves.toBe(beforePrevious);
      await expect(getProtocolManifest(protocol)).resolves.toEqual({
        name: protocol === "hrp" ? "HRP" : "AskRigor.com universal saved instructions",
        version: protocol === "hrp" ? "20.6.32" : "20.5.46",
        revisionDate: protocol === "hrp" ? "2026-10-29" : "2026-10-21",
        sha256: hash(await loadCurrent(protocol)),
      });
    });
  }

  it("puts the exact Critical revisions first, preserving both older histories", async () => {
    for (const protocol of ["hrp", "universal"] as const) {
      const text = await load(protocol);
      const prior = await (protocol === "hrp" ? undoAcceptedLessonsHrp : undoAcceptedLessonsUniversal)(await loadCurrent(protocol));
      const tag = protocol === "hrp" ? "Revision" : "revision";
      const history = protocol === "hrp" ? "RevisionHistory" : "revision_history";
      const indent = protocol === "hrp" ? "  " : "";
      const body = element(text, tag, "version", PINS[protocol].to.version);
      expect(plain(body)).toBe(protocol === "hrp" ? APPROVED.hrpRevision : APPROVED.universalRevision);
      wrapped(body);
      const added = `${indent}<${tag} version="${PINS[protocol].to.version}" priority="Critical">${body}</${tag}>\n`;
      expect(section(prior, history).startsWith("\n")).toBe(true);
      expect(section(text, history)).toBe(`\n${added}${section(prior, history).slice(1)}`);
    }
  });

  it("changes only the approved self-resolution phrase, retaining the remainder of rule 9", async () => {
    const text = await load("universal");
    const prior = await undoAcceptedLessonsUniversal(await loadCurrent("universal"));
    const tag = "self_resolution_and_user_effort_minimization_gate";
    const oldLine = section(prior, tag).split("\n").filter((line) => line.startsWith("best exact action first and minimize the work."));
    expect(oldLine).toHaveLength(1);
    const changed = replaceOnce(oldLine[0]!, APPROVED.selfResolutionBefore, APPROVED.selfResolutionAfter);
    const expectedLine = changed.replace('“Next step: none — this task is complete.”', '“Next step:\nnone — this task is complete.”');
    expect(section(text, tag)).toBe(replaceOnce(section(prior, tag), oldLine[0]!, expectedLine));
  });

  it("adds only the exact one-line epistemic-phase rule 12 directly after rule 11", async () => {
    const text = await load("universal");
    const prior = await undoAcceptedLessonsUniversal(await loadCurrent("universal"));
    const old = section(section(prior, "epistemic_phase_router"), "rules");
    const rule11 = old.split("\n").filter((line) => line.startsWith("11. "));
    expect(rule11).toHaveLength(1);
    expect(section(section(text, "epistemic_phase_router"), "rules")).toBe(replaceOnce(old, rule11[0]!, `${rule11[0]}\n${APPROVED.phaseRule}`));
    expect(text.split(APPROVED.phaseRule)).toHaveLength(2);
  });

  it("qualifies only the forum-signal classification, keeping the paragraph on one line", async () => {
    const text = await load("universal");
    const prior = await undoAcceptedLessonsUniversal(await loadCurrent("universal"));
    const old = prior.split("\n").filter((line) => line.startsWith("For forum-signal checks,"));
    const current = text.split("\n").filter((line) => line.startsWith("For forum-signal checks,"));
    expect(old).toHaveLength(1);
    expect(current).toEqual([replaceOnce(old[0]!, APPROVED.forumBefore, APPROVED.forumAfter)]);
    expect(section(text, "sources")).toBe(replaceOnce(section(prior, "sources"), old[0]!, current[0]!));
  });

  it("places each exact Critical HRP rule immediately between its designated neighbours", async () => {
    const text = await load("hrp");
    for (const rule of APPROVED.rules) {
      expect(text).toMatch(new RegExp(`<Rule name="${rule.after}" priority="Critical">[^<]+</Rule>\\n\\n  <Rule name="${rule.id}" priority="Critical">`, "u"));
      expect(text).toMatch(new RegExp(`<Rule name="${rule.id}" priority="Critical">[^<]+</Rule>\\n\\n  <Rule name="${rule.next}" priority="Critical">`, "u"));
      const body = element(text, "Rule", "name", rule.id);
      expect(plain(body)).toBe(rule.text);
      wrapped(body);
    }
  });

  it("places the exact two stress cases in order immediately after HandoffTargetLost", async () => {
    const text = await load("hrp");
    const ids = ["HandoffTargetLost", ...APPROVED.cases.map((item) => item.id), "CodedFormulaLargeEffect"];
    for (let i = 1; i < ids.length; i++) {
      expect(text).toMatch(new RegExp(`<Case id="${ids[i - 1]}">[\\s\\S]*?</Case>\\n  <Case id="${ids[i]}">`, "u"));
    }
    for (const item of APPROVED.cases) {
      const body = element(text, "Case", "id", item.id);
      expect(body).toMatch(/^\s*<Prompt>[^<]+<\/Prompt>\s*<ExpectedBehavior>[^<]+<\/ExpectedBehavior>\s*$/u);
      expect(plain(section(body, "Prompt"))).toBe(item.prompt);
      expect(plain(section(body, "ExpectedBehavior"))).toBe(item.expected);
      wrapped(body);
    }
  });

  it("puts only the exact single-line checks FS224 and FS225 immediately after FS223", async () => {
    const text = await load("hrp");
    const prior = await undoAcceptedLessonsHrp(await loadCurrent("hrp"));
    const old = prior.split("\n").filter((line) => line.startsWith('  <Check id="FS223">'));
    expect(old).toHaveLength(1);
    const added = APPROVED.checks.map((item) => `  <Check id="${item.id}">${item.text}</Check>`).join("\n");
    expect(section(text, "FinalSelfCheck")).toBe(replaceOnce(section(prior, "FinalSelfCheck"), old[0]!, `${old[0]}\n${added}`));
    for (const item of APPROVED.checks) expect(element(text, "Check", "id", item.id)).toBe(item.text);
  });
});
