import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { coreSectionNames, getProtocolManifest, loadProtocol, protocolNamedElements, protocolSections } from "@askrigor/protocol";
import { XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { undoCommunitySearchAndVideoCommentMapHrp, undoOwnerAnswer205Hrp } from "./helpers/undo-read-depth.js";

// Owner rule 148a and the owner's requests of 30 and 31 October 2026: AskRigor#390, forum depth and video comment maps.
const PINS = {
  from: { version: "20.6.34", sha256: "7b933620ecca1116f1d4c45c87046e37d8b2a6f97bc4e7a38b6dfd30aa23c74a" },
  to: { version: "20.6.35", sha256: "44e1ca79b864e8f8db232655bf6f67dd73cfd4f3c0c8b1b160f141e421871eec" },
} as const;
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const normalize = (text: string) => text.replace(/\s+/gu, " ").trim();
function rule(text: string, name: string): string {
  const matches = [...text.matchAll(new RegExp(`<Rule name="${name}"[^>]*>([\\s\\S]*?)</Rule>`, "gu"))];
  expect(matches, name).toHaveLength(1);
  return normalize(matches[0]![1]!);
}
const SENTENCES = [
  ["CommunityToFormalHypothesisTransfer", [
    "Say in the answer which community leads changed the study search, and what the studies then showed about them.",
  ]],
  ["ActualSearchRequired", [
    "When the person describes several symptoms together, run at least one search with their own combination of symptoms, " +
      "in their words, and cover the whole cluster in the answer, not only its most familiar symptom.",
  ]],
  ["ReviewCorpusSelectionAndCounts", [
    "The same counts apply to every community corpus, video comments and forum threads included: how many items the " +
      "platform shows, how many were retrieved, how many were classified, and how they were chosen (every one, every " +
      "k-th in the platform's order, a hash-ranked sample, a random sample, the top-ranked, or those found by outcome words).",
  ]],
  ["SearchSaturationAndStopping", [
    "On a forum, open each relevant thread the searches find and read all of it, replies included, in more than one " +
      "community where they exist; when a page will not open, say so and try another forum.",
    "State how many threads were found, opened and read, and why reading stopped: few threads exist, pages would not " +
      "open, or time ran out.",
  ]],
  ["YouTubeCreatorCommentCorpusHandling", [
    "Name every video analysed (title, channel, publication date, and link) and link every thread read, so the reader " +
      "can judge its relevance.",
    "Count outcomes per named method (a named exercise, manoeuvre, product, or dose), never for a category such as " +
      "physical therapy, with how much, how fast, and for how long, keeping each source's numbers apart.",
  ]],
  ["VideoCommentMap", [
    "For each video whose comments were audited, give its comment map from the outcome-neutral sample: how many people " +
      "said they did the video's method; how it went for them (better, no change, worse, mixed), with counts; how long " +
      "their results had lasted; the kinds of harm reported, with counts; and the other methods commenters credit, " +
      "with how many credit each and how many say it worked better than the video's method.",
    "Leave out promotion (comments selling or touting a product, practitioner, or contact, and templated testimonials) " +
      "and jokes, and say how many.",
    "Call them people who commented and said they tried it, never a success rate.",
    "Rank videos only for one problem, only among videos with at least 20 such people, by the share who said it helped, " +
      "giving each video's counts.",
    "One video's map never rates its channel; a channel needs at least five of its videos mapped.",
    "The other methods commenters credit are leads: search them in studies and pass them to the scout before " +
      "concluding (CommunityToFormalHypothesisTransfer).",
  ]],
  ["ThreePartCommunityConclusion", [
    "Conclude the forum audit with three separate fields, then a fourth when the question is what to do.",
    "What to try: what a person could try first and what to avoid, ordered by risk, and what would change that order.",
  ]],
] as const;

describe("community search and video comment maps: HRP 20.6.35", () => {
  it.each(SENTENCES)("preserves every new sentence in %s", async (name, sentences) => {
    const text = await loadProtocol("hrp");
    const body = rule(text, name);
    for (const sentence of sentences) expect(body, name).toContain(sentence);
    const core = new Set(coreSectionNames("hrp"));
    const elements = protocolNamedElements(text, name);
    expect(elements).toHaveLength(1);
    expect(core.has(elements[0]!.section), name).toBe(false);
  });

  it("limits the emergency exemption to an answer that is the warning itself", async () => {
    const text = await loadProtocol("hrp");
    const section = protocolSections("hrp", text).find(({ name }) => name === "CrowdSourcedAndClinicalSignalAudit")!;
    expect(section).toBeDefined();
    const body = Buffer.from(text, "utf8").subarray(section.byte_start, section.byte_end_exclusive).toString("utf8");
    const exemptions = [...body.matchAll(/<NonActivation>([\s\S]*?)<\/NonActivation>/gu)];
    expect(exemptions).toHaveLength(1);
    expect(normalize(exemptions[0]![1]!)).toBe(
      "Pure definition or mechanism with no real-world outcome claim; emergency triage before stabilization, which " +
      "covers only an answer that is the warning itself (once the warning is given and research continues, this module " +
      "applies); no plausible user-experience corpus; or a clearly irrelevant crowd layer. Record the reason in the " +
      "applicable-module ledger.",
    );
  });

  it("adds VideoCommentMap exactly once, between the existing video handling and prospective rules", async () => {
    const text = await loadProtocol("hrp");
    expect(text.match(/<Rule name="VideoCommentMap"/gu)).toHaveLength(1);
    expect(rule(text, "VideoCommentMap")).toBe(SENTENCES[5][1].join(" "));
    const names = [...text.matchAll(/<Rule name="([^"]+)"/gu)].map((match) => match[1]);
    const at = names.indexOf("VideoCommentMap");
    expect(names.slice(at - 1, at + 2)).toEqual([
      "YouTubeCreatorCommentCorpusHandling", "VideoCommentMap", "ProspectiveBeatsRetrospective",
    ]);
    expect(await undoCommunitySearchAndVideoCommentMapHrp(text)).not.toContain("VideoCommentMap");
  });

  it("leaves CoreHierarchy and every other core section byte for byte unchanged", async () => {
    const text = await loadProtocol("hrp");
    const prior = await undoCommunitySearchAndVideoCommentMapHrp(text);
    const core = new Set(coreSectionNames("hrp"));
    expect(core.has("CoreHierarchy")).toBe(true);
    const sections = (value: string) => protocolSections("hrp", value).filter(({ name }) => core.has(name))
      .map(({ name, byte_start, byte_end_exclusive }) => ({
        name, bytes: Buffer.from(value, "utf8").subarray(byte_start, byte_end_exclusive),
      }));
    expect(sections(text)).toEqual(sections(prior));
  });

  it("binds the current manifest and first revision to the exact owner-supplied bytes", async () => {
    const text = await loadProtocol("hrp");
    expect(XMLValidator.validate(text)).toBe(true);
    expect(await getProtocolManifest("hrp")).toEqual({
      name: "HRP", version: PINS.to.version, revisionDate: "2026-10-31", sha256: PINS.to.sha256,
    });
    expect(hash(text)).toBe(PINS.to.sha256);
    const revisions = [...text.matchAll(/<Revision version="([^"]+)"/gu)].map((match) => match[1]);
    expect(revisions.slice(0, 2)).toEqual(["20.6.35", "20.6.34"]);
  });

  it("reverses to HRP 20.6.34's exact bytes and SHA-256, with the older reversal still chained", async () => {
    const text = await loadProtocol("hrp");
    const prior = await undoCommunitySearchAndVideoCommentMapHrp(text);
    expect(XMLValidator.validate(prior)).toBe(true);
    expect(prior).toContain(`version="${PINS.from.version}" revisionDate="2026-10-30"`);
    expect(hash(prior)).toBe(PINS.from.sha256);
    const fixture = JSON.parse(await readFile(new URL(
      "./fixtures/protocol-edits/2026-10-31-community-search-and-video-comment-map-hrp.json", import.meta.url,
    ), "utf8")) as { hrp: { from: unknown; to: unknown; edits: Array<[string, string]> } };
    expect(fixture.hrp.from).toEqual(PINS.from);
    expect(fixture.hrp.to).toEqual(PINS.to);
    expect(fixture.hrp.edits).toHaveLength(11);
    const rebuilt = fixture.hrp.edits.reduce((value, [before, after]) => {
      expect(value.split(before), before.slice(0, 80)).toHaveLength(2);
      return value.replace(before, () => after);
    }, prior);
    expect(Buffer.from(rebuilt, "utf8")).toEqual(Buffer.from(text, "utf8"));
    expect(await undoOwnerAnswer205Hrp(text)).toBe(await undoOwnerAnswer205Hrp(prior));
  });

  it("keeps Universal at 20.5.46 with its exact existing bytes", async () => {
    expect(await getProtocolManifest("universal")).toEqual({
      name: "AskRigor.com universal saved instructions", version: "20.5.46", revisionDate: "2026-10-21",
      sha256: "e313306b09da7e359ea326a44c3850af020acbb2550c30bb2cddf46dc6074d9e",
    });
  });
});
