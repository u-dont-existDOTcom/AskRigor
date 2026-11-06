import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { coreSectionNames, getProtocolManifest, loadProtocol, protocolNamedElements, protocolSections } from "@askrigor/protocol";
import { XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { undoCommunitySearchAndVideoCommentMapHrp, undoForumReaderHrp, undoOwnerAnswer205Hrp, undoWhatPeopleWantHrp } from "./helpers/undo-read-depth.js";

const PINS = {
  from: { version: "20.6.35", sha256: "44e1ca79b864e8f8db232655bf6f67dd73cfd4f3c0c8b1b160f141e421871eec" },
  to: { version: "20.6.36", sha256: "59e946c296b835a21a28f2ae83d02800a1a1ee5174689e675c597f29a7520ffa" },
} as const;
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
// HRP 20.6.37 adds the rules from what people want above this layer.
const layer = async () => undoWhatPeopleWantHrp(await loadProtocol("hrp"));
const SENTENCE = "Where AskRigor's search_reddit_threads and read_forum_thread are available, use them first; " +
  "a page they report as refusing access stays unread.";

describe("owner answers 211a and 213b: HRP 20.6.36", () => {
  it("puts the exact forum-reader sentence in SearchSaturationAndStopping, outside the core", async () => {
    const text = await layer();
    const rules = [...text.matchAll(/<Rule name="SearchSaturationAndStopping"[^>]*>([\s\S]*?)<\/Rule>/gu)];
    expect(rules).toHaveLength(1);
    expect(rules[0]![1]!.replace(/\s+/gu, " ")).toContain(SENTENCE);
    expect((await undoForumReaderHrp(text)).replace(/\s+/gu, " ")).not.toContain(SENTENCE);
    const elements = protocolNamedElements(text, "SearchSaturationAndStopping");
    expect(elements).toHaveLength(1);
    expect(coreSectionNames("hrp")).not.toContain(elements[0]!.section);
  });

  it("leaves CoreHierarchy and every other core section byte for byte unchanged", async () => {
    const text = await layer();
    const prior = await undoForumReaderHrp(text);
    const core = new Set(coreSectionNames("hrp"));
    expect(core.has("CoreHierarchy")).toBe(true);
    const sections = (value: string) => protocolSections("hrp", value).filter(({ name }) => core.has(name))
      .map(({ name, byte_start, byte_end_exclusive }) => ({
        name, bytes: Buffer.from(value, "utf8").subarray(byte_start, byte_end_exclusive),
      }));
    expect(sections(text)).toEqual(sections(prior));
  });

  it("binds the current manifest and first revision to the exact owner-supplied bytes", async () => {
    const text = await layer();
    expect(XMLValidator.validate(text)).toBe(true);
    expect(hash(text)).toBe(PINS.to.sha256);
    const revisions = [...text.matchAll(/<Revision version="([^"]+)"/gu)].map((match) => match[1]);
    expect(revisions.slice(0, 2)).toEqual(["20.6.36", "20.6.35"]);
  });

  it("records each changed passage and reverses to 20.6.35's exact bytes and SHA-256", async () => {
    const text = await layer();
    const prior = await undoForumReaderHrp(text);
    expect(XMLValidator.validate(prior)).toBe(true);
    expect(prior).toContain(`version="${PINS.from.version}" revisionDate="2026-10-31"`);
    expect(hash(prior)).toBe(PINS.from.sha256);
    const fixture = JSON.parse(await readFile(new URL(
      "./fixtures/protocol-edits/2026-11-01-forum-reader-hrp.json", import.meta.url,
    ), "utf8")) as { hrp: { from: unknown; to: unknown; edits: Array<[string, string]> } };
    expect(fixture.hrp.from).toEqual(PINS.from);
    expect(fixture.hrp.to).toEqual(PINS.to);
    expect(fixture.hrp.edits).toHaveLength(3);
    const rebuilt = fixture.hrp.edits.reduce((value, [before, after]) => {
      expect(value.split(before), before.slice(0, 80)).toHaveLength(2);
      return value.replace(before, () => after);
    }, prior);
    expect(Buffer.from(rebuilt, "utf8")).toEqual(Buffer.from(text, "utf8"));
    expect(await undoCommunitySearchAndVideoCommentMapHrp(text))
      .toBe(await undoCommunitySearchAndVideoCommentMapHrp(prior));
    expect(await undoOwnerAnswer205Hrp(text)).toBe(await undoOwnerAnswer205Hrp(prior));
  });

  it("keeps Universal at 20.5.46 with its exact existing bytes", async () => {
    expect(await getProtocolManifest("universal")).toEqual({
      name: "AskRigor.com universal saved instructions", version: "20.5.46", revisionDate: "2026-10-21",
      sha256: "e313306b09da7e359ea326a44c3850af020acbb2550c30bb2cddf46dc6074d9e",
    });
  });
});
