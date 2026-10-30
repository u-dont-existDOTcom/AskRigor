import { Script, runInNewContext } from "node:vm";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyCarriedState } from "../apps/research-mcp/src/carried-state.js";
import { COMPLETE_CHECKS_TIP } from "../apps/research-mcp/src/final-check-messages.js";
import {
  FINAL_CHECK_PANEL_URI, FINAL_CHECK_PANEL_RENDER_SOURCE, FINAL_CHECK_PANEL_BOOTSTRAP_SOURCE,
  finalCheckPanelHtml, finalCheckPanelWidgetDomain, inlineFinalCheckAppBundle,
} from "../apps/research-mcp/src/final-check-panel.js";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import {
  COMMUNITY_SKIP_LIMIT, communitySkipCaveat, finalizeResearch, type FinalizeResearchInput, type FinalizeResearchOutput,
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";

const MIME = "text/html;profile=mcp-app";
const SECRET = "final-check-panel-test-secret-01234567890123456789";

// Same validated, full-text-audited fixture as finalize-read-depth.test.ts; its one limit is the community search its
// no_real_world_outcome declaration skipped, which the answer states (owner question 125).
function fixture(overrides: Partial<FinalizeResearchInput> = {}): FinalizeResearchInput {
  return {
    receipts: [issueResearchReceipt("study_audit", { doi: "10.1000/depth", content: "a".repeat(16) }, { secret: SECRET })],
    research_target: "Synthetic reading-depth declaration", research_depth: "deep", treatment_choice: "not_compared",
    community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome", question_about: "other",
    not_relevant_reason: "Synthetic fixture isolates structural reading-depth checks.",
    commercial_review_applicability: { status: "not_applicable", reason: "Synthetic fixture concerns no commercial product." },
    intervention_identity: { status: "not_applicable", reason: "Synthetic fixture contains no study intervention." },
    full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates reading-depth checks." },
    lab_preparation: { status: "not_applicable", reason: "Synthetic fixture interprets no lab result and plans no test." },
    key_sources: [{ id: "10.1000/depth", status: "validated", read_depth: "full_text_audited", answer_marker: "[Texte lu]" }],
    absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], safety_claims: [], safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [],
    answer_draft: "[Texte lu] [Étude](https://doi.org/10.1000/depth).\n\n" +
      communitySkipCaveat("Synthetic fixture isolates structural reading-depth checks."),
    ...overrides,
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
      // Leading/trailing whitespace and CRLF survive both the connector input and output schemas.
      input.answer_draft = ` \t\r\n${input.answer_draft}\r\n\t `;
      const result = await client.callTool({ name: "finalize_research", arguments: { ...input } });
      expect(result.isError).not.toBe(true);
      const output = result.structuredContent as FinalizeResearchOutput;
      const direct = finalizeResearch(input, { secret: SECRET, findings: "closed" });
      // Separate calls start separate random turns; the signed state must still match the exact readable result.
      expect(output).toEqual({
        ...direct, carry_forward: expect.any(String), round_token: expect.any(String),
        carried: { ...direct.carried, turn: expect.stringMatching(/^[0-9a-f]{16}$/u) }
      });
      expect(verifyCarriedState(output.carry_forward!, { secret: SECRET })).toEqual({ ok: true, state: output.carried });
      expect(result.structuredContent).toMatchObject({
        status: "ready_with_limits", check_line: "Checked with AskRigor's final check, with the limits it found.",
        checked_answer: input.answer_draft,
        next_steps: [], limits: [communitySkipCaveat(input.not_relevant_reason!)], sources: { validated: ["10.1000/depth"], lead_only: [] },
      });
      expect(result.content).toEqual([{ type: "text", text: expect.stringContaining("Research finalization: ready_with_limits; 0 next step(s), 1 limit(s) to state;") }]);
      // The panel draws from the structured result; nothing is sent only for it.
      expect(result._meta).toBeUndefined();
    } finally { await client.close(); await server.close(); }
  });
});

describe("the exact checked answer (owner answer 187)", () => {
  it.each(["ready", "ready_with_limits"] as const)("returns the submitted bytes only after %s", (status) => {
    const input = fixture(status === "ready" ? { not_relevant_basis: "emergency_before_triage" } : {});
    input.answer_draft = ` \t\r\n${input.answer_draft}\n\nRésumé e\u0301 中文 العربية.\r\n\t `;
    const result = finalizeResearch(input, { secret: SECRET });
    expect(result.status).toBe(status);
    expect(result.caveats).not.toContain(COMPLETE_CHECKS_TIP);
    expect(result.checked_answer).toBe(input.answer_draft);
    expect(Buffer.from(result.checked_answer!)).toEqual(Buffer.from(input.answer_draft));
    expect(result.carried).not.toHaveProperty("checked_answer");
    // A separate caller gets only its own draft, never the previous caller's.
    const other = fixture(status === "ready" ? { not_relevant_basis: "emergency_before_triage" } : {});
    expect(finalizeResearch(other, { secret: SECRET }).checked_answer).toBe(other.answer_draft);
  });

  it("omits checked_answer without a draft and whenever the check did not pass", () => {
    const missing = finalizeResearch(fixture({ answer_draft: undefined }), { secret: SECRET });
    const unavailable = finalizeResearch(fixture(), {});
    const invalid = finalizeResearch({ answer_draft: "private draft" }, { secret: SECRET });
    const blank = finalizeResearch(fixture({ answer_draft: " \t\r\n " }), { secret: SECRET });
    expect(blank).toMatchObject({ status: "not_ready", answer_checked: false });
    let open = finalizeResearch(fixture({ receipts: [] }), { secret: SECRET });
    expect(open.status).toBe("not_ready");
    for (const result of [missing, unavailable, invalid, blank, open]) expect(result).not.toHaveProperty("checked_answer");
    for (let round = 2; round <= 3; round += 1) {
      open = finalizeResearch(fixture({ receipts: [], round_token: open.round_token }), { secret: SECRET });
    }
    expect(open.status).toBe("stopped");
    expect(open).not.toHaveProperty("checked_answer");
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
    expect(html).toContain("p { margin: 0; white-space: pre-wrap; }");
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

// The verdict line remains as owner question 108 specified; owner answer 187 adds the checked answer or stopped steps.
describe("rendered final check result", () => {
  it("shows every limit beneath a passing checked answer even when the draft omitted them (owner 195)", () => {
    const input = fixture({ answer_draft: "[Study](https://doi.org/10.1000/depth) gives a provisional result." });
    const result = finalizeResearch(input, { secret: SECRET });
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps).toEqual([]);
    const limits = [...result.limits, "<b>A second limit is plain text.</b>"];
    const root = render({ ...result, limits });
    expect(root.children.slice(-4).map(({ tagName, textContent }) => [tagName, textContent])).toEqual([
      ["h2", "The answer as AskRigor checked it:"], ["p", input.answer_draft],
      ["h2", "Limits of this answer:"], ["ul", limits.join("")]
    ]);
    expect(root.all("li").slice(-limits.length).map(({ textContent }) => textContent)).toEqual(limits);
    expect(root.all("b")).toEqual([]);
    expect(render({ status: "not_ready", limits, checked_answer: input.answer_draft }).textContent)
      .not.toContain("Limits of this answer:");
  });

  it("shows all input notes as text without turning them into steps or caveats", () => {
    const notes = ["A source type was dropped.", "<script>A field was unknown.</script>"];
    const root = render({ status: "ready", notes });
    expect(root.children.map(({ tagName, textContent }) => [tagName, textContent])).toEqual([
      ["p", "\u2713 Checked by AskRigor's final check."],
      ["h2", "Notes about the call:"], ["ul", notes.join("")]
    ]);
    expect(root.all("script")).toEqual([]);
  });

  it.each([
    [{ status: "ready" }, "\u2713 Checked by AskRigor's final check."],
    [{ status: "ready_with_limits", limits: ["a", "b", "c"] }, "\u2713 Checked by AskRigor's final check, with 3 limits below."],
    [{ status: "ready_with_limits", limits: ["a"] }, "\u2713 Checked by AskRigor's final check, with 1 limit below."],
    [{ status: "not_ready", next_steps: ["a", "b", "c"] }, "AskRigor's final check asked for more work on this draft."],
    [{ status: "receipts_unavailable" }, "AskRigor's final check could not run here."],
    [{ status: "unknown" }, "AskRigor's final check could not run here."],
    [undefined, "AskRigor's final check could not run here."],
  ])("shows one line for %j", (result, line) => {
    const root = render(result);
    expect(root.children.map((element) => [element.tagName, element.textContent])).toEqual([
      ["p", line],
      ...(result?.status === "ready_with_limits" ? [["h2", "Limits of this answer:"], ["ul", result.limits.join("")]] : [])
    ]);
  });

  it.each(["ready", "ready_with_limits"])("shows the exact checked answer as text for %s", (status) => {
    const answer = ' \n<script>alert(1)</script>\n<img src=x onerror="alert(2)">\n**not rendered**\r\n ';
    const root = render({ status, checked_answer: answer });
    expect(root.children.map(({ tagName, textContent }) => [tagName, textContent])).toEqual([
      ["p", status === "ready" ? "\u2713 Checked by AskRigor's final check." :
        "\u2713 Checked by AskRigor's final check, with 0 limits below."],
      ["h2", "The answer as AskRigor checked it:"],
      ["p", answer],
    ]);
    expect(root.all("script")).toEqual([]);
    expect(root.all("img")).toEqual([]);
  });

  it.each([
    [undefined, undefined], [[], []],
    [[{ kind: "research", step: "Read the study's full text." }], []],
    [[], [{ kind: "research", step: "Retry the search after its limit resets." }]],
    [[{ kind: "declaration", step: "State what the reports showed." }, { kind: "answer_draft", step: "Show the missing caveat." }],
      [{ kind: "research", step: "Read the next study." }]],
  ])("shows stopped steps when present (%j, %j), ending with the exact tip", (couldNot, nextTurn) => {
    const root = render({ status: "stopped", checked_answer: "must not show", stopped: {
      short_reason: "research this answer needs is unfinished", could_not: couldNot, next_turn: nextTurn,
    } });
    expect(root.children[0]!.textContent).toBe("Not checked: research this answer needs is unfinished.");
    expect(root.all("h2").map(({ textContent }) => textContent)).toEqual([
      ...((couldNot?.length ?? 0) > 0 ? ["Checks AskRigor could not finish this turn:"] : []),
      ...((nextTurn?.length ?? 0) > 0 ? ["What the next turn can do:"] : []),
    ]);
    expect(root.all("li").map(({ textContent }) => textContent)).toEqual([
      ...(couldNot ?? []).map(({ step }) => step), ...(nextTurn ?? []).map(({ step }) => step),
    ]);
    expect(root.children.at(-1)!.textContent).toBe(COMPLETE_CHECKS_TIP);
    expect(root.textContent).not.toContain("must not show");
  });

  it("keeps stopped steps as text and handles a missing stopped payload", () => {
    const step = '<img src=x onerror="alert(1)">';
    const root = render({ status: "stopped", stopped: { could_not: [{ kind: "research", step }] } });
    expect(root.all("li")[0]!.textContent).toBe(step);
    expect(root.all("img")).toEqual([]);
    expect(render({ status: "stopped" }).children.map(({ textContent }) => textContent)).toEqual([
      "Not checked by AskRigor's final check.", COMPLETE_CHECKS_TIP,
    ]);
  });

  it("shows nothing new for not_ready even if extra answer or stopped fields are present", () => {
    const root = render({ status: "not_ready", checked_answer: "must not show", stopped: {
      could_not: [{ step: "hidden step" }], next_turn: [{ step: "hidden next turn" }],
    } });
    expect(root.children.map(({ textContent }) => textContent)).toEqual([
      "AskRigor's final check asked for more work on this draft.",
    ]);
  });

  it("shows limits with the verdict and keeps model instructions out of the panel", () => {
    const root = render({
      status: "ready_with_limits", limits: ["one", "two"], check_line: "The exact check line.",
      caveats: ["<script>alert(1)</script> caveat"], must_report: ["Lane. Then copy it into answer_quotes."],
      next_steps: ["A step for the model."], sources: { validated: ["10.1000/one"], lead_only: ["PMID 42"] },
      community: { communities_searched: ["Community"] }, findings_card: { status: "checked", problems: [] },
    });
    expect(root.textContent).toBe("\u2713 Checked by AskRigor's final check, with 2 limits below.Limits of this answer:onetwo");
    expect(root.all("script")).toEqual([]);
  });

  it("replaces a prior result", () => {
    const doc = documentShim();
    render({ status: "ready", checked_answer: "an earlier draft" }, doc);
    render({ status: "stopped", stopped: { could_not: [{ step: "an earlier step" }] } }, doc);
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
