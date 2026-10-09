import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import { getProtocolManifest, loadProtocolSectionSnapshot } from "@askrigor/protocol";

const ROOT = new URL("../", import.meta.url);
const squash = (text: string) => text.replace(/\s+/gu, " ").trim();
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

async function sectionText(name: string): Promise<string> {
  const { text, sections } = await loadProtocolSectionSnapshot("hrp");
  const matches = sections.filter((section) => section.name === name);
  expect(matches, name).toHaveLength(1);
  const [section] = matches;
  return Buffer.from(text, "utf8").subarray(section!.byte_start, section!.byte_end_exclusive).toString("utf8");
}

function rule(text: string, name: string): string {
  const matches = [...text.matchAll(new RegExp(`<Rule name="${name}"[^>]*>([\\s\\S]*?)</Rule>`, "gu"))];
  expect(matches, name).toHaveLength(1);
  return squash(matches[0]![1]!);
}

// Sections A–E of the owner's 2026-10-07 draft only, approved by the owner (question 46),
// reapplied unchanged above main's HRP 20.6.13 as 20.6.14. The recorded edits preserve all other bytes.
describe("full-text candidate: exact public-copy discovery and truthful access states", () => {
  it("records reversible edits to the prior canonical bytes and derives the new manifest from the same bytes", async () => {
    const hrp = await readFile(new URL("protocols/HRP_Full.xml", ROOT), "utf8");
    const { hrp: fixture } = JSON.parse(await readFile(
      new URL("tests/fixtures/protocol-edits/2026-10-07-full-text-candidate.json", ROOT), "utf8",
    )) as { hrp: { from: { version: string; sha256: string }; to: { version: string; sha256: string }; edits: Array<[string, string]> } };
    const { hrp: lane } = JSON.parse(await readFile(
      new URL("tests/fixtures/protocol-edits/2026-10-09-lane-wording.json", ROOT), "utf8",
    )) as { hrp: { to: { version: string; sha256: string } } };
    expect(fixture.from).toEqual(lane.to);
    expect(fixture.edits).toHaveLength(7);
    expect(fixture.to.version).toBe("20.6.14");
    expect(sha256(hrp)).toBe(fixture.to.sha256);
    const prior = [...fixture.edits].reverse().reduce((current, [before, after]) => {
      expect(current.split(after), after.slice(0, 60)).toHaveLength(2);
      return current.replace(after, before);
    }, hrp);
    expect(sha256(prior)).toBe(fixture.from.sha256);
    expect(prior).toContain('<Protocol name="HRP" version="20.6.13" revisionDate="2026-10-09"');
    expect(sha256(prior)).toBe("b6e2b08322c52678520b3154a8058063ea3f1a049d0980b348b987c6d8bef3fa");
    const reapplied = fixture.edits.reduce((current, [before, after]) => {
      expect(current.split(before), before.slice(0, 60)).toHaveLength(2);
      return current.replace(before, after);
    }, prior);
    expect(reapplied).toBe(hrp);
    await expect(getProtocolManifest("hrp")).resolves.toEqual({
      name: "HRP", version: "20.6.14", revisionDate: "2026-10-09", sha256: fixture.to.sha256,
    });
    await expect(getProtocolManifest("universal")).resolves.toEqual({
      name: "AskRigor.com universal saved instructions", version: "20.5.37", revisionDate: "2026-10-09",
      sha256: "342e32e1568954ed62a8b53d75d1ad0efe39cba8d9ad7d143658f02dded169bb",
    });
  });

  it("replaces the escalation's first paragraph in place while preserving the lawful handoff paragraph", async () => {
    const text = rule(await sectionText("UniversalFullTextAcquisitionProtocol"), "MandatoryProviderNeutralFullTextEscalation");
    for (const sentence of [
      "A failed, rate-limited, or unavailable route is a route failure, not evidence that no open copy exists.",
      "the exact title in quotes, the DOI, PMID, and PII, and the exact title with the first author or year",
      "A search hit is discovery, never evidence.",
      "identity-checked against the exact study (its DOI or PII, or its exact title with the first author or year)",
      "its methods, results, and discussion or conclusions are readable.",
      "A different paper, a review quoting the study, an abstract-only page, and a login page never count.",
      "Record each copy's provenance (identity check, retrieved address and route, source class, completeness, sections observed, and time).",
      "a verified full text from a lower class beats an abstract from a higher one.",
      "acquire_open_full_text, given the copies found as candidate_urls and the exact searches as public_copy_search; continue_open_full_text until exhausted",
      "which the server signs only after the exact public-copy search is recorded and no route failed.",
      "If access still fails, record the exact studies in priority order",
      "Failure to obtain it never freezes unrelated executable research or justifies treating unseen content as evidence.",
    ]) expect(text).toContain(sentence);
  });

  it("replaces the access classification and the sweep parenthetical inside their existing rules", async () => {
    const access = rule(await sectionText("UniversalFullTextAcquisitionProtocol"), "FullTextAccessStatusClassification");
    expect(access).toContain("identified but inaccessible, such as behind a login or a paywall or in print only");
    expect(access).toContain("a public copy found but its fetch blocked; no copy found after the exact search; a provider or route failure; or identity unresolved.");
    expect(access).toContain("Never merge these states, and never report a route failure or a blocked fetch as inaccessibility.");
    const sweep = rule(await sectionText("ExtendedHumanEvidenceAndGreyLiteratureSweep"), "DecisionCriticalFullTextEscalationWithinSweep");
    expect(sweep).toContain("(on connector runs, acquire_open_full_text makes the lawful repository and DOI open-access attempts, then verifies the public copies an exact search finds; MandatoryProviderNeutralFullTextEscalation)");
    expect(sweep).toContain("keep the claim-local uncertainty, and continue all unrelated executable work.");
    expect(sweep).not.toContain("returns possibly_useful_lead when they fail");
  });

  it("places four Prompt/ExpectedBehavior stress cases directly after ManyPagesOneTrial", async () => {
    const cases = await sectionText("StressTestExpectations");
    const ids = ["OpenAccessRouteOutage", "RelatedPaperPublicCopy", "ChallengeBlockedRepositoryCopy", "FullTextChangesTheArm"];
    const expected = [
      "Record route failures, not inaccessibility",
      "Refuse both as identity mismatches, since neither is the study's own text",
      "Report a copy found but its fetch blocked, not inaccessible",
      "bind each claim to the exact intervention and model the full text shows",
    ];
    let neighbor = "ManyPagesOneTrial";
    for (const [index, id] of ids.entries()) {
      expect(cases.split(`<Case id="${id}">`), id).toHaveLength(2);
      expect(cases).toMatch(new RegExp(`<Case id="${neighbor}">[\\s\\S]*?</Case>\\s*<Case id="${id}">`, "u"));
      const added = cases.match(new RegExp(`<Case id="${id}">[\\s\\S]*?</Case>`, "u"))![0];
      expect(added).toMatch(/<Prompt>[\s\S]+?<\/Prompt>\s*<ExpectedBehavior>[\s\S]+?<\/ExpectedBehavior>/u);
      expect(squash(added)).toContain(expected[index]);
      neighbor = id;
    }
    expect(squash(cases)).toContain("do not cite the trial as unreadable until the search is recorded and no route failed.");
    expect(squash(cases)).toContain("never past a login or paywall");
    expect(squash(cases)).toContain("L-DOPA with carbidopa");
    expect(squash(cases)).toContain("test-tube study of a purified animal enzyme");
  });

  it("places FS213 between FS212 and FS214 and records the newest owner-approved revision", async () => {
    const checks = await sectionText("FinalSelfCheck");
    expect(checks.split('<Check id="FS213">')).toHaveLength(2);
    expect(checks).toMatch(/<Check id="FS212">[^<]+<\/Check>\s*<Check id="FS213">[^<]+<\/Check>\s*<Check id="FS214">/u);
    expect(checks).toContain('<Check id="FS213">Every decision-critical study without admitted full text went through the open-access routes and an exact public-copy search, and its access state is named truthfully, never calling a route failure or a blocked fetch inaccessible (MandatoryProviderNeutralFullTextEscalation).</Check>');
    const hrp = await readFile(new URL("protocols/HRP_Full.xml", ROOT), "utf8");
    expect(hrp).toContain(' <RevisionHistory>\n  <Revision version="20.6.14" priority="Critical">\n   Owner-approved, question 46 (directive of 2026-10-07)');
    expect(hrp).toMatch(/<Revision version="20\.6\.14" priority="Critical">[^<]+<\/Revision>\s*<Revision version="20\.6\.13" priority="Critical">/u);
  });
});
