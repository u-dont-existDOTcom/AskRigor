import { Script, runInNewContext } from "node:vm";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FINAL_CHECK_PANEL_META, FINAL_CHECK_PANEL_URI, FINAL_CHECK_PANEL_RENDER_SOURCE, FINAL_CHECK_PANEL_BOOTSTRAP_SOURCE,
  finalCheckPanelHtml, finalCheckPanelWidgetDomain, inlineFinalCheckAppBundle,
} from "../apps/research-mcp/src/final-check-panel.js";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import {
  finalizeResearch, mustReportFindings, type FinalizeResearchInput,
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";

const MIME = "text/html;profile=mcp-app";
const SECRET = "final-check-panel-test-secret-01234567890123456789";

// Same validated, full-text-audited fixture and ready expectation as finalize-read-depth.test.ts.
function fixture(): FinalizeResearchInput {
  return {
    receipts: [issueResearchReceipt("study_audit", { doi: "10.1000/depth", content: "a".repeat(16) }, { secret: SECRET })],
    research_target: "Synthetic reading-depth declaration", research_depth: "deep", treatment_choice: "not_compared",
    community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome",
    not_relevant_reason: "Synthetic fixture isolates structural reading-depth checks.",
    commercial_review_applicability: { status: "not_applicable", reason: "Synthetic fixture concerns no commercial product." },
    intervention_identity: { status: "not_applicable", reason: "Synthetic fixture contains no study intervention." },
    full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates reading-depth checks." },
    lab_preparation: { status: "not_applicable", reason: "Synthetic fixture interprets no lab result and plans no test." },
    key_sources: [{ id: "10.1000/depth", status: "validated", read_depth: "full_text_audited", answer_marker: "[Texte lu]" }],
    absence_claims: [], scale_results: [], safety_claims: [], key_terms: [], mechanism_claims: [], recommendations: [],
    answer_draft: "[Texte lu] [Étude](https://doi.org/10.1000/depth).",
  };
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe.each(["/mcp", "/mcp/claude"] as const)("final check panel on %s", (mcpSurface) => {
  it("lists and reads the sandboxed resource, retains metadata, and preserves the final check result", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    vi.stubEnv("ASKRIGOR_OAUTH_RESOURCE_URL", "https://mcp.example.org/mcp");
    const server = createAskRigorServer("standard", { mcpSurface, researchAccessRequired: false, findingsLibrary: false });
    const client = new Client({ name: "final-check-panel-test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(b); await client.connect(a);
      const { resources } = await client.listResources();
      expect(resources).toEqual([{
        name: "AskRigor final check", uri: FINAL_CHECK_PANEL_URI, mimeType: MIME,
        description: "Displays AskRigor's final check result in the client's sandboxed frame.",
      }]);
      const { contents } = await client.readResource({ uri: FINAL_CHECK_PANEL_URI });
      expect(contents).toEqual([{
        uri: FINAL_CHECK_PANEL_URI, mimeType: MIME, text: finalCheckPanelHtml(),
        _meta: {
          ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } },
          "openai/widgetDomain": "https://mcp.example.org",
        },
      }]);
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(33);
      const tool = tools.find(({ name }) => name === "finalize_research")!;
      expect(tool._meta).toMatchObject({
        ui: { resourceUri: FINAL_CHECK_PANEL_URI },
        "ui/resourceUri": FINAL_CHECK_PANEL_URI, "openai/outputTemplate": FINAL_CHECK_PANEL_URI,
        securitySchemes: expect.any(Array),
      });
      const input = fixture();
      const result = await client.callTool({ name: "finalize_research", arguments: { ...input } });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toEqual(finalizeResearch(input, { secret: SECRET, findings: "closed" }));
      expect(result.structuredContent).toMatchObject({
        status: "ready", check_line: "Checked with AskRigor's final check.",
        next_steps: [], limits: [], sources: { validated: ["10.1000/depth"], lead_only: [] },
      });
      expect(result.content).toEqual([{ type: "text", text: expect.stringContaining("Research finalization: ready; 0 next step(s), 0 limit(s) to state;") }]);
      expect(result._meta).toEqual({ [FINAL_CHECK_PANEL_META]: { must_report: [] } });
    } finally { await client.close(); await server.close(); }
  });
});

// ChatGPT reads the panel's origin from OpenAI's own key; Claude would refuse to draw the panel for any ui.domain other
// than its hashed claudemcpcontent.com form, so that field is never set (2026-10-16 "CSP off" badge, unverified).
describe("panel origin", () => {
  it.each([
    ["https://mcp.askrigor.com/mcp", "https://mcp.askrigor.com"],
    ["https://mcp.example.org:8443/mcp/claude", "https://mcp.example.org:8443"],
    ["http://localhost:3000/mcp", undefined],
    ["not a url", undefined],
    [undefined, undefined],
  ])("derives %s as %s", (resourceUrl, origin) => {
    expect(finalCheckPanelWidgetDomain(resourceUrl === undefined ? {} : { ASKRIGOR_OAUTH_RESOURCE_URL: resourceUrl }))
      .toBe(origin);
  });
  it("omits the origin, and never sets ui.domain, without a configured resource URL", async () => {
    vi.stubEnv("ASKRIGOR_OAUTH_RESOURCE_URL", "");
    const server = createAskRigorServer("standard", { researchAccessRequired: false, findingsLibrary: false });
    const client = new Client({ name: "final-check-panel-origin-test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(b); await client.connect(a);
      const { contents } = await client.readResource({ uri: FINAL_CHECK_PANEL_URI });
      expect(contents[0]!._meta).toEqual({ ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } } });
    } finally { await client.close(); await server.close(); }
  });
});

// The owner's first look at the panel in ChatGPT (2026-10-16): its lanes carried instructions meant for the model.
describe("panel lanes without the model's instructions", () => {
  const youtube = "YouTube comments (2 video(s) read): Benefits: Some. No effect: None. Adverse: None. Creators " +
    "versus commenters: Same. Effect on the answer: Small.";
  const forum = "Mineral Forum (1 thread(s) read): Benefits: One. No effect: One. Adverse: None. Effect on the answer: Small.";
  const lines = [
    `${youtube} Report this lane in the answer even if later sources dominate; if its signal is weak, say so. Then ` +
      "copy the sentences that report it into community_findings.answer_quotes.",
    `${forum} Report this lane in the answer, naming Mineral Forum and linking a thread you read, even if its signal ` +
      "is weak. Then copy the sentences that report it into the entry's answer_quotes.",
    "Mineral Forum, form A: 4 report(s) read; 1 firsthand report(s) of exactly this."
  ];
  it("removes only the server's own instruction sentences", () => {
    expect(mustReportFindings(lines, ["Mineral Forum"])).toEqual([youtube, forum, lines[2]]);
    // Another community's instruction is not this line's, so the line stays whole.
    expect(mustReportFindings([lines[1]!], ["Other Forum"])).toEqual([lines[1]]);
  });
});

it("keeps the panel resource and tool metadata out of the Gemini catalog", async () => {
  // No surface option: the catalog profile itself must select the Gemini boundary.
  const server = createAskRigorServer("gemini");
  const client = new Client({ name: "final-check-gemini-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(b); await client.connect(a);
    expect(client.getServerCapabilities()?.resources).toBeUndefined();
    await expect(client.listResources()).rejects.toThrow();
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool._meta?.ui).toBeUndefined();
      expect(tool._meta?.["ui/resourceUri"]).toBeUndefined();
      expect(tool._meta?.["openai/outputTemplate"]).toBeUndefined();
    }
  } finally { await client.close(); await server.close(); }
});

describe("self-contained panel document", () => {
  it("inlines a valid script with no exports or network resource references and a restrictive CSP", () => {
    const html = finalCheckPanelHtml();
    expect(html).toBe(finalCheckPanelHtml());
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<meta name="viewport"');
    expect(html).toContain("Waiting for AskRigor's final check");
    expect(html.match(/<script\b/giu)).toHaveLength(1);
    expect(html.match(/<\/script\s*>/giu)).toHaveLength(1);
    const script = /<script type="module">([\s\S]*?)<\/script>/u.exec(html)![1]!;
    expect(script).toContain(FINAL_CHECK_PANEL_RENDER_SOURCE);
    expect(script).toContain(FINAL_CHECK_PANEL_BOOTSTRAP_SOURCE);
    expect(html).not.toMatch(/\bexport\s*\{/u);
    expect(() => new Script(script)).not.toThrow();
    const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/u.exec(html)![1]!;
    expect(csp).toBe("default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:");
    expect(csp).not.toContain("connect-src");
    // Schema/validation URL strings in the installed bundle are data, not resource loads.
    expect(html).not.toMatch(/\b(?:src|href|action)\s*=\s*["']?\s*(?:https?:|\/\/)/iu);
    expect(html).not.toMatch(/@import\s+(?:url\(\s*)?["']?\s*(?:https?:|\/\/)/iu);
    expect(html).not.toMatch(/\burl\(\s*["']?\s*(?:https?:|\/\/)/iu);
    expect(FINAL_CHECK_PANEL_RENDER_SOURCE + FINAL_CHECK_PANEL_BOOTSTRAP_SOURCE).not.toMatch(/(?:[a-z][a-z\d+.-]*:\/\/|https?:|\/\/)/iu);
  });

  it("binds App from the final export list and fails loudly on an incompatible bundle", () => {
    expect(inlineFinalCheckAppBundle("class InternalApp {}\nexport { Other as x, InternalApp as App };\n"))
      .toBe("class InternalApp {}\n\nconst App = InternalApp;\n");
    expect(() => inlineFinalCheckAppBundle("class App {}" )).toThrow("no final export statement");
    expect(() => inlineFinalCheckAppBundle("export { Other as NotApp };" )).toThrow("no App export");
    expect(() => inlineFinalCheckAppBundle("export { Other as App }; trailingCode();" )).toThrow("no final export statement");
  });
});

// The repository has no DOM library. This shim deliberately rejects HTML assignment.
class Element {
  children: Element[] = [];
  private text = "";
  constructor(readonly tagName: string) {}
  get textContent(): string { return this.text + this.children.map((child) => child.textContent).join(""); }
  set textContent(value: string) { this.text = String(value); this.children = []; }
  set innerHTML(_value: string) { throw new Error("Result text must never be HTML"); }
  appendChild(child: Element): Element { this.children.push(child); return child; }
  replaceChildren(): void { this.children = []; this.text = ""; }
  all(tag: string): Element[] { return this.children.flatMap((child) => [...(child.tagName === tag ? [child] : []), ...child.all(tag)]); }
}
function documentShim() {
  const root = new Element("main");
  return { root, getElementById: (id: string) => id === "final-check-panel" ? root : null, createElement: (tag: string) => new Element(tag) };
}
function render(result: unknown, doc = documentShim()) {
  runInNewContext(`${FINAL_CHECK_PANEL_RENDER_SOURCE}\nrenderFinalCheck(document, result);`, { document: doc, result });
  return doc.root;
}

describe("rendered final check result", () => {
  it.each([
    [{ status: "ready" }, "Checked by AskRigor's final check"],
    [{ status: "ready_with_limits", limits: ["a", "b"] }, "Checked by AskRigor's final check, with 2 limit(s)"],
    [{ status: "not_ready", next_steps: ["a", "b", "c"] }, "Not checked yet: 3 step(s) left"],
    [{ status: "receipts_unavailable" }, "AskRigor's final check could not run here"],
    [{ status: "unknown" }, "AskRigor's final check could not run here"],
    [undefined, "AskRigor's final check could not run here"],
  ])("shows the heading for %j", (result, heading) => {
    expect(render(result).all("h1").map((element) => element.textContent)).toEqual([heading]);
  });

  it("shows the check line, exact caveats and lanes, source identifiers and communities as text", () => {
    const caveat = "<script>alert(1)</script> 日本語، caveat " + "x".repeat(12_000);
    const root = render({
      status: "ready", check_line: "The exact check line.", caveats: [caveat], must_report: ["No benefit was reported."],
      sources: { validated: ["10.1000/one"], lead_only: ["PMID 42"] },
      community: { communities_searched: ["مجتمع", "Community two"] }, findings_card: { status: "checked", problems: [] },
    });
    expect(root.all("h2").map((element) => element.textContent)).toEqual([
      "What the answer must say", "What the answer reports", "Studies checked", "Communities searched", "Findings card",
    ]);
    expect(root.all("li").map((element) => element.textContent)).toEqual([
      caveat, "No benefit was reported.", "10.1000/one", "PMID 42", "مجتمع", "Community two",
    ]);
    expect(root.all("p").map((element) => element.textContent)).toEqual([
      "The exact check line.", "Checked against the answer and its sources."
    ]);
    expect(root.all("script")).toEqual([]);
  });

  it.each([
    [{ status: "checked", saved: { status: "saved", card_id: "ARF-0026" } }, "Checked, and saved for review as ARF-0026."],
    [{ status: "checked", saved: { status: "already_saved", card_id: "ARF-0026" } }, "Checked; it was already saved for review."],
    [{ status: "checked", saved: { status: "not_saved", reason: "queue_service_unavailable" } }, "Checked, but it could not be saved."],
    [{ status: "checked", saved: { status: "unconfirmed" } }, "Checked; its save had not finished."],
    [{ status: "checked" }, "Checked against the answer and its sources."],
    [{ status: "rejected", problems: ["findings[0].answer_quote gives text the answer does not show."] }, "Not accepted, so it was not saved."],
  ])("says what happened to findings card %j in plain words", (card, text) => {
    const root = render({ findings_card: card });
    expect(root.all("h2").map((element) => element.textContent)).toEqual(["Findings card"]);
    expect(root.all("p").map((element) => element.textContent)).toEqual([text]);
  });

  it.each(["absent", "closed", "private"])("leaves out a findings card that is %s", (status) => {
    expect(render({ status: "ready", findings_card: { status, problems: [] } }).children.map((element) => element.textContent))
      .toEqual(["Checked by AskRigor's final check"]);
  });

  it("says under a not-ready heading that the answer came before the check passed", () => {
    expect(render({ status: "not_ready", next_steps: ["a"] }).children.map((element) => element.textContent)).toEqual([
      "Not checked yet: 1 step(s) left", "This answer was given before AskRigor's final check passed."
    ]);
    expect(render({ status: "ready_with_limits", limits: ["a"] }).all("p")).toEqual([]);
  });

  it("shows the panel's own lanes when the result carries them, and the result's otherwise", () => {
    const result = { must_report: ["Lane. Then copy the sentences that report it into the entry's answer_quotes."] };
    const doc = documentShim();
    runInNewContext(`${FINAL_CHECK_PANEL_RENDER_SOURCE}\nrenderFinalCheck(document, result, display);`,
      { document: doc, result, display: { must_report: ["Lane."] } });
    expect(doc.root.all("li").map((element) => element.textContent)).toEqual(["Lane."]);
    expect(render(result).all("li").map((element) => element.textContent)).toEqual(result.must_report);
  });

  it("caps each list independently at 40 whole items and gives the remaining count", () => {
    const entries = Array.from({ length: 43 }, (_, i) => `Item ${i + 1}`);
    const root = render({
      caveats: entries, must_report: entries, sources: { validated: entries, lead_only: entries },
      community: { communities_searched: entries },
    });
    expect(root.all("ul")).toHaveLength(5);
    for (const ul of root.all("ul")) {
      expect(ul.children.map((element) => element.textContent)).toEqual([...entries.slice(0, 40), "and 3 more"]);
    }
  });

  it("replaces prior results and omits fields that are not present", () => {
    const doc = documentShim();
    render({ caveats: ["Earlier caveat"] }, doc);
    render({ status: "ready" }, doc);
    expect(doc.root.children.map((element) => element.textContent)).toEqual(["Checked by AskRigor's final check"]);
  });

  it("waits for the bridge result and renders only its structured content", async () => {
    const doc = documentShim();
    doc.root.textContent = "Waiting for AskRigor's final check";
    let app: TestApp;
    class TestApp {
      ontoolresult?: (result: unknown) => void;
      constructor(info: unknown) { expect(info).toEqual({ name: "AskRigor final check", version: "1" }); app = this; }
      connect() { return Promise.resolve(); }
    }
    await runInNewContext(FINAL_CHECK_PANEL_RENDER_SOURCE + FINAL_CHECK_PANEL_BOOTSTRAP_SOURCE, { document: doc, App: TestApp });
    expect(doc.root.textContent).toBe("Waiting for AskRigor's final check");
    app!.ontoolresult!({ structuredContent: { status: "ready" }, content: [{ type: "text", text: "Ignored prose" }] });
    expect(doc.root.textContent).toBe("Checked by AskRigor's final check");
    app!.ontoolresult!({
      structuredContent: { status: "ready", must_report: ["Lane. Then copy it."] },
      _meta: { [FINAL_CHECK_PANEL_META]: { must_report: ["Lane."] } }
    });
    expect(doc.root.all("li").map((element) => element.textContent)).toEqual(["Lane."]);
  });

  it("shows the specified message when the bridge cannot connect", async () => {
    const doc = documentShim();
    class UnavailableApp { connect() { return Promise.reject(new Error("Unavailable host")); } }
    await runInNewContext(FINAL_CHECK_PANEL_RENDER_SOURCE + FINAL_CHECK_PANEL_BOOTSTRAP_SOURCE, { document: doc, App: UnavailableApp });
    expect(doc.root.textContent).toBe("AskRigor's final check result is not available here");
  });
});
