import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { loadProtocol, loadProtocolSectionSnapshot, protocolSections } from "../packages/protocol/src/index.js";
import { OPTIONS_FROM_LIVING_TRADITIONS_CASE_IDS, undoOptionsFromLivingTraditions }
  from "./helpers/undo-options-from-living-traditions.js";

const PURPOSE = "Load for traditional, regional or folk medicine, named or not, and open options for health problems or goals. Retrieve traditions' own accounts and differences; check empirical claims against current evidence.";
const LANDSCAPE_PURPOSE = "Load for treatment choices, alternatives, comparisons and first-pass study searches. Inventory relevant classes before selection; for video research, also enforce selection breadth and per-video depth.";
const SEPARATION = "This gate governs selection-space adequacy; CommunityCorpusCompletionGate separately governs acquisition depth for each selected discussion pool.";
const RULE = `  <Rule name="OptionsFromLivingTraditions" priority="Critical">
   Apply to open requests for ways to address a health problem or goal, in any language, for oneself or another person,
   whether or not a tradition or treatment is mentioned. Do not widen requests confined to a named treatment, diagnosis,
   administrative matter or lookup; honour explicit topic and source limits. If source limits exclude traditional
   accounts, skip that source search; check eligible candidates within the permitted evidence.
   First scan relevant living traditions; begin with two or three where relevant, selected using documented
   outcome-specific use, stated preferences or access, and distinct approaches, including nonbotanical practices. Record
   selection and gaps; expand for omitted leads that could materially change the answer. Never infer identity or invent
   popularity.
   Retrieve attributed accounts using this module's sourcing rules; use the existing treatment inventory and evidence
   checks without duplicating work. Match preparations and populations; apply
   PatientSpecificInterventionSafetyReconciliationGate, SafestOptionsFirst and ResearchNotPrescription. Preserve
   indicated care.
   Present decision-relevant options and exclusions with their evidence and safety states; documented use alone is not
   an outcome signal. Do not label unsearched, inaccessible, inconclusive, ineffective or harmful candidates
   "untested". Deduplicate shared options, attribute traditions, and briefly state search limits.
   Do not add this search during an emergency; SafetyAndScopeGate still governs urgent care and any separately raised
   adjunct question.
  </Rule>`;
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

describe("HRP 20.6.46: open options from living traditions (owner answer 410b)", () => {
  it("preserves the approved rule bytes immediately after TraditionOwnAccount", async () => {
    const { text, manifest } = await loadProtocolSectionSnapshot("hrp");
    expect(manifest).toMatchObject({ version: "20.6.46", revisionDate: "2026-11-22" });
    expect(text).toContain(`  </Rule>
${RULE}
  <Rule name="WhichTradition"`);
    expect(text.split(RULE)).toHaveLength(2);
    const own = text.indexOf('<Rule name="TraditionOwnAccount"');
    expect(text.indexOf(RULE)).toBe(text.indexOf("  </Rule>", own) + "  </Rule>\n".length);
    expect(text.replace(/\s+/gu, " ")).toContain("heterodox or adjunct approaches; traditional, regional or folk options " +
      "(TraditionalSystemAccount/OptionsFromLivingTraditions); procedures and surgery;");
    expect(text.indexOf('<Revision version="20.6.46"')).toBeLessThan(text.indexOf('<Revision version="20.6.45"'));
  });

  it("keeps both approved Purpose openings in the section index and preserves the core bytes", async () => {
    const { text, sections } = await loadProtocolSectionSnapshot("hrp");
    const sectionText = (name: string): string => {
      const section = sections.find((value) => value.name === name)!;
      return Buffer.from(text).subarray(section.byte_start, section.byte_end_exclusive).toString("utf8");
    };
    const purposeOf = (name: string): string => /<Purpose>([\s\S]*?)<\/Purpose>/u
      .exec(sectionText(name))![1]!.replace(/\s+/gu, " ").trim();
    expect(purposeOf("TraditionalSystemAccount")).toBe(PURPOSE);
    expect(PURPOSE).toHaveLength(209);
    expect(sections.find(({ name }) => name === "TraditionalSystemAccount"))
      .toMatchObject({ core: false, runtime: true, summary: PURPOSE });
    expect(purposeOf("TreatmentLandscapeAndVideoSelectionGate")).toBe(`${LANDSCAPE_PURPOSE} ${SEPARATION}`);
    const summary = sections.find(({ name }) => name === "TreatmentLandscapeAndVideoSelectionGate")!.summary;
    expect(summary).toHaveLength(240);
    expect(summary.startsWith(LANDSCAPE_PURPOSE)).toBe(true);
    const previous = protocolSections("hrp", undoOptionsFromLivingTraditions(text));
    const core = sections.filter(({ core }) => core);
    expect(core.reduce((sum, section) => sum + section.bytes, 0)).toBe(39_983);
    expect(core.map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 })))
      .toEqual(previous.filter(({ core }) => core).map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 })));
  });

  it("keeps eleven distinct stress cases outside the runtime sections", async () => {
    const { text, sections } = await loadProtocolSectionSnapshot("hrp");
    const stress = sections.find(({ name }) => name === "StressTestExpectations")!;
    expect(stress.runtime).toBe(false);
    const cases = Buffer.from(text).subarray(stress.byte_start, stress.byte_end_exclusive).toString("utf8");
    expect(OPTIONS_FROM_LIVING_TRADITIONS_CASE_IDS).toHaveLength(11);
    for (const id of OPTIONS_FROM_LIVING_TRADITIONS_CASE_IDS) {
      const found = [...cases.matchAll(new RegExp(`<Case id="${id}">([\\s\\S]*?)<\\/Case>`, "gu"))];
      expect(found, id).toHaveLength(1);
      expect(found[0]![1]).toMatch(/<Prompt>[\s\S]+<\/Prompt>\s*<ExpectedBehavior>[\s\S]+<\/ExpectedBehavior>/u);
    }
  });

  it("reconstructs every previous HRP byte and is idempotent", async () => {
    const previous = undoOptionsFromLivingTraditions(await loadProtocol("hrp"));
    expect(hash(previous)).toBe("475ee5aad42fdc0bba03f786eefa4e19bc17cd9b95f4ddd7e4aef3a600c54039");
    expect(undoOptionsFromLivingTraditions(previous)).toBe(previous);
  });
});
