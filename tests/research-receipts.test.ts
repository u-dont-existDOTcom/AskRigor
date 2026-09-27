import { describe, expect, it } from "vitest";

import {
  continuedCursors,
  cursorDigest,
  issueResearchReceipt,
  researchReceiptSecretFromEnv,
  roundUnreadPages,
  verifyResearchReceipt
} from "../apps/research-mcp/src/research-receipts.js";

const SECRET = "research-receipt-test-secret-0123456789abcdef";
const NOW = new Date("2026-09-26T12:00:00.000Z");
const now = () => NOW;

describe("research receipts", () => {
  it("round-trips readable claims, including DOIs and lists", () => {
    const token = issueResearchReceipt("study_audit", {
      id: "PMC10518852",
      doi: "10.1002/art.41142",
      status: "complete_no_unresolved_fields",
      pmid: undefined
    }, { secret: SECRET, now });
    expect(token).toMatch(/^rr1~study_audit~doi=10\.1002%2Fart\.41142,id=PMC10518852,status=complete_no_unresolved_fields~\d+~[A-Za-z0-9_-]{22}$/u);

    const verified = verifyResearchReceipt(token, { secret: SECRET, now });
    expect(verified).toEqual({
      ok: true,
      kind: "study_audit",
      issued_at: NOW.toISOString(),
      claims: {
        doi: "10.1002/art.41142",
        id: "PMC10518852",
        status: "complete_no_unresolved_fields"
      }
    });

    for (const videos of [[], ["abcdefghijk"], ["abcdefghijk", "ABCDEFGHIJ_", "a~b+c,d=e"]]) {
      const listToken = issueResearchReceipt("youtube_community_audit", { videos }, { secret: SECRET, now });
      const result = verifyResearchReceipt(listToken, { secret: SECRET, now });
      expect(result.ok && result.claims.videos).toEqual(videos);
    }
  });

  it("rejects tampered, foreign-key, expired, future and malformed tokens", () => {
    const token = issueResearchReceipt("youtube_video_audit", {
      video: "abcdefghijk",
      state: "api_visible_complete",
      lock: "pass",
      records: 120
    }, { secret: SECRET, now });

    expect(verifyResearchReceipt(token.replace("records=120", "records=999"), { secret: SECRET, now }))
      .toEqual({ ok: false, reason: "signature_invalid" });
    expect(verifyResearchReceipt(token, { secret: `${SECRET}-other`, now }))
      .toEqual({ ok: false, reason: "signature_invalid" });
    expect(verifyResearchReceipt(token, {
      secret: SECRET,
      now: () => new Date(NOW.getTime() + 25 * 60 * 60 * 1000)
    })).toEqual({ ok: false, reason: "expired" });
    expect(verifyResearchReceipt(token, {
      secret: SECRET,
      now: () => new Date(NOW.getTime() - 60 * 60 * 1000)
    })).toEqual({ ok: false, reason: "expired" });
    for (const malformed of ["", "rr1~x", "rr0~a~b~1~c", `${token}~extra`]) {
      expect(verifyResearchReceipt(malformed, { secret: SECRET, now }).ok).toBe(false);
    }
  });

  it("binds page cursors to their query and settles a page a later round continued", () => {
    const next = cursorDigest("Hip pain  what worked", "CAoQAA");
    expect(next).toMatch(/^[a-f0-9]{12}$/u);
    // Case and spacing in the query do not matter; the query does, because
    // YouTube page tokens encode only an offset.
    expect(cursorDigest(" hip pain what worked", "CAoQAA")).toBe(next);
    expect(cursorDigest("hip gelatin", "CAoQAA")).not.toBe(next);
    expect(cursorDigest("hip pain what worked", "CBQQAA")).not.toBe(next);

    const pageOne = { claims: { open: "1", nx: next } };
    const pageTwo = { claims: { open: "0", pg: next } };
    expect(roundUnreadPages(pageOne.claims, continuedCursors([pageOne]))).toBe(1);
    expect(roundUnreadPages(pageOne.claims, continuedCursors([pageOne, pageTwo]))).toBe(0);
    // A survey signs lists: one of its two next pages is still unread.
    expect(roundUnreadPages({ open: "2", nx: [next, "aaaaaaaaaaaa"] }, continuedCursors([pageTwo]))).toBe(1);
    // Receipts without nx (scouts, and receipts from before it) report their open count.
    expect(roundUnreadPages({ open: "3" }, continuedCursors([pageTwo]))).toBe(3);
    expect(roundUnreadPages({}, new Set())).toBe(0);
  });

  it("uses the finalization secret when set, else the continuation secret, and needs 32 bytes", () => {
    expect(researchReceiptSecretFromEnv({})).toBeUndefined();
    expect(researchReceiptSecretFromEnv({ ASKRIGOR_YOUTUBE_CONTINUATION_SECRET: "short" })).toBeUndefined();
    expect(researchReceiptSecretFromEnv({ ASKRIGOR_YOUTUBE_CONTINUATION_SECRET: SECRET })).toBe(SECRET);
    expect(researchReceiptSecretFromEnv({
      ASKRIGOR_YOUTUBE_CONTINUATION_SECRET: SECRET,
      ASKRIGOR_FINALIZATION_SIGNING_SECRET: `${SECRET}-final`
    })).toBe(`${SECRET}-final`);
    expect(() => issueResearchReceipt("youtube_survey", {}, { secret: "short" })).toThrow();
  });
});
