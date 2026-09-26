import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  coreSectionNames,
  loadProtocolSectionSnapshot,
  PROTOCOL_PAGE_MAX_BYTES,
  protocolSections,
  protocolTextPage
} from "../packages/protocol/src/index.js";

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

describe("protocol sections", () => {
  it.each([
    ["hrp", "HRP_Full.xml", 60],
    ["universal", "Universal_Instructions.xml", 39]
  ] as const)("maps every top-level %s element to its exact canonical bytes", async (name, file, count) => {
    const bytes = await readFile(new URL(`../protocols/${file}`, import.meta.url));
    const { sections, manifest } = await loadProtocolSectionSnapshot(name);

    expect(manifest.sha256).toBe(sha256(bytes));
    expect(sections).toHaveLength(count);
    let previousEnd = 0;
    for (const section of sections) {
      const slice = bytes.subarray(section.byte_start, section.byte_end_exclusive);
      const text = slice.toString("utf8");
      expect(section.byte_start).toBeGreaterThanOrEqual(previousEnd);
      expect(text.startsWith(`<${section.name}`)).toBe(true);
      expect(text.endsWith(`</${section.name}>`) || text.endsWith("/>")).toBe(true);
      expect(section.sha256).toBe(sha256(slice));
      expect(section.summary.length).toBeGreaterThan(0);
      expect(section.summary.length).toBeLessThanOrEqual(240);
      previousEnd = section.byte_end_exclusive;
    }
    const between = sections.slice(1).map((section, index) =>
      bytes.subarray(sections[index]!.byte_end_exclusive, section.byte_start).toString("utf8")
    );
    for (const gap of between) {
      expect(gap.replace(/<!--[\s\S]*?-->/gu, "").trim()).toBe("");
    }
    for (const core of coreSectionNames(name)) {
      expect(sections.find((section) => section.name === core)?.core).toBe(true);
    }
  });

  it("marks maintainer material as not needed at runtime", async () => {
    const hrp = await loadProtocolSectionSnapshot("hrp");
    const universal = await loadProtocolSectionSnapshot("universal");

    expect(hrp.sections.filter((section) => !section.runtime).map(({ name }) => name)).toEqual([
      "RevisionHistory",
      "VersionDiscipline",
      "ReleasePackagingRequirements",
      "StressTestExpectations"
    ]);
    expect(universal.sections.filter((section) => !section.runtime).map(({ name }) => name)).toEqual([
      "revision_history"
    ]);
    expect(hrp.sections.every((section) => !(section.core && !section.runtime))).toBe(true);
  });

  it("pages text losslessly within the page limit", async () => {
    const bytes = await readFile(new URL("../protocols/HRP_Full.xml", import.meta.url));
    const first = protocolTextPage(bytes, 1);
    const pages = Array.from({ length: first.page_count }, (_, index) =>
      protocolTextPage(bytes, index + 1)
    );

    expect(first.page_count).toBeGreaterThan(1);
    expect(first.scope_sha256).toBe(sha256(bytes));
    for (const page of pages) {
      expect(Buffer.byteLength(page.text, "utf8")).toBeLessThanOrEqual(PROTOCOL_PAGE_MAX_BYTES);
      expect(page.complete).toBe(page.page === first.page_count);
    }
    expect(Buffer.from(pages.map(({ text }) => text).join(""), "utf8").equals(bytes)).toBe(true);
    expect(() => protocolTextPage(bytes, first.page_count + 1)).toThrow(RangeError);
    expect(() => protocolTextPage(bytes, 0)).toThrow(RangeError);
  });

  it("never splits a multibyte character across pages", () => {
    const text = `${"a".repeat(PROTOCOL_PAGE_MAX_BYTES - 1)}é${"b".repeat(10)}`;
    const bytes = Buffer.from(text, "utf8");
    const first = protocolTextPage(bytes, 1);
    const second = protocolTextPage(bytes, 2);

    expect(first.text + second.text).toBe(text);
    expect(first.text.endsWith("é")).toBe(false);
  });

  it("scans comments, CDATA, quoted '>' and self-closing sections", () => {
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Protocol name="T" version="1" revisionDate="2026-01-01">',
      "  <!-- <Hidden>not a section</Hidden> -->",
      '  <Alpha note="a > b"><Purpose>First &amp; best</Purpose><Rule>x</Rule></Alpha>',
      "  <Beta><![CDATA[ <Gamma>inside</Gamma> ]]></Beta>",
      '  <Delta flag="1"/>',
      "</Protocol>"
    ].join("\n");
    const sections = protocolSections("universal", xml);

    expect(sections.map(({ name }) => name)).toEqual(["Alpha", "Beta", "Delta"]);
    expect(sections[0]!.summary).toBe("First & best");
    expect(sections[2]!.bytes).toBe(Buffer.byteLength('<Delta flag="1"/>'));
  });
});
