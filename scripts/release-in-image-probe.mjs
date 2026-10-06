// Release acceptance probe, run inside the live research-mcp container:
//   ssh mission-control-secondary 'docker exec -i -w /app askrigor-research-mcp-1 node --input-type=module -' < scripts/release-in-image-probe.mjs
// Note: it calls PubMed once, reads one public YouTube video with Gemini (about 360 seconds of the
// daily Gemini video allowance, on the unbilled key) and asks Reddit's embed endpoint about two links.
// Change the video or the questions to fit a release; keep the output to counts, versions and states.

// In-image acceptance probe for the 2026-10-04 release: an in-memory MCP client
// inside the live research-mcp container, with the container's own environment.
// Prints counts, versions and states only: no secrets, no request or reply bodies.
import { stat } from "node:fs/promises";
import { dirname, join } from "node:path";

const { Client } = await import("/app/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js");
const { InMemoryTransport } = await import("/app/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js");
const { createAskRigorServer } = await import("/app/apps/research-mcp/dist/server.js");
const { versionPayload, runningVersionsOf } = await import("/app/apps/research-mcp/dist/version.js");
const { lookupRedditThread } = await import("/app/packages/sources/dist/reddit-thread.js");

const running = runningVersionsOf(await versionPayload());
console.log("running:", JSON.stringify(running));

async function connect(profile, options) {
  const server = createAskRigorServer(profile, options);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "askrigor-release-probe", version: "0.1.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

const { client, server } = await connect("standard", { runningVersions: running });
const { tools } = await client.listTools();
const info = client.getServerVersion();
console.log(`standard catalog: ${tools.length} tools (${new Set(tools.map((t) => t.name)).size} unique); first ${tools[0].name}`);
console.log(`first description starts: ${tools[0].description.slice(0, 96)}`);
console.log(`server title: ${info.title} | version: ${info.version}`);
console.log(`video tool listed: ${tools.some((t) => t.name === "extract_youtube_video_claims")}`);
const gemini = await connect("gemini", {});
console.log(`gemini catalog: ${(await gemini.client.listTools()).tools.length} tools`);
await gemini.client.close();

for (const protocol of ["hrp", "universal"]) {
  const result = await client.callTool({ name: "get_protocol_manifest", arguments: { protocol } });
  const m = result.structuredContent?.manifest;
  console.log(`manifest ${protocol}: ${m?.name} ${m?.version} ${m?.revisionDate} ${m?.sha256?.slice(0, 16)}`);
}
const index = await client.callTool({ name: "load_protocol", arguments: { protocol: "hrp", section: "index" } });
console.log(`load_protocol hrp index: ok=${index.structuredContent?.ok} error=${index.isError === true}`);

const pubmed = await client.callTool({ name: "search_pubmed", arguments: { query: "frozen shoulder hydrodilatation", page_size: 1 } });
const pm = pubmed.structuredContent ?? {};
const pmRecords = Array.isArray(pm.data) ? pm.data.length : 0;
console.log(`pubmed: records=${pmRecords} receipt=${typeof pm.research_receipt === "string"}`);

const started = Date.now();
let calls = 0;
let video = await client.callTool({ name: "extract_youtube_video_claims", arguments: { video: "https://www.youtube.com/watch?v=0aj0UTxmmv4" } });
calls += 1;
while (video.structuredContent?.status === "pending" && calls < 8) {
  const wait = Math.min(30, video.structuredContent.retry_after_seconds ?? 15);
  await new Promise((resolve) => setTimeout(resolve, wait * 1000));
  video = await client.callTool({ name: "extract_youtube_video_claims", arguments: { continuation_token: video.structuredContent.continuation_token } });
  calls += 1;
}
const v = video.structuredContent ?? {};
console.log(`video: status=${v.status} error=${video.isError === true} calls=${calls} seconds=${Math.round((Date.now() - started) / 1000)} claims=${(v.claims ?? []).length} sponsorships=${(v.sponsorships ?? []).length} duration=${v.video?.duration}`);
if (video.isError === true) console.log(`video refusal: ${JSON.stringify(video.content?.[0]?.text ?? "").slice(0, 300)}`);

const found = await lookupRedditThread("https://www.reddit.com/r/frozenshoulder/comments/15oyv1r/is_it_ok_to_leave_the_frozen_shoulder_untreated/");
console.log(`reddit lookup: state=${found.state} title=${(found.title ?? "").slice(0, 60)}`);
const missing = await lookupRedditThread("https://www.reddit.com/r/frozenshoulder/comments/zzzzzz9/not_a_thread/");
console.log(`reddit missing: state=${missing.state}`);

const ledger = process.env.ASKRIGOR_AI_BUDGET_LEDGER;
if (ledger !== undefined) {
  for (const path of [dirname(ledger), ledger, join(dirname(ledger), "gemini-video-seconds.json")]) {
    try {
      console.log(`mode ${path}: ${((await stat(path)).mode & 0o777).toString(8)}`);
    } catch (error) {
      console.log(`mode ${path}: ${error.code}`);
    }
  }
}
await client.close();
await server.close();
