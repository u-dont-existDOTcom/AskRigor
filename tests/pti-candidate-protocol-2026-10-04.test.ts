import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import { loadProtocolSectionSnapshot } from "@askrigor/protocol";

const ROOT = new URL("../", import.meta.url);

async function sectionText(protocol: "hrp" | "universal", name: string): Promise<string> {
  const { text, sections } = await loadProtocolSectionSnapshot(protocol);
  const matches = sections.filter((section) => section.name === name);
  expect(matches, name).toHaveLength(1);
  const [section] = matches;
  return Buffer.from(text, "utf8").subarray(section!.byte_start, section!.byte_end_exclusive).toString("utf8");
}

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

const squash = (text: string) => text.replace(/\s+/gu, " ");

// The PTI development lane (2026-10-04): candidate Universal 20.5.35 and HRP 20.6.11, pending the owner's approval
// of the exact text. The chain tests undo the recorded edits to the prior bytes; these check what the edits put where.
describe("PTI candidate: proactive troubleshooting", () => {
  it("adds the two checks at the end of the evidence-discrimination gate, once each", async () => {
    const gate = await sectionText("universal", "evidence_discrimination_gate");
    for (const check of ["discriminating_action_check", "matched_endpoint_and_attribution_check"]) {
      expect(occurrences(gate, `<${check} priority="Critical">`), check).toBe(1);
    }
    expect(gate).toMatch(
      /<\/specificity_check>\n\n<discriminating_action_check priority="Critical">\n[^<]+\n<\/discriminating_action_check>\n\n<matched_endpoint_and_attribution_check priority="Critical">\n[^<]+\n<\/matched_endpoint_and_attribution_check>\n<\/evidence_discrimination_gate>/u,
    );
    const text = squash(gate);
    expect(text).toContain("propose that action instead of only extending the list of explanations");
    expect(text).toContain("including a benign or no-fault one");
    expect(text).toContain("prefer one that could refute the leading explanation");
    expect(text).toContain("Do not repeat an action the user already tried unless a material change makes it a different test.");
    expect(text).toContain("test there first and keep serious or systemic possibilities in reserve, unless a red flag is present");
    expect(text).toContain("its absence without that condition is not recovery");
    expect(text).toContain("the supported result is that the combination worked here");
    expect(text).toContain("an unproven mechanism is no reason to withhold it");
  });

  it("keeps self-tests safe and escalates instead when they are not", async () => {
    const gate = squash(await sectionText("universal", "evidence_discrimination_gate"));
    expect(gate).toContain(
      "Never propose a self-test that risks injury, severe irritation, re-exposure to a suspected allergen or drug, a medication change, ingestion, toxic exposure, extreme heat or cold, electrical or mechanical danger, or delay of urgent care; when a red flag is present or no safe reversible test exists, escalate instead.",
    );
    const hrp = await sectionText("hrp", "PatientHistoryAndRecurrenceEvidenceGate");
    const rule = squash(hrp.match(/<Rule name="SafeDiscriminatingSelfTest" priority="Critical">[^<]+<\/Rule>/u)?.[0] ?? "");
    expect(rule).toContain(
      "Never propose re-exposure to a suspected allergen or drug, starting, stopping or changing a medication, ingestion, intentional injury, extreme heat or cold, or anything that delays urgent care; with red flags, escalate instead.",
    );
    expect(rule).toContain("A matched re-provocation is only for a harmless trigger");
  });

  it("is reachable from an always-loaded section and the section index", async () => {
    // reasoning_style is a core section, so every AskRigor task sees the pointer; the gate's purpose is its index
    // summary, so a troubleshooting question can find the gate itself.
    const { sections } = await loadProtocolSectionSnapshot("universal");
    expect(sections.find(({ name }) => name === "reasoning_style")?.core).toBe(true);
    expect(squash(await sectionText("universal", "reasoning_style"))).toContain(
      "When the cause of a practical problem is uncertain, lead early with the safe, reversible test or action that best tells the explanations apart or fixes the problem, rather than only listing explanations, and judge it by recreating the same provocation (evidence_discrimination_gate).",
    );
    // The index cuts summaries at 240 characters; the added clause must fit whole.
    expect(sections.find(({ name }) => name === "evidence_discrimination_gate")?.summary).toMatch(
      /, and choose a safe, discriminating next test or fix\.$/u,
    );
  });

  it("feeds the constraint map and the self-check", async () => {
    const universal = await readFile(new URL("protocols/Universal_Instructions.xml", ROOT), "utf8");
    expect(squash(universal)).toContain(
      "discriminating negative or tolerated comparisons, what provokes the problem as distinct from what only removes the trigger, and each intervention already tried with its result.",
    );
    expect(occurrences(universal, "Next-action check:")).toBe(1);
    expect(universal).toMatch(/\nNext-action check: [^\n]+\n\nHeuristic-attractor check:/u);
  });

  it("adds the HRP rule, regression case and final check directly after their neighbors", async () => {
    const hrp = await readFile(new URL("protocols/HRP_Full.xml", ROOT), "utf8");
    for (const [neighbor, added] of [
      ['<Rule name="HealthFollowUpInformationGain"', '<Rule name="SafeDiscriminatingSelfTest"'],
      ['<RegressionCase id="ImageOverridesLongitudinalHistory">', '<RegressionCase id="PressureProvokedSkinRetest">'],
      ['<Check id="FS211">', '<Check id="FS212">'],
    ] as const) {
      expect(occurrences(hrp, added), added).toBe(1);
      const start = hrp.indexOf(neighbor);
      const next = hrp.indexOf(added.slice(0, added.indexOf(" ")), start + 1);
      expect(hrp.slice(next).startsWith(added), added).toBe(true);
    }
    const regression = squash(hrp.match(/<RegressionCase id="PressureProvokedSkinRetest">[\s\S]*?<\/RegressionCase>/u)?.[0] ?? "");
    expect(regression).toContain("Treat getting up as removal of the trigger, not recovery.");
    expect(regression).toContain("natural, no-lye soap");
    expect(regression).toContain("do not establish detergent residue, exfoliation, barrier damage or another mechanism");
  });

  it("marks both revisions as candidates for the owner's approval", async () => {
    const [universal, hrp] = await Promise.all([
      readFile(new URL("protocols/Universal_Instructions.xml", ROOT), "utf8"),
      readFile(new URL("protocols/HRP_Full.xml", ROOT), "utf8"),
    ]);
    expect(universal).toContain(
      '<revision_history>\n<revision version="20.5.35" priority="Critical">\nCandidate for owner approval (PTI development lane, 2026-10-04)',
    );
    expect(hrp).toContain(
      ' <RevisionHistory>\n  <Revision version="20.6.11" priority="Critical">\n   Candidate for owner approval (PTI development lane, 2026-10-04)',
    );
  });
});
