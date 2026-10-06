import { readFile } from "node:fs/promises";
import { XMLParser } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { loadProtocolSnapshot } from "@askrigor/protocol";

// These tests protect source/loader integrity, not model behavior or hidden routing.
describe("portable task-mode integration source contract", () => {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const expected = [
    ["TaskFitBeforeMode", "Respect an explicit model, effort, or mode preference"],
    ["ScopedCapabilityEvidence", "A component limitation is not a system-wide limitation"],
    ["SensoryEvidenceIntegrity", "Do not infer acoustic details from transcription"],
    ["ExposedControlOnly", "A handoff plan is not a completed handoff"],
    ["LossAwareHandoff", "material uncertainty, pending work, and required return format"],
    ["CoherentDelivery", "one coherent assistant experience"],
    ["BoundaryAndPersistenceTruth", "a failed memory write is not a successful save"],
  ];
  it.each(expected)("loads the %s obligation at the protocol consumer", async (name, phrase) => {
    const { text, manifest } = await loadProtocolSnapshot("universal");
    expect(manifest).toMatchObject({ version: "20.5.35", revisionDate: "2026-10-06" });
    const gate = parser.parse(text).Protocol.reasoning_selection.task_mode_integration;
    expect(gate["@_ruleId"]).toBe("portable.task-mode-integration.v1");
    expect(gate.rule.filter((rule: Record<string, string>) => rule["@_name"] === name)).toHaveLength(1);
    expect(gate.rule.find((rule: Record<string, string>) => rule["@_name"] === name)["#text"]).toContain(phrase);
  });
  it("preserves exact loaded bytes and activation/delivery boundaries", async () => {
    const snapshot = await loadProtocolSnapshot("universal");
    expect(snapshot.text).toBe(await readFile(new URL("../protocols/Universal_Instructions.xml", import.meta.url), "utf8"));
    const parsed = parser.parse(snapshot.text).Protocol;
    const gate = parsed.reasoning_selection.task_mode_integration;
    expect(gate.rule).toHaveLength(7);
    expect(gate.activation).toContain("reactivate after correction or context loss");
    expect(parsed.point_of_generation_checks).toContain("Task-mode integration check: Apply portable.task-mode-integration.v1");
    const boundary = gate.rule.find((rule: Record<string, string>) => rule["@_name"] === "BoundaryAndPersistenceTruth")["#text"];
    expect(boundary).toContain("behavioral guidance, not a runtime router");
    expect(boundary).toContain("Preserve all existing safety, privacy, source, protocol, and authorization gates");
  });
  it("keeps the portable extension independent of providers and internal infrastructure", async () => {
    const { text } = await loadProtocolSnapshot("universal");
    const gate = text.match(/<task_mode_integration [\s\S]*?<\/task_mode_integration>/u)?.[0];
    expect(gate).toBeDefined();
    for (const privateDependency of ["Mission Control", "universal-dev-architecture", "GPT-Live-1", "GPT-6", "/home/", "deviceId"])
      expect(gate).not.toContain(privateDependency);
  });
});
