import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  indexJatsStudyDocument,
  type EuropePmcFullTextArticle
} from "../packages/sources/src/index.js";

async function article(): Promise<EuropePmcFullTextArticle> {
  const xml = await readFile(
    new URL("fixtures/europe-pmc/full-text.xml", import.meta.url),
    "utf8"
  );
  return {
    pmcid: "PMC1234567",
    pmid: "40123456",
    doi: "10.1234/recorded.example",
    title: "Recorded full-text study",
    license: "Creative Commons Attribution 4.0",
    format: "jats_xml",
    document_completeness: "full_text_with_body",
    content_sha256: createHash("sha256").update(xml, "utf8").digest("hex"),
    content_bytes: Buffer.byteLength(xml, "utf8"),
    xml
  };
}

describe("JATS study document index", () => {
  it("creates stable source-linked blocks and preserves nested section paths", async () => {
    const indexed = indexJatsStudyDocument(await article());

    expect(indexed.source).toMatchObject({
      pmcid: "PMC1234567",
      doi: "10.1234/recorded.example",
      document_completeness: "full_text_with_body"
    });
    expect(indexed.section_paths).toEqual([
      ["Abstract"],
      ["Methods"],
      ["Methods", "Outcomes"],
      ["Results"]
    ]);
    expect(indexed.blocks.map(({ kind, section_path, text }) => ({
      kind,
      section_path,
      text
    }))).toEqual([
      {
        kind: "abstract",
        section_path: ["Abstract"],
        text: "The abstract reports only a bounded study summary."
      },
      {
        kind: "paragraph",
        section_path: ["Methods"],
        text: "The exact intervention and comparator were recorded."
      },
      {
        kind: "paragraph",
        section_path: ["Methods", "Outcomes"],
        text: "The registered primary outcome was function at twelve weeks."
      },
      {
        kind: "list_item",
        section_path: ["Methods", "Outcomes"],
        text: "Adherence was measured for both programs."
      },
      {
        kind: "paragraph",
        section_path: ["Results"],
        text: "Assigned and analyzed denominators were reported separately."
      },
      {
        kind: "table",
        section_path: ["Results"],
        text: "Table 1 Participant flow by assigned program. Assigned 100"
      }
    ]);
    for (const [index, block] of indexed.blocks.entries()) {
      expect(block.block_id).toMatch(
        new RegExp(`^jats_${String(index + 1).padStart(6, "0")}_[a-f0-9]{12}$`, "u")
      );
      expect(block.text_sha256).toBe(
        createHash("sha256").update(block.text, "utf8").digest("hex")
      );
    }
  });

  it("rejects content that no longer matches the acquisition hash", async () => {
    const source = await article();

    expect(() => indexJatsStudyDocument({
      ...source,
      xml: source.xml.replace("exact intervention", "altered intervention")
    })).toThrow("JATS study source hash mismatch");
  });
});
