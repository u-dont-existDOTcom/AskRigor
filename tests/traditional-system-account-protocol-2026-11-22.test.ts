import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { loadProtocol, loadProtocolSectionSnapshot, PROTOCOL_PAGE_MAX_BYTES } from "../packages/protocol/src/index.js";
import { TRADITIONAL_SYSTEM_CASE_IDS, undoTraditionalSystemAccount } from "./helpers/undo-traditional-system-account.js";

const PURPOSE = "Load for traditional, regional or folk medical concepts, claims, remedies, diagnoses, practices and " +
  "safety, named or not. Find the traditions' own accounts and relevant differences; check empirical health claims " +
  "against current evidence.";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

describe("HRP 20.6.45: the tradition's own account (owner answer 402a)", () => {
  it("preserves the approved module bytes, placement and single core pointer", async () => {
    const { text, sections, manifest } = await loadProtocolSectionSnapshot("hrp");
    expect(manifest).toMatchObject({ version: "20.6.45", revisionDate: "2026-11-22" });
    const module = /^ <TraditionalSystemAccount priority="Critical">[\s\S]*?^ <\/TraditionalSystemAccount>/mu.exec(text)?.[0];
    expect(module).toBeDefined();
    // SHA-256 of the owner's approved XML block, including its indentation and internal newlines.
    expect(hash(module!)).toBe("b942d5eb87758a9eba34b14b71c3d5921d67b3a8d4d50af5ed928f848daa9a34");
    expect(text).toContain(` </EthnobotanicalSpecificity>\n\n${module}\n\n <NeglectedInterventionModules`);
    expect(text.split("historical safety use; load TraditionalSystemAccount.")).toHaveLength(2);
    expect(sections.find(({ name }) => name === "EvidenceLayers")?.core).toBe(true);
    expect(text.indexOf('<Revision version="20.6.45"')).toBeLessThan(text.indexOf('<Revision version="20.6.44"'));
  });

  it("keeps the entire Purpose visible in the index and the always-loaded core under its cap", async () => {
    const { sections } = await loadProtocolSectionSnapshot("hrp");
    const section = sections.find(({ name }) => name === "TraditionalSystemAccount");
    expect(section).toMatchObject({ core: false, runtime: true, summary: PURPOSE });
    expect(section!.summary).toHaveLength(237);
    const coreBytes = sections.filter(({ core }) => core).reduce((sum, section) => sum + section.bytes, 0);
    expect(coreBytes).toBe(39_983);
    expect(coreBytes).toBeLessThanOrEqual(PROTOCOL_PAGE_MAX_BYTES);
  });

  it("includes all twelve short stress cases in the non-runtime section", async () => {
    const { text, sections } = await loadProtocolSectionSnapshot("hrp");
    const stress = sections.find(({ name }) => name === "StressTestExpectations")!;
    expect(stress.runtime).toBe(false);
    const cases = Buffer.from(text).subarray(stress.byte_start, stress.byte_end_exclusive).toString("utf8");
    for (const id of TRADITIONAL_SYSTEM_CASE_IDS) {
      const found = [...cases.matchAll(new RegExp(`<Case id="${id}">([\\s\\S]*?)<\\/Case>`, "gu"))];
      expect(found).toHaveLength(1);
      expect(found[0]![1]).toMatch(/<Prompt>[\s\S]+<\/Prompt>\s*<ExpectedBehavior>[\s\S]+<\/ExpectedBehavior>/u);
    }
  });

  it("rewinds only this change to the exact previous canonical bytes for historical fixtures", async () => {
    const previous = undoTraditionalSystemAccount(await loadProtocol("hrp"));
    expect(hash(previous)).toBe("a486702b879aba2ce729482eabd5474f4ef0afa7e7b7c3efe57751e8103485ee");
    expect(undoTraditionalSystemAccount(previous)).toBe(previous);
  });
});
