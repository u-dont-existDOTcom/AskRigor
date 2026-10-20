import { Script, runInNewContext } from "node:vm";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FINAL_CHECK_PANEL_URI, FINAL_CHECK_PANEL_RENDER_SOURCE, FINAL_CHECK_PANEL_BOOTSTRAP_SOURCE,
  finalCheckPanelHtml, finalCheckPanelWidgetDomain, inlineFinalCheckAppBundle,
} from "../apps/research-mcp/src/final-check-panel.js";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import {
  COMMUNITY_SKIP_LIMIT, communitySkipCaveat, finalizeResearch, type FinalizeResearchInput,
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";

const MIME = "text/html;profile=mcp-app";
const SECRET = "final-check-panel-test-secret-01234567890123456789";

// Same validated, full-text-audited fixture as finalize-read-depth.test.ts; its one limit is the community search its
// no_real_world_outcome declaration skipped, which the answer states (owner question 125).
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
    absence_claims: [], scale_results: [], user_observations: [], proposed_tests: [], safety_claims: [], key_terms: [], mechanism_claims: [], recommendations: [],
    answer_draft: "[Texte lu] [Étude](https://doi.org/10.1000/depth).\n\n" +
      communitySkipCaveat("Synthetic fixture isolates structural reading-depth checks."),
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
          "openai/widgetCSP": { connect_domains: [], resource_domains: [] },
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
        status: "ready_with_limits", check_line: "Checked with AskRigor's final check, with the limits above.",
        next_steps: [], limits: [COMMUNITY_SKIP_LIMIT], sources: { validated: ["10.1000/depth"], lead_only: [] },
      });
      expect(result.content).toEqual([{ type: "text", text: expect.stringContaining("Research finalization: ready_with_limits; 0 next step(s), 1 limit(s) to state;") }]);
      // The panel draws one line from the structured result; nothing is sent only for it.
      expect(result._meta).toBeUndefined();
    } finally { await client.close(); await server.close(); }
  });
});

// ChatGPT reads the panel's origin from OpenAI's own key; Claude would refuse to draw the panel for any ui.domain other
// than its hashed claudemcpcontent.com form, so that field is never set (2026-10-16 "CSP off" badge, unverified; on
// 2026-10-18 the owner found ChatGPT's "Enforce CSP for custom apps" developer setting switched off).
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
      expect(contents[0]!._meta).toEqual({
        ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } },
        "openai/widgetCSP": { connect_domains: [], resource_domains: [] },
      });
    } finally { await client.close(); await server.close(); }
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

// Owner question 108 (2026-10-16): the panel is one line for the reader, whether the final check passed on this answer.
describe("rendered final check result", () => {
  it.each([
    [{ status: "ready" }, "\u2713 Checked by AskRigor's final check."],
    [{ status: "ready_with_limits", limits: ["a", "b", "c"] }, "\u2713 Checked by AskRigor's final check. The answer states its 3 limits."],
    [{ status: "ready_with_limits", limits: ["a"] }, "\u2713 Checked by AskRigor's final check. The answer states its 1 limit."],
    [{ status: "not_ready", next_steps: ["a", "b", "c"] }, "\u26a0 Not checked: this answer was given before AskRigor's final check passed."],
    [{ status: "receipts_unavailable" }, "AskRigor's final check could not run here."],
    [{ status: "unknown" }, "AskRigor's final check could not run here."],
    [undefined, "AskRigor's final check could not run here."],
  ])("shows one line for %j", (result, line) => {
    const root = render(result);
    expect(root.children.map((element) => [element.tagName, element.textContent])).toEqual([["p", line]]);
  });

  it("shows only the verdict, never the check's lists or text, and never as HTML", () => {
    const root = render({
      status: "ready_with_limits", limits: ["one", "two"], check_line: "The exact check line.",
      caveats: ["<script>alert(1)</script> caveat"], must_report: ["Lane. Then copy it into answer_quotes."],
      next_steps: ["A step for the model."], sources: { validated: ["10.1000/one"], lead_only: ["PMID 42"] },
      community: { communities_searched: ["Community"] }, findings_card: { status: "checked", problems: [] },
    });
    expect(root.textContent).toBe("\u2713 Checked by AskRigor's final check. The answer states its 2 limits.");
    expect(root.all("script")).toEqual([]);
  });

  it("replaces a prior result", () => {
    const doc = documentShim();
    render({ status: "not_ready" }, doc);
    render({ status: "ready" }, doc);
    expect(doc.root.children.map((element) => element.textContent)).toEqual(["\u2713 Checked by AskRigor's final check."]);
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
    expect(doc.root.textContent).toBe("\u2713 Checked by AskRigor's final check.");
  });

  it("shows the specified message when the bridge cannot connect", async () => {
    const doc = documentShim();
    class UnavailableApp { connect() { return Promise.reject(new Error("Unavailable host")); } }
    await runInNewContext(FINAL_CHECK_PANEL_RENDER_SOURCE + FINAL_CHECK_PANEL_BOOTSTRAP_SOURCE, { document: doc, App: UnavailableApp });
    expect(doc.root.textContent).toBe("AskRigor's final check result is not available here");
  });
});
