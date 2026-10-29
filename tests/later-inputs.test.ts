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

describe("later_inputs (owner answer 189a)", () => {
  afterEach(() => vi.restoreAllMocks());
  it("declares channel filtering as a later input and rejects unknown keys with the exact allowed names", async () => {
    for (const operation of RESEARCH_OPERATIONS) {
      const expected = operation.name === "search_youtube" ? ["channel_id"]
        : operation.name === "finalize_research" ? ["open_leads", "another_pass_estimate"] : [];
      expect(laterInputNames(operation.name)).toEqual(expected);
      // An MCP call always carries its request context; an empty one stands in for it here.
      const result = await operation.execute({ later_inputs: { synthetic_future_input: 1 } }, {} as never);
      const message = `Unknown later input "synthetic_future_input" for ${operation.name}. Its later inputs: ${expected.join(", ") || "none"}.`;
      if (operation.name === "finalize_research") {
        // The final check names input problems in its own not_ready result, which ChatGPT shows the model.
        expect(result.isError, operation.name).not.toBe(true);
        expect(result.structuredContent).toMatchObject({ status: "not_ready", answer_checked: false });
        expect((result.structuredContent!.next_steps as string[]).join("\n"))
          .toContain(`later_inputs.synthetic_future_input: ${message}`);
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
    const futureShape = {
      future_probe: z.string().max(8),
      key_sources: z.array(finalizeResearchInputSchema.shape.key_sources.element.extend({ future_nested: z.string().optional() })),
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
      answer_draft: "[Study](https://doi.org/10.1000/later) describes a synthetic mechanism.",
      later_inputs: { safety_question: false, future_probe: "checked", key_sources: [{ id: "10.1000/later",
        status: "validated", read_depth: "full_text_audited", answer_marker: "Study", future_nested: "reached gate" }] },
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
});
