import { describe, expect, it } from "vitest";

import { atlasSearchFold } from "../apps/research-mcp/src/atlas/search.js";
import { OWNER_POINTERS, ownerPointerById, ownerPointersFor, foldedForPointers, type OwnerPointer }
  from "../apps/research-mcp/src/owner-pointers.js";

const BOTH = ["sensitised-nervous-system-video", "systema-breathing"];
const idsFor = (text: string) => ownerPointersFor(text).map(({ id }) => id);

describe("the owner's pointers", () => {
  it("keeps the real ids unique, bounded and stable", () => {
    expect(OWNER_POINTERS.map(({ id }) => id)).toEqual(BOTH);
    expect(new Set(OWNER_POINTERS.map(({ id }) => id)).size).toBe(OWNER_POINTERS.length);
    for (const { id } of OWNER_POINTERS) expect(id).toMatch(/^[a-z0-9][a-z0-9-]{0,63}$/u);
  });

  it("has nonempty text, https links, calendar dates and already-folded match groups", () => {
    for (const pointer of OWNER_POINTERS) {
      for (const text of [pointer.about, pointer.says, pointer.checked, pointer.limits, pointer.added]) {
        expect(text.trim()).not.toBe("");
      }
      expect(pointer.added).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
      expect(new Date(`${pointer.added}T00:00:00.000Z`).toISOString().slice(0, 10)).toBe(pointer.added);
      if (pointer.link !== undefined) {
        expect(pointer.link.title.trim()).not.toBe("");
        expect(new URL(pointer.link.url).protocol).toBe("https:");
      }
      expect(pointer.match.length).toBeGreaterThan(0);
      for (const group of pointer.match) {
        expect(group.length).toBeGreaterThan(0);
        for (const part of group) {
          expect(part.trim()).not.toBe("");
          expect(part).toBe(part.trim());
          expect(part).toBe(part.toLowerCase());
          expect(part).toBe(atlasSearchFold(part).replace(/\p{White_Space}+/gu, " "));
          // As foldedForPointers writes a text: no apostrophe; and * only as a part's last character.
          expect(part).toBe(foldedForPointers(part));
          expect(part.indexOf("*") === -1 || part.indexOf("*") === part.length - 1).toBe(true);
          expect(part.replace(/\*$/u, "")).not.toBe("");
        }
      }
    }
  });

  it.each(["What helps fibromyalgia?", "central sensitisation syndrome", "symptoms my doctors can't explain",
    "central sensitization syndrome", "centrally sensitised pain", "my nervous system is sensitised",
    "medically unexplained symptoms", "unexplained physical symptoms"])(
    "matches both pointers for %s", (text) => {
      expect(idsFor(text)).toEqual(BOTH);
    },
  );

  // Codex's review of 14 Nov 2026: with parts found inside longer words, these three matched a pointer.
  it.each([
    "My doctors explain my symptoms clearly; how do I organize the notes?",
    "How do I read a cash flow statement?",
    "How do I preserve workflow state in GitHub Actions?",
    "How do I turn water into flowers in this game?",
    "How do I explain central air conditioning to someone sensitive to noise?",
    "How does a central bank sensitize markets to interest-rate changes?",
    "How do doctors use neuroplastic changes to treat stroke symptoms?",
    "Is the nervous system sensitive to caffeine?",
  ])("matches no pointer for %s", (text) => {
    expect(idsFor(text)).toEqual([]);
  });

  it.each([
    "symptoms my doctors can\u2019t explain", "My symptoms cannot be explained by any test",
    "Is my nervous system sensitised?", "a neuroplastic symptom", "fibromyalgie", "Fibromialgia: \u00bfqu\u00e9 ayuda?",
  ])("matches both pointers for %s, a curly apostrophe and other endings included", (text) => {
    expect(idsFor(text)).toEqual(BOTH);
  });

  it.each(["flow states at work", "a state of flow", "stuck in fight-or-flight", "sympathetic overactivity",
    "Sympathetic nervous system dominance"])("matches only Systema breathing for %s", (text) => {
    expect(idsFor(text)).toEqual(["systema-breathing"]);
  });

  it("finds a part as whole words, and one ending with * also where the word goes on", () => {
    const pointer: OwnerPointer = { id: "invented", about: "An invented subject", says: "An invented pointer.",
      checked: "Nothing checked.", limits: "A fixture.", added: "2026-11-14", match: [["amber*"], ["cider mill"]] };
    for (const text of ["amber", "amberish glow", "an AMBER\u00c9 stone", "the cider mill", "Cider  Mill!"]) {
      expect(ownerPointersFor(text, [pointer]), text).toEqual([pointer]);
    }
    for (const text of ["camber", "lamberts", "cider mills", "cider milling", "ciders mill", "applecider mill"]) {
      expect(ownerPointersFor(text, [pointer]), text).toEqual([]);
    }
  });

  it("matches only Systema breathing for a coding flow-state question", () => {
    expect(idsFor("how do I get into a flow state when coding?")).toEqual(["systema-breathing"]);
  });

  it("matches no pointer for boiling an egg", () => {
    expect(idsFor("How long do I boil an egg?")).toEqual([]);
  });

  it.each([
    ["FLOW \n STATE", ["systema-breathing"]], ["Fibromyalgía", BOTH],
    ["CENTRAL\t\n SENSITISATION SYNDROME", BOTH],
  ])("folds case, accents and whitespace in %s", (text, expected) => {
    expect(idsFor(text)).toEqual(expected);
  });

  it("requires every part of one group, and accepts any complete group in a supplied list", () => {
    const pointer: OwnerPointer = { id: "invented", about: "An invented subject", says: "An invented pointer.",
      checked: "Nothing checked.", limits: "A fixture.", added: "2026-11-14", match: [["amber", "birch"], ["cider", "delta"]] };
    for (const text of ["", "amber", "birch", "cider", "delta", "amber delta"]) {
      expect(ownerPointersFor(text, [pointer])).toEqual([]);
    }
    for (const text of ["birch and amber", "cider then delta", "amber birch cider delta"]) {
      expect(ownerPointersFor(text, [pointer])).toEqual([pointer]);
    }
    expect(ownerPointersFor("amber birch", [])).toEqual([]);
  });

  it("looks up ids in any case with surrounding spaces, and returns undefined for unknown ids", () => {
    for (const pointer of OWNER_POINTERS) {
      expect(ownerPointerById(pointer.id)).toBe(pointer);
      expect(ownerPointerById(` \t${pointer.id.toUpperCase()}\n`)).toBe(pointer);
    }
    expect(ownerPointerById("unknown")).toBeUndefined();
    expect(ownerPointerById("systema-breathing", [])).toBeUndefined();
    const supplied = { ...OWNER_POINTERS[0]!, id: "invented" };
    expect(ownerPointerById(" INVENTED ", [supplied])).toBe(supplied);
  });
});
