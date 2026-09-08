import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { loadProtocol } from "@askrigor/protocol";

const UNIVERSAL_URL = new URL("../protocols/Universal_Instructions.xml", import.meta.url);

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

function sectionBetween(text: string, startMarker: string, endMarker: string): string {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  expect(start, `missing ${startMarker}`).toBeGreaterThanOrEqual(0);
  expect(end, `missing ${endMarker}`).toBeGreaterThan(start);
  return text.slice(start, end);
}

describe("Universal explicit-commitment obligation closure integration", () => {
  it("requires the 20.5.19 revision and Critical obligation gate exactly once", async () => {
    const text = await readFile(UNIVERSAL_URL, "utf8");

    expect(text).toMatch(
      /<Protocol name="AskRigor\.com universal saved instructions" version="20\.5\.19" revisionDate="2026-09-07"[^>]+Explicit-Commitment-Obligation-Closure/u,
    );

    for (const singleton of [
      '<revision version="20.5.19" priority="Critical">',
      '<explicit_commitment_obligation_closure priority="Critical">',
      "When you explicitly commit to a substantive operation, method, comparison, audit, experiment, or artifact, keep it as an open obligation until it is actually executed, I explicitly supersede it, or new evidence makes it invalid and you say so.",
      "Adjacent analysis, planning, preparation, or a different method does not count as completion.",
      "If a still-valid promised step was displaced by later work, execute it before continuing.",
    ]) {
      expect(occurrences(text, singleton), singleton).toBe(1);
    }

    const revision19 = text.indexOf('<revision version="20.5.19" priority="Critical">');
    const revision18 = text.indexOf('<revision version="20.5.18" priority="Critical">');
    expect(revision19).toBeGreaterThanOrEqual(0);
    expect(revision18).toBeGreaterThan(revision19);

    const forwardMotionEnd = text.indexOf("</forward_motion_and_turn_completion_gate>");
    const obligationGate = text.indexOf('<explicit_commitment_obligation_closure priority="Critical">');
    const selfResolutionGate = text.indexOf('<self_resolution_and_user_effort_minimization_gate priority="Critical">');
    expect(obligationGate).toBeGreaterThan(forwardMotionEnd);
    expect(selfResolutionGate).toBeGreaterThan(obligationGate);

    const gate = sectionBetween(
      text,
      '<explicit_commitment_obligation_closure priority="Critical">',
      "</explicit_commitment_obligation_closure>",
    );
    for (const required of [
      "keep it as an open obligation until it is actually executed",
      "I explicitly supersede it",
      "new evidence makes it invalid and you say so",
      "Adjacent analysis, planning, preparation, or a different method does not count as completion",
      "verify what observable result proves each promised operation actually occurred",
      "execute it before continuing",
    ]) {
      expect(gate).toContain(required);
    }
  });

  it("exposes the exact obligation gate through the canonical protocol loader", async () => {
    const source = await readFile(UNIVERSAL_URL, "utf8");
    const emitted = await loadProtocol("universal");

    expect(emitted).toBe(source);
    expect(emitted).toContain('<explicit_commitment_obligation_closure priority="Critical">');
    expect(emitted).toContain(
      "Before switching methods, declaring progress complete, or ending a substantial pass, verify what observable result proves each promised operation actually occurred.",
    );
  });
});
