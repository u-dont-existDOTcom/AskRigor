import { InMemoryAtlasPageSource, InMemoryAtlasPublicationStore } from "@askrigor/evidence-repository";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ATLAS_NEAR_KEEP_MS, ATLAS_NEAR_WAIT_MS, ATLAS_NEAR_RETRY_MS, OWNER_POINTERS_LISTED, OWNER_POINTERS_SHOWN, OWNER_POINTER_HOW,
  askrigorHoldsSchema, atlasNearFinder, heldFor, heldText, heldVariants, holdsSomethingNow, ownerPointerText, shownOwnerPointer,
  type AskRigorHolds,
} from "../apps/research-mcp/src/askrigor-holds.js";
import { ATLAS_NEAR } from "../apps/research-mcp/src/atlas/near-match.js";
import { NOT_CHECKED_LABEL, type AtlasSearchIndex } from "../apps/research-mcp/src/atlas/page-data.js";
import { OWNER_POINTERS, type OwnerPointer } from "../apps/research-mcp/src/owner-pointers.js";
import { heldFinding, nearIndex, shownFinding } from "./helpers/askrigor-holds-fixture.js";

afterEach(() => vi.useRealTimers());

describe("heldFor", () => {
  it("returns undefined without options or without pointers and findings", async () => {
    expect(await heldFor(undefined, "anything")).toBeUndefined();
    expect(await heldFor({}, "anything")).toBeUndefined();
    expect(await heldFor({ pointers: () => [], atlas: async () => [] }, "anything")).toBeUndefined();
  });

  it("hands over matched pointers and lists the others only by id and about", async () => {
    const held = await heldFor({ pointers: () => OWNER_POINTERS }, "How do I get into a flow state?");
    expect(held).toEqual({
      how_to_use: expect.any(String),
      owner_pointers: [shownOwnerPointer(OWNER_POINTERS[1]!)],
      other_owner_pointers: [{ id: OWNER_POINTERS[0]!.id, about: OWNER_POINTERS[0]!.about }],
    });
    expect(held?.owner_pointers?.[0]).not.toHaveProperty("match");
  });

  it("can return only the list of other pointers", async () => {
    expect(await heldFor({ pointers: () => OWNER_POINTERS }, "How long do I boil an egg?")).toEqual({
      how_to_use: expect.any(String),
      other_owner_pointers: OWNER_POINTERS.map(({ id, about }) => ({ id, about })),
    });
  });

  it("caps shown pointers, listed pointers and Atlas findings, preserving their order", async () => {
    const pointers: OwnerPointer[] = Array.from({ length: OWNER_POINTERS_SHOWN + OWNER_POINTERS_LISTED + 4 }, (_, i) => ({
      id: `invented-${i}`, about: `Invented subject ${i}`, match: [[i < OWNER_POINTERS_SHOWN + 2 ? "flow" : "other"]],
      says: "An invented suggestion.", checked: "Not checked.", limits: "A fixture.", added: "2026-11-14",
    }));
    const findings = Array.from({ length: ATLAS_NEAR.matches + 2 }, (_, i) =>
      heldFinding({ publication_number: `P-${88001 + i}`, wording: `Invented finding ${i}.` }));
    const held = await heldFor({ pointers: () => pointers, atlas: async () => findings }, "flow");
    expect(held).toEqual({
      how_to_use: expect.any(String),
      owner_pointers: pointers.slice(0, OWNER_POINTERS_SHOWN).map(shownOwnerPointer),
      other_owner_pointers: pointers.slice(OWNER_POINTERS_SHOWN, OWNER_POINTERS_SHOWN + OWNER_POINTERS_LISTED)
        .map(({ id, about }) => ({ id, about })),
      atlas_findings: findings.slice(0, ATLAS_NEAR.matches),
    });
    expect(askrigorHoldsSchema.safeParse(held).success).toBe(true);
  });

  it("keeps the pointers when the Atlas rejects and gives undefined if nothing else is held", async () => {
    const atlas = vi.fn(async () => { throw new Error("synthetic private failure"); });
    const held = await heldFor({ atlas, pointers: () => OWNER_POINTERS }, "fibromyalgia");
    expect(held).toEqual({ how_to_use: expect.any(String), owner_pointers: OWNER_POINTERS.map(shownOwnerPointer) });
    expect(JSON.stringify(held)).not.toContain("synthetic private failure");
    expect(await heldFor({ atlas }, "anything")).toBeUndefined();
  });
});

describe("atlasNearFinder", () => {
  const source = () => new InMemoryAtlasPageSource({ publications: new InMemoryAtlasPublicationStore() });

  it("reads once inside keepMs and reads again at expiry, using the requested text each time", async () => {
    let clock = 10;
    const from = source();
    const load = vi.fn(async () => nearIndex("blue mint", "amber birch"));
    const find = atlasNearFinder(from, { load, now: () => clock, keepMs: 100 });
    expect((await find("blue mint")).map(({ publication_number }) => publication_number)).toEqual(["P-88001"]);
    clock = 109;
    expect((await find("amber birch")).map(({ publication_number }) => publication_number)).toEqual(["P-88002"]);
    expect(load).toHaveBeenCalledExactlyOnceWith(from);
    clock = 110;
    await find("blue mint");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps a reading for five minutes by default", async () => {
    let clock = 0;
    const load = vi.fn(async () => nearIndex("blue mint"));
    const find = atlasNearFinder(source(), { load, now: () => clock });
    await find("blue mint");
    clock = 5 * 60_000 - 1;
    await find("blue mint");
    expect(load).toHaveBeenCalledTimes(1);
    clock++;
    await find("blue mint");
    expect(load).toHaveBeenCalledTimes(2);
    expect(ATLAS_NEAR_KEEP_MS).toBe(5 * 60_000);
  });

  it("shares an in-flight reading between registrations", async () => {
    let finish!: (index: AtlasSearchIndex) => void;
    const load = vi.fn(() => new Promise<AtlasSearchIndex>((resolve) => { finish = resolve; }));
    const find = atlasNearFinder(source(), { load, now: () => 0 });
    const first = find("blue mint");
    const second = find("amber birch");
    await Promise.resolve();
    finish(nearIndex("blue mint", "amber birch"));
    const results = await Promise.all([first, second]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(results.map((rows) => rows.map(({ publication_number }) => publication_number)))
      .toEqual([["P-88001"], ["P-88002"]]);
  });

  it("serves the earlier reading at keepMs while refresh is pending, then serves the new reading", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    let finish!: (index: AtlasSearchIndex) => void;
    const refreshed = new Promise<AtlasSearchIndex>((resolve) => { finish = resolve; });
    const oldIndex = nearIndex("blue mint");
    const newIndex = nearIndex(shownFinding("New blue mint finding.", { subject: "blue mint", publicationNumber: "P-88002" }));
    const load = vi.fn<() => Promise<AtlasSearchIndex>>().mockResolvedValueOnce(oldIndex).mockReturnValueOnce(refreshed);
    const find = atlasNearFinder(source(), { load, keepMs: 100 });
    const earlier = await find("blue mint");
    expect(earlier.map(({ publication_number }) => publication_number)).toEqual(["P-88001"]);
    vi.setSystemTime(100);
    // No timer is advanced and the second load is still pending when this answer arrives.
    expect(await find("blue mint")).toEqual(earlier);
    expect(load).toHaveBeenCalledTimes(2);
    expect(Date.now()).toBe(100);
    expect(vi.getTimerCount()).toBe(0);
    finish(newIndex);
    await vi.advanceTimersByTimeAsync(0);
    expect((await find("blue mint")).map(({ publication_number }) => publication_number)).toEqual(["P-88002"]);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("waits waitMs for a stalled first reading, then returns immediately inside retryMs without another load", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const load = vi.fn(() => new Promise<AtlasSearchIndex>(() => {}));
    const find = atlasNearFinder(source(), { load });
    let resolved = false;
    const first = find("blue mint").then((rows) => { resolved = true; return rows; });
    await vi.advanceTimersByTimeAsync(ATLAS_NEAR_WAIT_MS - 1);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await first).toEqual([]);
    expect(ATLAS_NEAR_WAIT_MS).toBe(1_500);
    const beforeSecond = Date.now();
    expect(await find("blue mint")).toEqual([]);
    expect(Date.now()).toBe(beforeSecond);
    expect(vi.getTimerCount()).toBe(0);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("keeps serving an earlier good reading after a failed refresh until a retry succeeds", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const load = vi.fn<() => Promise<AtlasSearchIndex>>().mockResolvedValueOnce(nearIndex("blue mint"))
      .mockRejectedValueOnce(new Error("synthetic refresh failure"))
      .mockResolvedValueOnce(nearIndex(shownFinding("New blue mint finding.", {
        subject: "blue mint", publicationNumber: "P-88002",
      })));
    const find = atlasNearFinder(source(), { load, keepMs: 100, retryMs: 30 });
    const earlier = await find("blue mint");
    expect(earlier).toHaveLength(1);
    vi.setSystemTime(100);
    expect(await find("blue mint")).toEqual(earlier);
    await vi.advanceTimersByTimeAsync(0);
    vi.setSystemTime(129);
    expect(await find("blue mint")).toEqual(earlier);
    expect(load).toHaveBeenCalledTimes(2);
    vi.setSystemTime(130);
    expect(await find("blue mint")).toEqual(earlier);
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(3);
    expect((await find("blue mint")).map(({ publication_number }) => publication_number)).toEqual(["P-88002"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the first-reading wait timer immediately on success without advancing time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const find = atlasNearFinder(source(), { load: async () => nearIndex("blue mint") });
    expect(await find("blue mint")).toHaveLength(1);
    expect(Date.now()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retries a rejected reading only at retryMs, not on intervening calls", async () => {
    let clock = 0;
    const load = vi.fn<() => Promise<AtlasSearchIndex>>()
      .mockRejectedValueOnce(new Error("synthetic failure")).mockResolvedValue(nearIndex("blue mint"));
    const find = atlasNearFinder(source(), { load, now: () => clock });
    expect(await find("blue mint")).toEqual([]);
    clock = ATLAS_NEAR_RETRY_MS - 1;
    expect(await find("blue mint")).toEqual([]);
    expect(load).toHaveBeenCalledTimes(1);
    clock = ATLAS_NEAR_RETRY_MS;
    expect(await find("blue mint")).toHaveLength(1);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("also contains a synchronous load failure and retries after retryMs", async () => {
    let clock = 0;
    const load = vi.fn<() => Promise<AtlasSearchIndex>>()
      .mockImplementationOnce(() => { throw new Error("synthetic synchronous failure"); })
      .mockResolvedValue(nearIndex("blue mint"));
    const find = atlasNearFinder(source(), { load, now: () => clock });
    expect(await find("blue mint")).toEqual([]);
    clock = ATLAS_NEAR_RETRY_MS - 1;
    expect(await find("blue mint")).toEqual([]);
    expect(load).toHaveBeenCalledTimes(1);
    clock = ATLAS_NEAR_RETRY_MS;
    expect(await find("blue mint")).toHaveLength(1);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it.each([25, ATLAS_NEAR_WAIT_MS])("returns none when reading exceeds waitMs=%i and clears the timer", async (waitMs) => {
    vi.useFakeTimers();
    const load = vi.fn(() => new Promise<AtlasSearchIndex>((resolve) => {
      setTimeout(() => resolve(nearIndex("blue mint")), waitMs + 1);
    }));
    const find = atlasNearFinder(source(), { load, now: () => 0,
      ...(waitMs === ATLAS_NEAR_WAIT_MS ? {} : { waitMs }) });
    const pending = find("blue mint");
    await vi.advanceTimersByTimeAsync(waitMs);
    expect(await pending).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns public checked and unreviewed shapes, origin-based links and shared query words", async () => {
    const checked = shownFinding("Cut dark parts from a sweetpotato.", { publicationNumber: "P-88007",
      status: { kind: "checked", atlasNumber: "F-88007", checkedOn: "2026-11-14" }, subject: "Sweetpotato spoilage",
      certainty: "moderate", appliesTo: "Fresh sweet potatoes", question: "How should I peel them?" });
    const unreviewed = shownFinding("A sweetpotato lead.", { publicationNumber: "P-88008", certainty: null,
      topic: { key: "sweetpotato-rot", label: "Sweetpotato rot and food safety" } });
    const find = atlasNearFinder(source(), { load: async () => nearIndex(checked, unreviewed),
      origin: "https://atlas.example", now: () => 0 });
    const rows = await find("How do I peel sweet potatoes?");
    expect(rows).toEqual([
      { publication_number: "P-88007", state: "checked", label: "checked", certainty: "moderate", wording: checked.claim,
        applies_to: checked.appliesTo, question: checked.question, page_url: "https://atlas.example/atlas/findings/P-88007",
        shared_words: ["sweet", "potatoes"] },
      { publication_number: "P-88008", state: NOT_CHECKED_LABEL, label: "unreviewed", certainty: null, wording: unreviewed.claim,
        applies_to: null, question: null, page_url: "https://atlas.example/atlas/findings/P-88008",
        shared_words: ["sweet", "potatoes"] },
    ]);
    expect(askrigorHoldsSchema.safeParse({ how_to_use: "Read the findings.", atlas_findings: rows }).success).toBe(true);
  });

  it.each(["lead", "contested"] as const)("keeps the %s label with state checked", async (kind) => {
    const finding = shownFinding("An invented blue mint finding.", { subject: "blue mint",
      status: { kind, atlasNumber: "F-88001", checkedOn: "2026-11-14" } });
    const find = atlasNearFinder(source(), { load: async () => nearIndex(finding) });
    expect(await find("blue mint")).toEqual([heldFinding({ label: kind, state: "checked", wording: finding.claim,
      applies_to: null, question: null, page_url: "https://askrigor.com/atlas/findings/P-88001",
      shared_words: ["blue", "mint"] })]);
  });

  it("never hands over a superseded finding even when it is the only near one", async () => {
    const superseded = shownFinding("Old blue mint finding.", { subject: "blue mint",
      status: { kind: "superseded", atlasNumber: "F-88001", checkedOn: "2026-11-14" } });
    const find = atlasNearFinder(source(), { load: async () => nearIndex(superseded, "amber birch") });
    expect(await find("blue mint")).toEqual([]);
  });

  it("does not let a superseded finding take one of the three places", async () => {
    const superseded = shownFinding("Old alpha bravo finding.", { subject: "alpha bravo",
      status: { kind: "superseded", atlasNumber: "F-88001", checkedOn: "2026-11-14" } });
    const find = atlasNearFinder(source(), { load: async () => nearIndex(superseded, "cider delta", "ember frost", "green hazel") });
    expect((await find("alpha bravo cider delta ember frost green hazel")).map(({ publication_number }) => publication_number))
      .toEqual(["P-88002", "P-88003", "P-88004"]);
  });
});

describe("heldVariants", () => {
  it("drops last findings one at a time, then lists matched pointers by id and subject, then drops everything", async () => {
    const findings = [1, 2, 3].map((i) => heldFinding({ publication_number: `P-${88000 + i}` }));
    const held = (await heldFor({ atlas: async () => findings, pointers: () => OWNER_POINTERS }, "flow state"))!;
    const variants = heldVariants(held);
    expect(variants).toHaveLength(6);
    expect(variants[0]).toBe(held);
    for (const [at, count] of [3, 2, 1, 0].entries()) {
      expect(variants[at]).toEqual({ how_to_use: expect.any(String),
        ...(count === 0 ? {} : { atlas_findings: findings.slice(0, count) }),
        owner_pointers: held.owner_pointers, other_owner_pointers: held.other_owner_pointers });
      expect(variants[at]!.how_to_use.includes("atlas_findings:")).toBe(count > 0);
      if (count > 0) expect(variants[at]!.how_to_use).toContain(count === 1 ? "a finding on what" : `${count} findings on what`);
    }
    expect(variants[4]).toEqual({ how_to_use: expect.any(String), other_owner_pointers: [
      ...held.owner_pointers!.map(({ id, about }) => ({ id, about })), ...held.other_owner_pointers!,
    ] });
    expect(variants[4]!.how_to_use).not.toMatch(/(?:^| )owner_pointers:/u);
    expect(variants.at(-1)).toBeUndefined();
    for (const variant of variants) {
      if (variant !== undefined) expect(askrigorHoldsSchema.safeParse(variant).success).toBe(true);
    }
  });

  it("gives only undefined for undefined", () => {
    expect(heldVariants(undefined)).toEqual([undefined]);
  });

  it.each(["findings", "pointers", "others"])("keeps every %s-only variant schema-valid and ends with undefined", async (kind) => {
    const held = await heldFor({ ...(kind === "findings" ? { atlas: async () => [heldFinding()] }
      : { pointers: () => OWNER_POINTERS }) }, kind === "pointers" ? "fibromyalgia" : "blue mint");
    const variants = heldVariants(held);
    expect(variants[0]).toBe(held);
    expect(variants.slice(0, -1).every((variant) => askrigorHoldsSchema.safeParse(variant).success)).toBe(true);
    expect(variants.at(-1)).toBeUndefined();
  });
});

describe("held text and public schemas", () => {
  it.each([1, 2])("names each of %i findings without repeating its text", async (count) => {
    const findings = Array.from({ length: count }, (_, i) => heldFinding({ publication_number: `P-${88001 + i}`,
      wording: `Invented finding ${i}.`, page_url: `https://atlas.example/atlas/findings/P-${88001 + i}` }));
    const held = (await heldFor({ atlas: async () => findings }, "sweet potatoes"))!;
    const text = heldText(held);
    expect(held.how_to_use).toMatch(count === 1 ? /^atlas_findings: AskRigor's Atlas already holds a finding on what /u
      : /^atlas_findings: AskRigor's Atlas already holds 2 findings on what /u);
    // 14 Nov 2026, the owner's ChatGPT: told to give a finding "where one bears on the question", it left out both
    // sweet potato findings for a question about peeling them. A finding on the question's subject is given after
    // the answer unless it is plainly about another thing, also when it does not answer the question itself.
    expect(held.how_to_use).toContain("After your answer, in any lane, give each to the person");
    expect(held.how_to_use).toContain("Give it also when it does not answer the question itself");
    expect(held.how_to_use).toContain("Leave a finding out only when it is plainly about another thing than the question is");
    expect(held.how_to_use).not.toContain("bears on");
    expect(held.how_to_use).not.toContain("yours to judge");
    expect(text).toBe(`What AskRigor already holds for this question is in askrigor_holds (${findings
      .map(({ publication_number }) => publication_number).join(", ")}). ${held.how_to_use}`);
    for (const finding of findings) {
      for (const part of [finding.wording, finding.page_url, finding.applies_to!, finding.question!]) {
        expect(text).not.toContain(part);
      }
    }
    expect(text).toContain(NOT_CHECKED_LABEL);
    expect(text).toContain("search_research_frontiers");
    expect(text).not.toContain("owner_pointers:");
  });

  it("names lead and contested findings by their labels in the short text", async () => {
    const held = (await heldFor({ atlas: async () => [heldFinding({ label: "lead" }),
      heldFinding({ publication_number: "P-88002", label: "contested" })] }, "sweet potatoes"))!;
    expect(heldText(held)).toBe("What AskRigor already holds for this question is in askrigor_holds " +
      `(P-88001 (lead), P-88002 (contested)). ${held.how_to_use}`);
  });

  it.each(["flow state", "fibromyalgia"])("names matched pointers without repeating their texts for %s", async (target) => {
    const held = (await heldFor({ pointers: () => OWNER_POINTERS }, target))!;
    const pointers = held.owner_pointers!;
    const text = heldText(held);
    expect(held.how_to_use).toContain(pointers.length === 1 ? "be shown this." : "be shown these.");
    expect(text).toContain(OWNER_POINTER_HOW);
    expect(text).toBe(`What AskRigor already holds for this question is in askrigor_holds (${pointers
      .map(({ id }) => `the owner's pointer ${id}`).join(", ")}). ${held.how_to_use}`);
    for (const pointer of pointers) {
      for (const part of [pointer.about, pointer.says, pointer.checked, pointer.limits,
        ...(pointer.link === undefined ? [] : [pointer.link.title, pointer.link.url])]) expect(text).not.toContain(part);
    }
    expect(text).not.toContain("atlas_findings:");
    expect(text.includes("other_owner_pointers:")).toBe(target === "flow state");
  });

  it("gives the exact action and later input for other pointers, alone or beside matched ones", async () => {
    for (const target of ["boil an egg", "flow state"]) {
      const held = (await heldFor({ pointers: () => OWNER_POINTERS }, target))!;
      const text = heldText(held);
      expect(text).toContain("other_owner_pointers:");
      expect(text).toContain("action owner_pointer");
      expect(text).toContain("later_inputs.ownerPointer set to its id");
      for (const { id, about } of held.other_owner_pointers!) {
        expect(text).not.toContain(id);
        expect(text).not.toContain(about);
      }
    }
  });

  it("omits absent optional finding and pointer details", async () => {
    const { link: _link, ...pointer } = shownOwnerPointer(OWNER_POINTERS[0]!);
    const text = ownerPointerText(pointer);
    expect(text).toContain(pointer.says);
    expect(text).not.toContain("Link:");
    expect(text).not.toContain("undefined");
    const held = (await heldFor({ atlas: async () => [heldFinding({ certainty: null, applies_to: null, question: null })] },
      "sweet potatoes"))!;
    const finding = heldText(held);
    expect(finding).not.toContain("Holds for:");
    expect(finding).not.toContain("Its question:");
    expect(finding).not.toContain("; null");
    expect(heldText({ how_to_use: "Read the structured result." })).toBe(
      "What AskRigor already holds for this question is in askrigor_holds. Read the structured result.");
  });

  it("shows a pointer without matching rules and copies its optional link", () => {
    const pointer = OWNER_POINTERS[0]!;
    const shown = shownOwnerPointer(pointer);
    expect(shown).toEqual({ id: pointer.id, about: pointer.about, says: pointer.says, link: pointer.link,
      checked: pointer.checked, limits: pointer.limits, added: pointer.added });
    expect(shown.link).not.toBe(pointer.link);
  });

  it.each<[AskRigorHolds | undefined, boolean]>([
    [undefined, false], [{ how_to_use: "" }, false], [{ how_to_use: "", atlas_findings: [], owner_pointers: [] }, false],
    [{ how_to_use: "", other_owner_pointers: [{ id: "other", about: "Other question" }] }, false],
    [{ how_to_use: "", atlas_findings: [heldFinding()] }, true], [{ how_to_use: "", owner_pointers: [shownOwnerPointer(OWNER_POINTERS[0]!)] }, true],
  ])("recognizes whether something is held for the question: %j", (held, expected) => {
    expect(holdsSomethingNow(held)).toBe(expected);
  });

  it("refuses unknown keys at the top level and in each result kind", () => {
    expect(askrigorHoldsSchema.safeParse({ how_to_use: "", unknown: true }).success).toBe(false);
    for (const held of [
      { atlas_findings: [{ ...heldFinding(), unknown: true }] },
      { owner_pointers: [{ ...shownOwnerPointer(OWNER_POINTERS[0]!), match: [["hidden"]] }] },
      { other_owner_pointers: [{ id: "other", about: "Other question", says: "Not allowed here" }] },
    ]) expect(askrigorHoldsSchema.safeParse({ how_to_use: "", ...held }).success).toBe(false);
  });

  it("requires how_to_use in a held result", () => {
    expect(askrigorHoldsSchema.safeParse({ atlas_findings: [heldFinding()] }).success).toBe(false);
    expect(askrigorHoldsSchema.safeParse({ how_to_use: "Read the findings.", atlas_findings: [heldFinding()] }).success).toBe(true);
  });
});
