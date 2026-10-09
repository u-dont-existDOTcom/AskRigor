import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { auditYoutubeCommunity } from "../apps/research-mcp/src/youtube-community-audit.js";
import { surveyYoutubeCommunity } from "../apps/research-mcp/src/youtube-community-survey.js";
import { auditYoutubeVideoCommunity } from "../apps/research-mcp/src/youtube-video-community-audit.js";
import { decodeYoutubeAuditContinuation, encodeYoutubeAuditContinuation } from "../apps/research-mcp/src/youtube-audit-continuation.js";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import { verifyResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";

const SECRET = "exact-product-identity-test-secret-0123456789";
const YOUTUBE = { apiKey: "synthetic-key" };
const IDS = ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"];
const MUSSK = { names: ["MUSSK"], maker_names: ["SAVA"], other_variant_names: ["Livstar", "MUUCHSTAC"] };
const NANBAO = { names: ["Nan Bao", "男宝"], maker_names: ["Lisheng"], other_variant_names: ["Changhong"] };
const config = { youtube: YOUTUBE, continuation_secret: SECRET };

function provider(nanbao = false, continued = false) {
  const requests: URL[] = [];
  const comment = (id: string, text: string, parentId?: string) => ({
    kind: "youtube#comment", id,
    snippet: { videoId: IDS[2], textDisplay: text, textOriginal: text, ...(parentId ? { parentId } : {}),
      likeCount: 0, publishedAt: "2026-10-07T00:00:00Z", updatedAt: "2026-10-07T00:00:00Z" }
  });
  const texts = nanbao ? ["I used Changhong Nan Bao", "Lisheng helped", "No change"] : ["SAVA helped", "Livstar helped", "No change"];
  const comments = texts.map((text, index) => comment(`comment${index}`, text));
  const reply = comment("reply0", "Changhong", comments[0]!.id);
  vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
    const url = new URL(String(input)); requests.push(url);
    const respond = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (url.pathname.endsWith("/search")) return respond({ kind: "youtube#searchListResponse", pageInfo: { totalResults: 3, resultsPerPage: 3 }, items: IDS.map((videoId, index) => ({
      kind: "youtube#searchResult", id: { kind: "youtube#video", videoId },
      snippet: { title: ["SAVA Livstar", "MUUCHSTAC face wash", nanbao ? "Lisheng Nan Bao" : "General review"][index], description: "Search snippet" }
    })) });
    if (url.pathname.endsWith("/videos")) {
      const id = url.searchParams.get("id")!;
      return respond({ kind: "youtube#videoListResponse", pageInfo: { totalResults: 1, resultsPerPage: 1 }, items: [{ kind: "youtube#video", id,
        snippet: { title: id === IDS[0] ? "SAVA Livstar" : id === IDS[1] ? "MUUCHSTAC face wash" : "General review",
          description: id === IDS[2] ? (nanbao ? "天津男宝 Lisheng" : "Full review of MUSSK by SAVA") : "Other product",
          tags: ["review"] }, statistics: { commentCount: nanbao ? "4" : "3" }
      }] });
    }
    if (url.pathname.endsWith("/commentThreads")) {
      const next = url.searchParams.has("pageToken");
      const selected = continued ? next ? comments.slice(1) : comments.slice(0, 1) : comments;
      return respond({ kind: "youtube#commentThreadListResponse", pageInfo: { totalResults: 3, resultsPerPage: selected.length },
        ...(continued && !next ? { nextPageToken: "next" } : {}), items: selected.map((topLevelComment) => ({ kind: "youtube#commentThread", id: `thread${topLevelComment.id}`,
          snippet: { videoId: IDS[2], topLevelComment, totalReplyCount: nanbao && topLevelComment.id === "comment0" ? 1 : 0 },
          ...(nanbao && topLevelComment.id === "comment0" ? { replies: { comments: [reply] } } : {})
        })) });
    }
    if (url.pathname.endsWith("/comments")) {
      const ids = (url.searchParams.get("id") ?? "").split(",");
      const selected = url.searchParams.has("parentId") ? (nanbao && url.searchParams.get("parentId") === "comment0" ? [reply] : []) : [...comments, ...(nanbao ? [reply] : [])].filter(({ id }) => ids.includes(id));
      return respond({ kind: "youtube#commentListResponse", pageInfo: { totalResults: selected.length, resultsPerPage: selected.length }, items: selected });
    }
    throw new Error(`Unexpected synthetic provider request: ${url.pathname}`);
  }));
  return requests;
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("YouTube product identity integration", () => {
  it("skips Livstar and MUUCHSTAC and audits the next matching full-description video without more searches", async () => {
    const requests = provider();
    const result = await auditYoutubeCommunity({ research_question: "MUSSK", searches: [{ direction: "general", query: "MUSSK" }], max_videos: 3, product_identity: MUSSK }, YOUTUBE);
    expect(result.videos.map(({ video_id }) => video_id)).toEqual([IDS[2]]);
    expect(result.skipped_videos).toEqual(IDS.slice(0, 2).map((video_id) => ({ video_id, product_class: "other_product" })));
    expect(result.videos[0]).toMatchObject({ product_class: "exact", comment_product_counts: { exact: 2, other_variant: 1, variant_unresolved: 0 } });
    expect(requests.filter(({ pathname }) => pathname.endsWith("/search"))).toHaveLength(1);
    expect(requests.filter(({ pathname }) => pathname.endsWith("/commentThreads")).every((url) => url.searchParams.get("videoId") === IDS[2])).toBe(true);
  });

  it("keeps only admitted survey candidates and reports excluded classes", async () => {
    provider();
    const result = await surveyYoutubeCommunity({ research_question: "MUSSK", searches: [{ direction: "general", query: "MUSSK" }], product_identity: MUSSK }, YOUTUBE);
    expect(result.candidates).toMatchObject([{ video_id: IDS[2], product_class: "exact" }]);
    expect(result.excluded_videos).toHaveLength(2);
  });

  it("marks Changhong comments and replies as other variants in an unspaced Lisheng Nan Bao video", async () => {
    provider(true);
    const result = await auditYoutubeVideoCommunity({ video_id_or_url: IDS[2], product_identity: NANBAO }, config);
    expect(result.product_class).toBe("exact");
    expect(result.sample?.comments.find(({ comment_id }) => comment_id === "comment0")?.product_class).toBe("other_variant");
    expect(result.sample?.comments.find(({ comment_id }) => comment_id === "reply0")?.product_class).toBe("other_variant");
    expect(result.comment_product_counts).toEqual({ exact: 2, variant_unresolved: 0, other_variant: 2 });
  });

  it("refuses a nonadmitted video before comments and allows general auditing", async () => {
    const requests = provider();
    await expect(auditYoutubeVideoCommunity({ video_id_or_url: IDS[0], product_identity: MUSSK }, config)).rejects.toThrow("other_product");
    expect(requests.some(({ pathname }) => pathname.endsWith("/commentThreads"))).toBe(false);
    provider();
    const general = await auditYoutubeVideoCommunity({ video_id_or_url: IDS[2] }, config);
    expect(general).toMatchObject({ receipt: { synthesis_lock: "pass" } });
  });

  it("binds names by digest across continuation without retaining names, and keeps cumulative class counts", async () => {
    provider(false, true);
    const runtime = { segment: { max_provider_requests: 1 } };
    const first = await auditYoutubeVideoCommunity({ video_id_or_url: IDS[2], product_identity: MUSSK }, config, runtime);
    expect(first.continuation_token).toBeDefined();
    const state = decodeYoutubeAuditContinuation(first.continuation_token!, SECRET, Date.now());
    expect(state.product_identity_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(state)).not.toMatch(/MUSSK|SAVA|Livstar|MUUCHSTAC/);
    expect(() => encodeYoutubeAuditContinuation({ ...state, comment_product_counts: { exact: 99, variant_unresolved: 0, other_variant: 0 } }, SECRET)).toThrow("Invalid YouTube audit continuation state");
    await expect(auditYoutubeVideoCommunity({ continuation_token: first.continuation_token }, config)).rejects.toThrow("same product_identity");
    await expect(auditYoutubeVideoCommunity({ continuation_token: first.continuation_token, product_identity: { ...MUSSK, names: ["Other"] } }, config)).rejects.toThrow("same product_identity");
    const last = await auditYoutubeVideoCommunity({ continuation_token: first.continuation_token, product_identity: MUSSK }, config);
    expect(last.comment_product_counts).toEqual({ exact: 2, variant_unresolved: 0, other_variant: 1 });
    expect(last.records_retrieved_cumulative).toBe(3);
  });

  it("exposes all four identity inputs, compact comment classes and exact product receipts through MCP", async () => {
    provider(true);
    vi.stubEnv("YOUTUBE_API_KEY", YOUTUBE.apiKey);
    vi.stubEnv("ASKRIGOR_YOUTUBE_CONTINUATION_SECRET", SECRET);
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    const server = createAskRigorServer("standard", { researchAccessRequired: false, findingsLibrary: false });
    const client = new Client({ name: "product-identity", version: "0.1.0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(b); await client.connect(a);
      expect((await client.listTools()).tools).toHaveLength(33);
      const call = async (name: string, args: Record<string, unknown>, refused = false) => {
        const result = await client.callTool({ name, arguments: args });
        if (refused) expect(result.isError).toBe(true);
        else expect(result.isError).not.toBe(true);
        return result.structuredContent as Record<string, any>;
      };
      const search = await call("search_youtube", { query: "Nan Bao", product_identity: NANBAO });
      expect(search.data[2].product_class).toBe("exact");
      expect(search.limitations.join(" ")).toContain("search snippets");
      for (const name of ["survey_youtube_community", "audit_youtube_community"]) {
        const result = await call(name, { research_question: "Nan Bao", searches: [{ direction: "general", query: "Nan Bao" }], product_identity: NANBAO, ...(name === "audit_youtube_community" ? { max_videos: 3 } : {}) });
        expect(verifyResearchReceipt(result.research_receipt, { secret: SECRET })).toMatchObject({ ok: true, claims: { product: "nan bao", exact: [IDS[2]] } });
      }
      const audit = await call("audit_youtube_video_community", { video_id_or_url: IDS[2], product_identity: NANBAO });
      expect(audit.sample.comments.find((c: any) => c.id === "comment0").product_class).toBe("other_variant");
      expect(verifyResearchReceipt(audit.research_receipt, { secret: SECRET })).toMatchObject({ ok: true, claims: { product: "nan bao", exact: [IDS[2]] } });
      expect(audit.research_receipt).not.toContain("Lisheng");
      const refused = await call("audit_youtube_video_community", { video_id_or_url: IDS[0], product_identity: NANBAO }, true);
      expect(refused.error).toMatchObject({ code: "youtube_product_identity_refused" });
      expect(refused.limitations.join(" ")).toContain("not admitted");
      expect(refused.research_receipt).toBeUndefined();
    } finally { await client.close(); await server.close(); }
  });
});
