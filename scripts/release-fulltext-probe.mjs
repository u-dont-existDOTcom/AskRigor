// Release acceptance probe: Europe PMC section search and owner-library error codes; prints no paper text or keys.
//   ssh mission-control-secondary 'docker exec -i -w /app askrigor-research-mcp-1 node --input-type=module -' < scripts/release-fulltext-probe.mjs
// In-image acceptance of the 8195c324 release: Europe PMC section search and the owner library's error codes.
// Prints states, codes and counts only: never paper text, links or keys.
const { Client } = await import("/app/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js");
const { InMemoryTransport } = await import("/app/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js");
const { createAskRigorServer } = await import("/app/apps/research-mcp/dist/server.js");
const { acquireOpenFullText, canSignFullTextLead } = await import("/app/packages/sources/dist/index.js");
const { infoAccessClientFromEnv } = await import("/app/apps/research-mcp/dist/infoaccess-client.js");

const server = createAskRigorServer("standard", {});
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: "askrigor-release-probe", version: "0.1.0" });
await server.connect(serverTransport);
await client.connect(clientTransport);

// One Europe PMC search within article sections: expect full_text_scope and a signed receipt.
const search = await client.callTool({ name: "search_europe_pmc",
  arguments: { query: 'ABSTRACT:"levodopa" AND METHODS:"carbidopa"', page_size: 1 } });
const s = search.structuredContent ?? {};
console.log(`europe pmc section search: isError=${search.isError === true} status=${s.access_status ?? s.status ?? "-"} ` +
  `full_text_scope=${JSON.stringify(s.full_text_scope ?? s.data?.full_text_scope ?? null)} ` +
  `receipt=${typeof (s.research_receipt ?? s.data?.research_receipt) === "string"}`);
await client.close(); await server.close();

// The owner library: the client's error code, then the route's attempt and envelope for the owner's three test papers.
const library = infoAccessClientFromEnv();
console.log(`library configured: ${library !== undefined}`);
const config = process.env.UNPAYWALL_EMAIL || process.env.ASKRIGOR_UNPAYWALL_EMAIL
  ? { email: process.env.UNPAYWALL_EMAIL ?? process.env.ASKRIGOR_UNPAYWALL_EMAIL } : undefined;
for (const doi of ["10.1006/bbrc.2001.4945", "10.1016/s0887-8994(99)00152-6", "10.1016/s0166-4328(03)00097-4"]) {
  let code = "fetched";
  try { await library.fetchPdf(doi); } catch (error) { code = error?.code ?? "no code"; }
  const result = await acquireOpenFullText({ doi }, config, { ownerLibrary: { access: "owner", fetchPdf: (d) => library.fetchPdf(d) } });
  const d = result.data ?? {};
  const attempt = (d.discovery_attempts ?? []).filter((a) => a.route === "owner_library").map((a) => a.result).join(",") || "-";
  console.log(`${doi}: client code=${code} | owner_library=${attempt} access_status=${result.access_status} ` +
    `error=${result.error?.code ?? "-"} retryable=${result.error?.retryable ?? "-"} lead signable=${canSignFullTextLead(d)} ` +
    `state=${d.acquisition_state ?? "FULL_TEXT_READABLE"}`);
}
