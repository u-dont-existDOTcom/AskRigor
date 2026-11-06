import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { RESEARCH_OPERATIONS } from "../apps/research-mcp/src/register-tools.js";
import * as versions from "../apps/research-mcp/src/version.js";
import * as laterInputs from "../apps/research-mcp/src/later-inputs.js";
import { laterInputNames, withLaterInputs } from "../apps/research-mcp/src/later-inputs.js";
import { finalizeResearch, finalizeResearchInputSchema, finalizeResearchPublishedInputSchema, normalizeFinalizeResearchInput, parseFinalizeResearchInput } from "../apps/research-mcp/src/research-finalization-gate.js";
import { permissiveConnectorInputSchema } from "../apps/research-mcp/src/connector-input-schema.js";
import { issueResearchReceipt, verifyResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { withAtlasLookupFixture } from "./helpers/atlas-lookup-fixture.js";
import { withCommunitySkip } from "./helpers/community-skip.js";
import { frozenSurfaceServer } from "../scripts/freeze-tool-lists.mts";
import { CARD } from "./helpers/findings-fixtures.js";

const body = (result: { content: unknown }) => JSON.parse((result.content as { text: string }[])[0]!.text);
const text = (result: { content: unknown }) => {
  const content = result.content as { text?: string }[];
  return content.map((item) => {
    try { const value = JSON.parse(item.text ?? ""); return value.error?.message ?? item.text; }
    catch { return item.text; }
  }).join("\n");
};

async function connected<T>(server: McpServer, use: (client: Client) => Promise<T>) {
  const client = new Client({ name: "later-inputs-test", version: "1.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(b);
    await client.connect(a);
    return await use(client);
  } finally { await client.close(); await server.close(); }
}

// The review of 5 Nov 2026: one bad key in later_inputs (a misspelt name, or a published input placed there) dropped
// every later input of a final check, so an honest answer's source_reading went and the answer was held back, and a test
// run's marker went and its card was saved. finalize_research now keeps the usable keys and drops only the bad ones.
describe("finalize_research keeps the usable later inputs beside a bad one", () => {
  const SECRET = "later-inputs-kept-test-secret-0123456789abcdef";
  const DOI = "10.1000/kept-trial";
  const AUDITED = "full text read, methods audited by AskRigor";
  const ABSENT = "No study of the leaves' toxicity in mammals turned up in these searches.";
  const NA = { status: "not_applicable" as const, reason: "Synthetic fixture isolates the later inputs." };
  const READING = { source: DOI, reading: "full_text_audited", quote: AUDITED };
  const call = (later: Record<string, unknown>, overrides: Record<string, unknown> = {}) => withCommunitySkip({
    receipts: [issueResearchReceipt("study_audit", { doi: DOI, content: "a".repeat(16) }, { secret: SECRET })],
    research_target: "Toxicity of a synthetic shrub's leaves", research_depth: "deep", treatment_choice: "not_compared",
    community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome", question_about: "other",
    not_relevant_reason: "Synthetic fixture isolates the later inputs.", commercial_review_applicability: NA,
    intervention_identity: NA, full_text_search: { status: "not_needed", reason: NA.reason }, lab_preparation: NA,
    key_sources: [{ id: DOI, status: "validated", read_depth: "full_text_audited", answer_marker: "Trial" }],
    absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], key_terms: [],
    safety_claims: [], safety_question: false, mechanism_claims: [], recommendations: [],
    answer_draft: `[Trial](https://doi.org/${DOI}) (${AUDITED}) gave rats the leaves' extract.`,
    later_inputs: later, ...overrides
  });
  const check = (later: Record<string, unknown>, overrides: Record<string, unknown> = {}) =>
    finalizeResearch(call(later, overrides), { secret: SECRET });

  it("drops only a misspelt key, naming it, and uses the rest", () => {
    const result = check({ source_reading: [READING], name_form: [{ form: "Samplia", query: "Samplia toxicity" }] });
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps).toEqual([]);
    expect(result.notes).toContain("later_inputs.name_form: dropped. Unknown later input \"name_form\" for " +
      `finalize_research. Its later inputs: ${laterInputNames("finalize_research").join(", ")}.`);
  });

  it("drops only a published input placed in later_inputs, naming where it belongs", () => {
    const result = check({ source_reading: [READING], absence_claims: [{ quote: ABSENT, state: "support_not_located" }] });
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps).toEqual([]);
    expect(result.notes).toContain("later_inputs.absence_claims: dropped. absence_claims is a published top-level input " +
      "of finalize_research; give \"absence_claims\" at the top level.");
  });

  it("takes a key given in both places in its later_inputs form, the newer one, and says so", () => {
    const parsed = parseFinalizeResearchInput(call({ source_reading: [READING], search_coverage: ["other_journals"] },
      { search_coverage: ["historical_terms"] }));
    expect(parsed.success).toBe(true);
    expect(parsed.data!.search_coverage).toEqual(["other_journals"]);
    expect(parsed.data!.source_reading).toEqual([READING]);
    expect(parsed.notes).toContain("later_inputs.search_coverage: search_coverage is given both at the top level and in " +
      "later_inputs: its later_inputs form, the newer one, is used.");
    const result = check({ source_reading: [READING], search_coverage: ["other_journals"] },
      { search_coverage: ["historical_terms"] });
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps).toEqual([]);
  });

  it("merges every later input but the bad ones only for a tool that keeps them; others still refuse the call", () => {
    const top = new Set(["answer_draft", "later_inputs"]);
    const shape = { source_reading: z.unknown(), findings_save: z.unknown() };
    const raw = { answer_draft: "A", later_inputs: { source_reading: [READING], findings_save: "off", typo: 1, answer_draft: "B" } };
    expect(laterInputs.mergeLaterInputs("finalize_research", raw, top, shape, { keepUsable: true })).toEqual({
      input: { answer_draft: "A", source_reading: [READING], findings_save: "off" },
      problems: [
        { path: ["later_inputs", "typo"], kind: "dropped", message: "Unknown later input \"typo\" for finalize_research. " +
          "Its later inputs: source_reading, findings_save." },
        { path: ["later_inputs", "answer_draft"], kind: "dropped", message: "answer_draft is a published top-level input " +
          "of finalize_research; give \"answer_draft\" at the top level." }
      ]
    });
    const refused = laterInputs.mergeLaterInputs("search_pubmed", raw, top, shape);
    expect(refused.input).toEqual({ answer_draft: "A" });
    expect(refused.problems).toHaveLength(2);
  });

  it("reads findings_save from the raw call on its own: off in any case or separator, in later_inputs or at the top", () => {
    for (const raw of [{ later_inputs: { findings_save: "off" } }, { later_inputs: { findings_save: " OFF " } },
      { later_inputs: { findings_save: "o-f_f", typo: [] } }, { findings_save: "Off" }]) {
      expect(laterInputs.findingsSaveMarker(raw), JSON.stringify(raw)).toEqual({ off: true });
    }
    // The recheck of 5 Nov 2026 and its third check: only an explicit off is off ("off", false, a list of those), with a
    // note for a form other than "off", and later_inputs sent as a JSON string is read for it.
    const other = "findings_save: read as \"off\"; give \"off\", its value.";
    const text = "findings_save: read as \"off\" from later_inputs given as text; give later_inputs as an object, with " +
      "findings_save \"off\".";
    for (const raw of [{ later_inputs: { findings_save: ["off"] } }, { later_inputs: { findings_save: false } },
      { findings_save: ["OFF", false] }]) {
      expect(laterInputs.findingsSaveMarker(raw), JSON.stringify(raw)).toEqual({ off: true, note: other });
    }
    for (const raw of [{ later_inputs: JSON.stringify({ findings_save: "off" }) },
      { later_inputs: JSON.stringify({ findings_save: ["off"], source_reading: [] }) }]) {
      expect(laterInputs.findingsSaveMarker(raw), JSON.stringify(raw)).toEqual({ off: true, note: text });
    }
    // Any other value is no marker: the owner's own research must never lose a card because a model meant true as
    // "save", as set_findings_save's true does, so the account's setting decides, and a note says so.
    const notOff = "findings_save: not read as off. It only turns card saving off, with \"off\"; any other value leaves " +
      "the account's setting to decide.";
    for (const raw of [{ later_inputs: { findings_save: true } }, { later_inputs: { findings_save: "on" } },
      { findings_save: {} }, { later_inputs: { findings_save: ["off", "on"] } }, { later_inputs: { findings_save: [] } },
      { later_inputs: JSON.stringify({ findings_save: "yes" }) }]) {
      expect(laterInputs.findingsSaveMarker(raw), JSON.stringify(raw)).toEqual({ off: false, note: notOff });
    }
    // Absent: not given, or given as null; a call that is no object; and text that isn't JSON, whatever it says, whose
    // envelope is dropped with its note, as any other (the third check: no free-text reading).
    for (const raw of [{ later_inputs: { findings_save: null } }, { findings_save: null }, { later_inputs: "{}" },
      { later_inputs: { source_reading: [{ quote: "findings_save off" }] } }, { later_inputs: "findings_save off" },
      { later_inputs: "{\"source_reading\":[{\"quote\":\"the findings_save marker" },
      { later_inputs: ["note: findings_save is not set"] }, { later_inputs: [{ findings_save: "off" }] },
      { answer_draft: "We left findings_save alone.", later_inputs: {} }, null, "off", {}]) {
      expect(laterInputs.findingsSaveMarker(raw), JSON.stringify(raw)).toEqual({ off: false });
      expect(laterInputs.findingsSaveOff(raw)).toBe(false);
    }
  });

  // The recheck of 5 Nov 2026: an unusable later form no longer replaces a valid top-level one.
  it("keeps a valid top-level form when its later_inputs form doesn't parse, and says so", () => {
    const parsed = parseFinalizeResearchInput(call({ source_reading: [{ source: DOI, quote: AUDITED }] },
      { source_reading: [READING] }));
    expect(parsed.success).toBe(true);
    expect(parsed.data!.source_reading).toEqual([READING]);
    expect(parsed.notes).toContain("later_inputs.source_reading: source_reading is given both at the top level and in " +
      "later_inputs, and its later_inputs form doesn't parse: its top-level form is used.");
    const result = check({ source_reading: [{ source: DOI, quote: AUDITED }] }, { source_reading: [READING] });
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps).toEqual([]);
    // With both unusable, the later form is read, as the salvage reads it.
    expect(parseFinalizeResearchInput(call({ source_reading: [{ source: DOI }] }, { source_reading: [{ quote: AUDITED }] }))
      .notes.join("\n")).toContain("its later_inputs form, the newer one, is used");
  });

  // The third check of 5 Nov 2026: the fallback saved an out-of-date card. Only inputs the check only reads may fall back.
  it("falls back only for inputs whose older form is harmless, never for a findings card", () => {
    expect([...laterInputs.TOP_LEVEL_FALLBACK_INPUTS].sort()).toEqual(["key_name", "name_forms", "search_coverage",
      "source_reading"]);
    const corrected = { ...CARD, findings: [{ ...CARD.findings[0], claim: "A corrected claim the AI meant to save instead.",
      backing: [{ source: "10.1000/kept-trial", sentence: "x".repeat(400), against: "Too long a sentence." }] }] };
    const parsed = parseFinalizeResearchInput(call({ source_reading: [READING], findings_card: corrected },
      { findings_card: CARD }));
    expect(parsed.notes).toContain("later_inputs.findings_card: findings_card is given both at the top level and in " +
      "later_inputs: its later_inputs form, the newer one, is used.");
    expect(parsed.notes.join("\n")).not.toContain("its top-level form is used");
    // The unusable later card is dropped, never replaced by the older one, so it can't be saved as checked.
    expect(parsed.data?.findings_card).toBeUndefined();
    expect(parsed.droppedFindingsCard).toBe(true);
  });
});

describe("later_inputs (owner answer 189a)", () => {
  afterEach(() => vi.restoreAllMocks());
  it("declares channel filtering as a later input and rejects unknown keys with the exact allowed names", async () => {
    for (const operation of RESEARCH_OPERATIONS) {
      const expected = operation.name === "search_youtube" ? ["channel_id"]
        // Owner answer 219b: the findings card's newer form, with each finding's YouTube-comments declaration.
        // Owner answer 237a: the source lines. Owner answer 249a: the study map. 5 Nov 2026: user_observations' newer form,
        // the leads people's reports raised, with the study search that followed each, and how each key source was read;
        // from the free Claude test of 5 Nov 2026, the name forms searched before a not-found claim, search_coverage's
        // newer form with other_journals, and the marker that turns a test run's card saving off; from its review, the
        // key name as the answer writes it, which a name form must differ from.
        : operation.name === "finalize_research" ? ["community_evidence", "treatment_choice", "open_leads", "another_pass_estimate", "findings_card", "source_lines", "study_map", "user_observations", "community_leads", "source_reading", "name_forms", "key_name", "search_coverage", "findings_save"]
          : operation.name === "save_research_findings" ? ["findings_card"]
          // The recheck of 5 Nov 2026: a test run's audits are marked, so nothing of them is held for the review inbox.
          : operation.name === "validate_study_method_audit" ? ["audit", "findings_save"]
          : operation.name === "validate_review_method_audit" ? ["findings_save"]
            // Owner answer 200a: the shared answer's copy, its deletion code, and the owner's review of it.
            : operation.name === "manage_research_access" ? ["sharedAnswer", "shareCode", "atlasReport", "reportNumber"]
              : operation.name === "review_research_contribution" ? ["sharedAnswerId", "items", "placements", "reportState", "report", "verdict", "glanceRow", "glanceRowId", "glanceState"] : [];
      expect(laterInputNames(operation.name)).toEqual(expected);
      // An MCP call always carries its request context; an empty one stands in for it here.
      const result = await operation.execute({ later_inputs: { synthetic_future_input: 1 } }, {} as never);
      const message = `Unknown later input "synthetic_future_input" for ${operation.name}. Its later inputs: ${expected.join(", ") || "none"}.`;
      if (operation.name === "finalize_research") {
        // The final check names input problems in its own not_ready result, which ChatGPT shows the model.
        expect(result.isError, operation.name).not.toBe(true);
        expect(result.structuredContent).toMatchObject({ status: "not_ready", answer_checked: false });
        expect((result.structuredContent!.notes as string[]).join("\n"))
          .toContain(`later_inputs.synthetic_future_input: dropped. ${message}`);
        continue;
      }
      expect(result.isError, operation.name).toBe(true);
      expect(text(result)).toContain(message);
    }
  });

  it.each(["mcp", "claude", "gemini"] as const)("declares the envelope before SDK parsing on %s", async (surface) => {
    await connected(frozenSurfaceServer(surface), async (client) => {
      const call = (later_inputs?: object) => client.callTool({ name: "get_protocol_manifest", arguments: {
        protocol: "hrp", ...(later_inputs === undefined ? {} : { later_inputs }),
      } });
      expect((await call()).isError).not.toBe(true);
      expect((await call({})).isError).not.toBe(true);
      const unknown = await call({ synthetic_future_input: 1 });
      expect(unknown.isError).toBe(true);
      expect(text(unknown)).toContain('Its later inputs: none.');
      const top = await call({ protocol: "universal" });
      expect(top.isError).toBe(true);
      expect(text(top)).toContain('later_inputs.protocol: protocol is a published top-level input of get_protocol_manifest; give "protocol" at the top level.');
    });
  });

  it("validates a future field in one schema and merges it before a raw-shape handler", async () => {
    const execute = vi.fn(async (input) => ({ content: [{ type: "text" as const, text: JSON.stringify(input) }] }));
    const evolving = withLaterInputs("synthetic_tool", { present: z.string() }, execute, { added: z.number().int() });
    const server = new McpServer({ name: "synthetic", version: "1.0.0" });
    server.registerTool("synthetic_tool", { inputSchema: evolving.inputSchema }, evolving.execute);
    await connected(server, async (client) => {
      const call = (later_inputs: unknown) => client.callTool({ name: "synthetic_tool", arguments: { present: "kept", later_inputs } });
      expect((await call({ added: 3 })).isError).not.toBe(true);
      expect(execute.mock.calls[0]?.[0]).toEqual({ present: "kept", added: 3 });
      expect((await client.callTool({ name: "synthetic_tool", arguments: { present: "kept", added: 4 } })).isError).not.toBe(true);
      expect(execute.mock.calls[1]?.[0]).toEqual({ present: "kept", added: 4 });
      execute.mockClear();
      expect((await call({ added: "wrong" })).isError).toBe(true);
      const unknown = await call({ other: 2 });
      expect(text(unknown)).toContain('Its later inputs: added.');
      expect(execute).not.toHaveBeenCalled();
    });
    for (const later_inputs of [null, [], "wrong", 3]) {
      expect((await evolving.execute({ present: "kept", later_inputs })).isError).toBe(true);
    }
  });

  it("accepts a redeclared raw-shape enum at the top level and in the envelope, but never both", async () => {
    const execute = vi.fn(async (input) => ({ content: [{ type: "text" as const, text: JSON.stringify(input) }] }));
    const evolving = withLaterInputs("synthetic_tool", { action: z.enum(["old"]) }, execute,
      { action: z.enum(["old", "new"]) });
    expect(z.toJSONSchema(evolving.inputSchema).properties?.action).toMatchObject({ enum: ["old"] });
    const server = new McpServer({ name: "synthetic", version: "1" });
    server.registerTool("synthetic_tool", { inputSchema: evolving.inputSchema }, evolving.execute);
    await connected(server, async (client) => {
      const call = (args: Record<string, unknown>) => client.callTool({ name: "synthetic_tool", arguments: args });
      expect((await call({ action: "new" })).isError).not.toBe(true);
      expect((await call({ later_inputs: { action: "new" } })).isError).not.toBe(true);
      expect(execute.mock.calls.map(([input]) => input)).toEqual([{ action: "new" }, { action: "new" }]);
      for (const action of ["new", "old"]) {
        const duplicate = await call({ action, later_inputs: { action: "new" } });
        expect(body(duplicate)).toMatchObject({ error: { code: "invalid_input" } });
        expect(text(duplicate)).toContain("later_inputs.action: action is also given at the top level");
      }
      const unknown = await call({ action: "unknown" });
      expect(unknown.isError).toBe(true);
      expect(text(unknown)).toContain("action: Invalid option: expected one of");
      expect(text(unknown)).toContain("old");
      expect(text(unknown)).toContain("new");
      expect(execute).toHaveBeenCalledTimes(2);
    });
  });

  it("accepts a relaxed limit only at runtime and reports all failures by their input paths", async () => {
    const execute = vi.fn(async () => ({ content: [] }));
    const evolving = withLaterInputs("synthetic_tool", { label: z.string().max(2), count: z.number() }, execute,
      { label: z.string().max(8) });
    expect(z.toJSONSchema(evolving.inputSchema).properties?.label).toMatchObject({ maxLength: 2 });
    for (const input of [{ label: "longer", count: 1 }, { later_inputs: { label: "longer" }, count: 1 }]) {
      expect((await evolving.execute(input)).isError).not.toBe(true);
    }
    const invalid = await evolving.execute({ later_inputs: { label: "too long for runtime" }, count: "wrong" });
    expect(body(invalid)).toMatchObject({ error: { code: "invalid_input" }, problems: [
      expect.stringContaining("later_inputs.label:"), expect.stringContaining("count:"),
    ] });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it.each(["mcp", "claude"] as const)("refuses unknown open actions and categories on %s with every valid value", async (surface) => {
    await connected(frozenSurfaceServer(surface), async (client) => {
      const tools = (await client.listTools()).tools;
      for (const [name, field] of [["manage_research_access", "action"], ["review_research_contribution", "action"],
        ["submit_lesson_candidate", "category"]] as const) {
        const published = tools.find((tool) => tool.name === name)!.inputSchema;
        expect(published.required).toContain(field);
        expect(published.properties![field]).toMatchObject({ type: "string",
          description: expect.stringContaining("or another value an AskRigor result names") });
        expect(published.properties![field]).not.toHaveProperty("enum");
        const values = (RESEARCH_OPERATIONS.find((tool) => tool.name === name)!.runtimeInputSchema.shape[field] as z.ZodEnum).options;
        const response = await client.callTool({ name, arguments: { [field]: "unknown" } });
        expect(response.isError).toBe(true);
        expect(body(response)).toMatchObject({ error: { code: "invalid_input" } });
        expect(text(response)).toContain(`${field}: Invalid option:`);
        for (const value of values) {
          expect(text(response)).toContain(value);
        }
      }
    });
  });

  it.each([
    ["manage_research_access", "action"], ["review_research_contribution", "action"], ["submit_lesson_candidate", "category"],
  ])("keeps %s's list fixed when only its runtime %s enum grows", async (tool, field) => {
    const execute = vi.fn(async () => ({ content: [] }));
    const old = withLaterInputs(tool, { [field]: z.enum(["old"]) }, execute);
    const next = withLaterInputs(tool, { [field]: z.enum(["old", "new"]) }, execute);
    expect(z.toJSONSchema(next.inputSchema)).toEqual(z.toJSONSchema(old.inputSchema));
    expect((await next.execute({ [field]: "new" })).isError).not.toBe(true);
    expect(execute).toHaveBeenCalledWith({ [field]: "new" }, undefined);
  });

  it("returns a protocol error when computing running versions fails", async () => {
    vi.spyOn(versions, "versionPayload").mockRejectedValueOnce(new Error("synthetic version failure"));
    await connected(frozenSurfaceServer("mcp"), async (client) => {
      const response = await client.callTool({ name: "get_protocol_manifest", arguments: { protocol: "hrp" } });
      expect(response.isError).toBe(true);
      expect(response.structuredContent).toMatchObject({ ok: false, protocol: "hrp", error: { code: "protocol_error" } });
      expect(response.structuredContent).not.toHaveProperty("running_versions");
    });
  });

  it("merges a later final-check declaration before validation, carried state and receipt creation", async () => {
    // Emulate an older kept list that predates safety_question. The actual parser already knows the field;
    // production's later-input schemas remain empty, and its published safety_question stays top-level.
    // A genuinely new field is declared only in the shared registry; the strict parser picks it up too.
    // Today's source_reading stays in it, since a cited key source needs its reading (the owner, 5 Nov 2026).
    const futureShape = {
      future_probe: z.string().max(8),
      key_sources: z.array(finalizeResearchInputSchema.shape.key_sources.element.extend({ future_nested: z.string().optional() })),
      source_reading: laterInputs.laterInputShape("finalize_research").source_reading,
    };
    vi.spyOn(laterInputs, "laterInputShape").mockImplementation(() => futureShape);
    const published = finalizeResearchPublishedInputSchema({ relaxed: false });
    const properties = { ...published.properties };
    delete properties.safety_question;
    const older = permissiveConnectorInputSchema({ ...published, properties });
    const secret = "synthetic-later-inputs-finalization-secret-0123456789";
    const source = issueResearchReceipt("study_audit", { id: "10.1000/later", status: "complete_no_unresolved_fields" }, { secret });
    const declaration = { status: "not_applicable" as const, reason: "Synthetic mechanism fixture." };
    const raw = withAtlasLookupFixture(withCommunitySkip({
      receipts: [source], research_target: "Synthetic mechanism", research_depth: "deep", treatment_choice: "not_compared",
      community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome", not_relevant_reason: "Synthetic mechanism fixture.",
      commercial_review_applicability: declaration, intervention_identity: declaration, lab_preparation: declaration,
      full_text_search: { status: "not_needed", reason: "Synthetic mechanism fixture." },
      absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], safety_claims: [],
      key_terms: [], mechanism_claims: [], recommendations: [],
      answer_draft: "[Study](https://doi.org/10.1000/later) (full text read, methods audited by AskRigor) describes a " +
        "synthetic mechanism.",
      later_inputs: { safety_question: false, future_probe: "checked", key_sources: [{ id: "10.1000/later",
        status: "validated", read_depth: "full_text_audited", answer_marker: "Study", future_nested: "reached gate" }],
        source_reading: [{ source: "10.1000/later", reading: "full_text_audited",
          quote: "full text read, methods audited by AskRigor" }] },
    }), { secret });
    let received: Record<string, unknown> | undefined;
    const evolving = withLaterInputs("finalize_research", older, async (input) => {
      received = input;
      const parsed = parseFinalizeResearchInput(input);
      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data).toHaveProperty("future_probe", "checked");
      expect(parsed.success && parsed.data).toHaveProperty("key_sources.0.future_nested", "reached gate");
      const result = finalizeResearch(input, { secret });
      return { content: [{ type: "text", text: result.status }], structuredContent: result };
    }, { safety_question: finalizeResearchInputSchema.shape.safety_question, ...futureShape },
    { schema: finalizeResearchInputSchema, normalize: normalizeFinalizeResearchInput });
    const server = new McpServer({ name: "synthetic-finalization", version: "1" });
    server.registerTool("finalize_research", { inputSchema: evolving.inputSchema }, evolving.execute);
    const actual = await connected(server, (client) => client.callTool({ name: "finalize_research", arguments: raw }));
    const { later_inputs: _later, ...top } = raw;
    const expected = finalizeResearch({ ...top, ...raw.later_inputs }, { secret });
    expect(expected.status, expected.next_steps.join("\n")).toBe("ready_with_limits");
    expect(received).toMatchObject({ safety_question: false, receipts: raw.receipts });
    expect(received).not.toHaveProperty("later_inputs");
    expect(actual.structuredContent).toMatchObject({ status: expected.status, carry_forward: expect.any(String) });
    expect((actual.structuredContent as { next_steps: string[] }).next_steps).toEqual(expected.next_steps);
    expect((actual.structuredContent as { receipts_verified: number }).receipts_verified).toBe(expected.receipts_verified);
    const receipt = (actual.structuredContent as { finalization_receipt?: string }).finalization_receipt;
    expect(receipt).toBeDefined();
    expect(verifyResearchReceipt(receipt!, { secret }).ok).toBe(true);
    const invalid = await evolving.execute({ ...raw, later_inputs: { safety_question: "wrong" } });
    expect(invalid.isError).toBe(true);
    expect(text(invalid)).toContain("later_inputs.safety_question");
    expect(parseFinalizeResearchInput({ ...top, safety_question: false, future_probe: "too long for the registered schema" }).success).toBe(false);
  });

  // Owner answer 219b: the findings card's newer form, whose findings each declare whether they draw on YouTube
  // comments, reaches both tools that read a card, at the top level or in later_inputs, while their published inputs
  // stay as they were.
  it("accepts the findings card's later shape on finalize_research and save_research_findings", async () => {
    const card = { ...CARD, findings: [{ ...CARD.findings[0], draws_on_youtube_comments: true }] };
    expect(finalizeResearchInputSchema.shape.findings_card.safeParse(card).success).toBe(false);
    for (const raw of [{ findings_card: card }, { later_inputs: { findings_card: card } }]) {
      const parsed = parseFinalizeResearchInput({ research_target: "Synthetic target", answer_draft: "Draft.", receipts: [], ...raw });
      expect(parsed.droppedFindingsCard).toBe(false);
      expect(parsed.data?.findings_card?.findings[0]?.draws_on_youtube_comments).toBe(true);
    }
    const save = RESEARCH_OPERATIONS.find(({ name }) => name === "save_research_findings")!;
    const base = { finalization_receipt: "rr1~finalization~status=ready~1790000000~AAAAAAAAAAAAAAAAAAAAAA", user_consent: "yes_to_this_save" };
    for (const input of [{ ...base, findings_card: card }, { ...base, later_inputs: { findings_card: card } }]) {
      const result = await save.execute(input, {} as never);
      // The input is accepted; this test server has no findings library open.
      expect(text(result)).toBe("Not saved: AskRigor's findings library is not open yet.");
    }
    const twice = await save.execute({ ...base, findings_card: card, later_inputs: { findings_card: card } }, {} as never);
    expect(twice.isError).toBe(true);
    expect(text(twice)).toContain("later_inputs.findings_card: findings_card is also given at the top level");
    const wrong = { ...card, findings: [{ ...CARD.findings[0], draws_on_youtube_comments: "yes" }] };
    expect(text(await save.execute({ ...base, later_inputs: { findings_card: wrong } }, {} as never)))
      .toContain("later_inputs.findings_card.findings[0].draws_on_youtube_comments");
  });
});
