import { undoCorrectionReport, undoDiminishingReturns } from "./helpers/undo-read-depth.js";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { getProtocolManifest } from "@askrigor/protocol";

const ROOT = new URL("../", import.meta.url);
const parser = new XMLParser({ parseTagValue: false });
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
interface Edits {
  from: { version: string; sha256: string }; to: { version: string; sha256: string };
  edits: Array<[string, string]>;
}
// Independent exact owner-approved question 71: "71 a", 2026-10-11.
const APPROVED = {
  "urevision": "Owner-approved, question 71 (2026-10-11): added ToolListCurrency, which compares the AskRigor tool list's versions with the loaded protocols at the start of research and tells the user before researching when the tool list is out of date.",
  "hrevision": "Owner-approved, question 71 (2026-10-11): added StudyReadDepthDisclosure, which says beside each supporting study what was actually read and whether its method audit was validated, with stress case CrossTrialResponderRatio and final check FS220.",
  "urule": "At the start of research, compare the versions named at the top of the AskRigor tool list with the protocol versions just loaded. If the tool list is older, tell the user before researching: this chat's AskRigor tools are out of date, newer checks cannot run in it, and a new chat or a refreshed connector fixes that. Continue in this chat only if the user chooses to, and then say which checks could not run.",
  "hrule": "When a study supports a treatment claim or a ranking, say beside the claim, or in the same evidence table, what was actually read: the full text with its methods and results, extracted or partial text, the abstract, a conference abstract, or only a secondary description; and whether its method audit was validated. A full text that is available has not therefore been read, and a full text read has not therefore been audited. A review read in full does not make the studies it cites read. If the status is unknown, say so; never imply a fuller reading than happened.",
  "prompt": "One herbal trial reports a 29-point gain in responders but an 11-point severity change on a 0–500 scale; a different drug's trials report a 9-point responder gain. The user asks whether the herb is about three times as effective.",
  "expected": "Refuse the three-times claim across trials with different populations and endpoint definitions; show the responder difference and the severity change with its scale side by side; treat the herb as a weak or unclear effect, not a high-impact finding.",
  "check": "No ratio or 'times as effective' comparison was drawn across studies unless their estimands, endpoint definitions and populations are comparable, and a responder gain was shown together with any continuous severity change and its scale (ComparisonEstimandAndDoseExposureIntegrityGate)."
} as const;
const plain = (text: string) => (parser.parse(`<text>${text}</text>`).text as string).replace(/\s+/gu, " ").trim();
function element(text: string, tag: string, attribute: string, value: string): string {
  const matches = [...text.matchAll(new RegExp(`<${tag} ${attribute}="${value}"[^>]*>([\\s\\S]*?)</${tag}>`, "gu"))];
  expect(matches).toHaveLength(1);
  return matches[0]![1]!;
}
function replaceOnce(text: string, before: string, after: string): string {
  expect(text.split(before)).toHaveLength(2);
  const result = text.replace(before, after);
  expect(result.split(after)).toHaveLength(2);
  return result;
}
const files = { hrp: "HRP_Full.xml", universal: "Universal_Instructions.xml" } as const;
const loadCurrent = (protocol: keyof typeof files) => readFile(new URL(`protocols/${files[protocol]}`, ROOT), "utf8");
const load = async (protocol: keyof typeof files) => {
  const text = await loadCurrent(protocol);
  return protocol === "hrp" ? undoDiminishingReturns(text) : undoCorrectionReport(text);
};

describe("question 71: all four wordings and the read-depth check", () => {
  it("chains both reversible edits and derives both current manifests from the canonical bytes", async () => {
    const recorded = JSON.parse(await readFile(new URL("tests/fixtures/protocol-edits/2026-10-11-read-depth.json", ROOT), "utf8")) as { purpose: string; hrp: Edits; universal: Edits };
    expect(Object.keys(recorded)).toEqual(["purpose", "hrp", "universal"]);
    for (const protocol of ["hrp", "universal"] as const) {
      const fixture = recorded[protocol];
      const previousFile = protocol === "hrp" ? "2026-10-11-lab-preparation.json" : "2026-10-09-lane-wording.json";
      const previous = JSON.parse(await readFile(new URL(`tests/fixtures/protocol-edits/${previousFile}`, ROOT), "utf8"))[protocol] as Edits;
      expect(fixture.from).toEqual(previous.to);
      expect(fixture.from).toEqual(protocol === "hrp"
        ? { version: "20.6.16", sha256: "4def8d4e1f510f3ffc19b59ae085087151202d2c5f6998fa357995a51e6681fc" }
        : { version: "20.5.37", sha256: "342e32e1568954ed62a8b53d75d1ad0efe39cba8d9ad7d143658f02dded169bb" });
      expect(fixture.to.version).toBe(protocol === "hrp" ? "20.6.17" : "20.5.38");
      expect(fixture.edits).toHaveLength(protocol === "hrp" ? 5 : 3);
      const current = await load(protocol);
      expect(XMLValidator.validate(current)).toBe(true);
      expect(hash(current)).toBe(fixture.to.sha256);
      const prior = [...fixture.edits].reverse().reduce((text, [before, after]) => replaceOnce(text, after, before), current);
      expect(XMLValidator.validate(prior)).toBe(true);
      expect(hash(prior)).toBe(fixture.from.sha256);
      expect(fixture.edits.reduce((text, [before, after]) => replaceOnce(text, before, after), prior)).toBe(current);
      await expect(getProtocolManifest(protocol)).resolves.toEqual({
        name: protocol === "hrp" ? "HRP" : "AskRigor.com universal saved instructions",
        version: protocol === "hrp" ? "20.6.26" : "20.5.43",
        revisionDate: protocol === "hrp" ? "2026-10-16" : "2026-10-15",
        sha256: hash(await loadCurrent(protocol)),
      });
    }
  });
  it("places the exact Universal rule after item 6 and before the completion paragraph", async () => {
    const text = await load("universal");
    const gate = text.match(/<canonical_protocol_execution_gate>[\s\S]*?<\/canonical_protocol_execution_gate>/u)![0];
    expect(gate).toMatch(/6\. Higher reasoning mode does not substitute[^\n]+\n<rule name="ToolListCurrency" priority="Critical">[^<]+<\/rule>\n\nFor a completed HRP analysis/u);
    const body = element(gate, "rule", "name", "ToolListCurrency");
    expect(plain(body)).toBe(APPROVED.urule);
    for (const line of body.split("\n")) expect(line.length).toBeLessThanOrEqual(118);
  });
  it("places the exact HRP rule directly after full-text access classification", async () => {
    const text = await load("hrp");
    expect(text).toMatch(/<Rule name="FullTextAccessStatusClassification"[^>]*>[^<]+<\/Rule>\n\n  <Rule name="StudyReadDepthDisclosure" priority="Critical">/u);
    const body = element(text, "Rule", "name", "StudyReadDepthDisclosure");
    expect(plain(body)).toBe(APPROVED.hrule);
    for (const line of body.split("\n")) expect(line.length).toBeLessThanOrEqual(118);
  });
  it("places the exact stress case after LipidPanelAfterDryFasting", async () => {
    const text = await load("hrp");
    expect(text).toMatch(/<Case id="LipidPanelAfterDryFasting">[\s\S]*?<\/Case>\n  <Case id="CrossTrialResponderRatio">/u);
    const body = element(text, "Case", "id", "CrossTrialResponderRatio");
    expect(body).toMatch(/^\s*<Prompt>[^<]+<\/Prompt>\s*<ExpectedBehavior>[^<]+<\/ExpectedBehavior>\s*$/u);
    expect(plain(body.match(/<Prompt>([^<]+)<\/Prompt>/u)![1]!)).toBe(APPROVED.prompt);
    expect(plain(body.match(/<ExpectedBehavior>([^<]+)<\/ExpectedBehavior>/u)![1]!)).toBe(APPROVED.expected);
    for (const line of body.split("\n")) expect(line.length).toBeLessThanOrEqual(118);
  });
  it("places the exact single-line FS220 after FS219", async () => {
    const text = await load("hrp");
    expect(text).toMatch(/<Check id="FS219">[^\n<]+<\/Check>\n  <Check id="FS220">[^\n<]+<\/Check>/u);
    expect(plain(element(text, "Check", "id", "FS220"))).toBe(APPROVED.check);
  });
  it("places both exact revisions first above the previous versions", async () => {
    for (const protocol of ["hrp", "universal"] as const) {
      const text = await load(protocol), hrp = protocol === "hrp";
      const tag = hrp ? "Revision" : "revision", history = hrp ? "RevisionHistory" : "revision_history";
      const version = hrp ? "20.6.17" : "20.5.38", prior = hrp ? "20.6.16" : "20.5.37";
      expect(text).toMatch(new RegExp(`<${history}>\\s*<${tag} version="${version}" priority="Critical">[^<]+</${tag}>\\s*<${tag} version="${prior}" priority="Critical">`, "u"));
      const body = element(text, tag, "version", version);
      expect(plain(body)).toBe(hrp ? APPROVED.hrevision : APPROVED.urevision);
      for (const line of body.split("\n")) expect(line.length).toBeLessThanOrEqual(118);
    }
  });
});
