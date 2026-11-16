import { createHash } from "node:crypto";

import {
  InMemoryResearchContributorAccessStore, RESEARCH_USE_NOTICE_VERSION, ResearchContributorAccessService,
} from "@askrigor/evidence-repository";
import { describe, expect, it } from "vitest";

import { withLaterInputs } from "../apps/research-mcp/src/later-inputs.js";
import { namedVideosFromReceipt, withoutYouTubeData } from "../apps/research-mcp/src/findings/card.js";
import {
  createManageResearchAccessHandler, manageResearchAccessInputSchema,
} from "../apps/research-mcp/src/research-contributor-access-tool.js";
import {
  NAMED_VIDEOS_NOTE, finalizeResearch, plainAnswerClaimDigest,
} from "../apps/research-mcp/src/research-finalization-gate.js";
import {
  issueResearchReceipt, plainAnswerAccountBinding, researchTargetDigest, verifyResearchReceipt,
} from "../apps/research-mcp/src/research-receipts.js";
import { atlasLookupFixture } from "./helpers/atlas-lookup-fixture.js";
import { withCommunitySkip } from "./helpers/community-skip.js";
import {
  ACCOUNT_KEY, DOI, NOW, OTHER_VIDEO, QUOTE, SECRET, TARGET, VIDEO, WATCH, videoCard,
} from "./helpers/named-videos-fixture.js";

const options = { secret: SECRET, now: () => NOW };
const ACCOUNT = plainAnswerAccountBinding(SECRET, ACCOUNT_KEY);
const sign = (kind: Parameters<typeof issueResearchReceipt>[0], claims: Parameters<typeof issueResearchReceipt>[1]) =>
  issueResearchReceipt(kind, claims, options);
const plain = (extra: Record<string, string | number | string[]> = {}) => sign("plain_answer", {
  claims: [plainAnswerClaimDigest(QUOTE)], text: createHash("sha256").update(QUOTE).digest("hex"),
  target: researchTargetDigest(TARGET), acct: ACCOUNT, t: 1000, ...extra,
});
const videoReceipt = (kind: "youtube_video_claims" | "youtube_video_unread" | "youtube_video_pending" = "youtube_video_claims") =>
  sign(kind, { video: VIDEO, mode: "claims", n: 1, code: "synthetic-not-read", t: 3000 });
const discovery = () => sign("youtube_search", {
  videos: [VIDEO], n: 1, target: researchTargetDigest(TARGET), q: "c".repeat(12), t: 2500,
});
const declaration = { status: "not_applicable" as const, reason: "Synthetic chemistry fixture isolates named video links." };

function check(registration: string[], links: string[] | null = [WATCH], videos: string[] = []) {
  return finalizeResearch(withCommunitySkip({
    research_target: TARGET, research_depth: "deep", treatment_choice: "not_compared", community_evidence: "not_relevant",
    not_relevant_basis: "no_real_world_outcome", question_about: "other", not_relevant_reason: declaration.reason,
    commercial_review_applicability: declaration, intervention_identity: declaration, lab_preparation: declaration,
    full_text_search: { status: "not_needed", reason: declaration.reason },
    receipts: [...registration, sign("study_audit", { id: DOI, status: "complete_no_unresolved_fields", t: 2000 }),
      atlasLookupFixture(TARGET, options), ...videos],
    key_sources: [{ id: DOI, status: "validated", read_depth: "full_text_audited", answer_marker: "Invented study" }],
    answer_draft: `[Invented study](https://doi.org/${DOI}) was read in full. ${QUOTE}`,
    absence_claims: [], binary_results: [], scale_results: [], user_observations: [], proposed_tests: [], safety_claims: [],
    safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [],
    plain_answer_comparison: [{ claim: QUOTE, outcome: "confirmed", answer_quote: QUOTE, sources: [DOI] }],
    later_inputs: { findings_card: videoCard(links ?? undefined),
      source_reading: [{ source: DOI, reading: "full_text_audited", quote: "was read in full" }] },
  }), { ...options, findings: "save", plainAnswer: { note: false, account: ACCOUNT } });
}

function finalClaims(result: ReturnType<typeof check>) {
  expect(result.next_steps).toEqual([]);
  expect(result.status).toMatch(/^ready/u);
  expect(result.findings_card.status).toBe("checked");
  const verified = verifyResearchReceipt(result.finalization_receipt!, options);
  expect(verified.ok).toBe(true);
  if (!verified.ok) throw new Error("Synthetic finalization receipt did not verify");
  return verified.claims;
}

describe("registration signs the person's linked videos on an ordinary free account", () => {
  async function register(asked?: string, paid = false) {
    const store = new InMemoryResearchContributorAccessStore();
    const service = new ResearchContributorAccessService({ store, identitySecret: Buffer.alloc(32, 29) });
    const subject = "auth0|named-videos-fixture";
    await service.acceptFreeContributor(subject, { noticeVersion: RESEARCH_USE_NOTICE_VERSION,
      eligibleDeidentifiedResearchContributionRequired: true, prohibitedPrivateAndRawContentExcluded: true,
      proposalReviewAndNoAuthorityAcknowledged: true, paidPrivateAlternativeAcknowledged: true });
    if (paid) {
      store.grantPrivateEntitlement({ entitlementId: "77777777-7777-4777-a777-777777777777",
        accountKey: service.accountKeyForSubject(subject), status: "ACTIVE", source: "OWNER_GRANTED",
        externalReferenceSha256: null, grantedAt: NOW.toISOString(), expiresAt: null, revokedAt: null });
      await service.activatePaidPrivate(subject);
    }
    const handler = createManageResearchAccessHandler({ service,
      plainAnswer: { sign: (claims, accountKey) => sign("plain_answer", {
        ...claims, acct: plainAnswerAccountBinding(SECRET, accountKey), t: 1000,
      }) },
    });
    const { execute } = withLaterInputs("manage_research_access", manageResearchAccessInputSchema, handler);
    const result = await execute({ action: "register_plain_answer", plainAnswer: {
      researchTarget: TARGET, text: QUOTE, claims: [QUOTE],
    }, ...(asked === undefined ? {} : { later_inputs: { asked } }) }, { authInfo: {
      token: "synthetic-token", clientId: "synthetic-client", scopes: ["research:use"],
      extra: { subject }, expiresAt: Math.floor(Date.now() / 1000) + 300,
    } });
    expect(result.isError).not.toBe(true);
    const receipt = (result.structuredContent as { research_receipt: string }).research_receipt;
    const verified = verifyResearchReceipt(receipt, options);
    expect(verified).toMatchObject({ ok: true, kind: "plain_answer" });
    if (!verified.ok) throw new Error("Synthetic registration receipt did not verify");
    return { claims: verified.claims,
      text: result.content.flatMap((block) => block.type === "text" ? [block.text] : []).join("\n") };
  }

  it("signs asked and vids and explains one linked video", async () => {
    const result = await register(`Explain https://youtu.be/${VIDEO}.`);
    expect(result.claims).toMatchObject({ asked: "1", vids: [VIDEO] });
    expect(result.text).toContain("The person's words link a YouTube video");
  });

  it("signs the person's linked video on a paid private account too", async () => {
    const result = await register(`Explain ${WATCH}.`, true);
    expect(result.claims).toMatchObject({ asked: "1", vids: [VIDEO] });
    expect(result.text).toContain("The person's words link a YouTube video");
  });

  it("signs asked without vids or the new sentence when the words link no video", async () => {
    const result = await register("Explain the invented molecule.");
    expect(result.claims.asked).toBe("1");
    expect(result.claims).not.toHaveProperty("vids");
    expect(result.text).not.toContain("The person's words link");
  });

  it("signs neither asked nor vids when no words were passed on", async () => {
    const result = await register();
    expect(result.claims).not.toHaveProperty("asked");
    expect(result.claims).not.toHaveProperty("vids");
    expect(result.text).not.toContain("The person's words link");
  });

  it("deduplicates linked IDs and describes several videos", async () => {
    const result = await register(`${WATCH} https://youtu.be/${VIDEO} https://youtu.be/${OTHER_VIDEO}`);
    expect(result.claims.vids).toEqual([VIDEO, OTHER_VIDEO]);
    expect(result.text).toContain("The person's words link 2 YouTube videos");
  });

  it("signs at most ten video IDs from the person's words", async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `nvLimit${String(i).padStart(4, "0")}`);
    const result = await register(ids.map((id) => `https://youtu.be/${id}`).join(" "));
    expect(result.claims.vids).toEqual(ids.slice(0, 10));
  });
});

describe("finalization signs only a named video's permitted receipt claim, without adding steps", () => {
  it("signs a video linked by this account's registered words", () => {
    const result = check([plain({ asked: "1", vids: [VIDEO] })]);
    expect(finalClaims(result).nv).toEqual([`1.${VIDEO}`]);
    expect((result.notes ?? []).join(" ")).not.toContain("named_videos[0]");
  });

  it("refuses a video the registered words do not link", () => {
    const result = check([plain({ asked: "1" })], [WATCH], [videoReceipt()]);
    expect(finalClaims(result)).not.toHaveProperty("nv");
    expect((result.notes ?? []).join(" ")).toContain("The words passed on with the latest registration link no such video");
  });

  // Codex's review of 15 November 2026, finding 1: a reading by extract_youtube_video_claims shows that a video was read,
  // not who gave it, so it no longer counts by itself.
  it.each(["youtube_video_claims", "youtube_video_unread", "youtube_video_pending"] as const)(
    "does not sign a video only %s shows, when no words were passed on", (kind) => {
      const result = check([plain()], [WATCH], [videoReceipt(kind)]);
      expect(finalClaims(result)).not.toHaveProperty("nv");
      expect((result.notes ?? []).join(" ")).toContain("No words of the person were passed on with that registration");
    });

  it("does not sign an unlinked video without the person's words", () => {
    const result = check([plain()]);
    expect(finalClaims(result)).not.toHaveProperty("nv");
    expect((result.notes ?? []).join(" ")).toContain("passed on in later_inputs.asked when the plain answer was registered");
  });

  it("does not turn an AskRigor discovery receipt into a person's named video", () => {
    const result = check([plain()], [WATCH], [discovery()]);
    expect(finalClaims(result)).not.toHaveProperty("nv");
    expect((result.notes ?? []).join(" ")).toContain("A video found through AskRigor's YouTube tools is never linked");
  });

  it("does not sign a video a YouTube search here turned up and the person's-video tool then read", () => {
    const result = check([plain()], [WATCH], [discovery(), videoReceipt()]);
    expect(finalClaims(result)).not.toHaveProperty("nv");
    expect(withoutYouTubeData(videoCard([WATCH]), new Set(), {
      namedVideos: namedVideosFromReceipt(finalClaims(result).nv, 1),
    }).card.findings[0]!.named_videos).toBeUndefined();
  });

  it("signs a video a search also turned up when the person's own words name it", () => {
    const claims = finalClaims(check([plain({ asked: "1", vids: [VIDEO] })], [WATCH], [discovery(), videoReceipt()]));
    expect(claims.nv).toEqual([`1.${VIDEO}`]);
  });

  it("ignores another account's registered video and its asked flag", () => {
    const foreign = plain({ asked: "1", vids: [VIDEO], acct: plainAnswerAccountBinding(SECRET, "f".repeat(64)) });
    expect(finalClaims(check([plain({ asked: "1" }), foreign]))).not.toHaveProperty("nv");
    expect(finalClaims(check([plain(), foreign], [WATCH], [videoReceipt()]))).not.toHaveProperty("nv");
  });

  // Codex's review of 15 November 2026, finding 2.
  it("ignores a registration for another research target", () => {
    const otherTarget = plain({ asked: "1", vids: [VIDEO], target: researchTargetDigest("An invented other research target."), t: 1100 });
    expect(finalClaims(check([plain({ asked: "1" }), otherTarget]))).not.toHaveProperty("nv");
  });

  it("counts only the latest registration for this research target", () => {
    const older = plain({ asked: "1", vids: [VIDEO], t: 900 });
    const newer = plain({ asked: "1", t: 1000 });
    expect(finalClaims(check([older, newer]))).not.toHaveProperty("nv");
    const newerWithVideo = plain({ asked: "1", vids: [VIDEO], t: 1000 });
    expect(finalClaims(check([plain({ asked: "1", t: 900 }), newerWithVideo])).nv).toEqual([`1.${VIDEO}`]);
  });

  it("keeps the same status and next steps with and without named_videos", () => {
    const receipts = [plain({ asked: "1", vids: [VIDEO] })];
    const withVideo = check(receipts);
    const withoutVideo = check(receipts, null);
    finalClaims(withVideo);
    finalClaims(withoutVideo);
    expect(withVideo.status).toBe(withoutVideo.status);
    expect(withVideo.next_steps).toEqual(withoutVideo.next_steps);
  });
});
