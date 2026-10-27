import { readFile } from "node:fs/promises";
import { RESEARCH_USE_NOTICE_VERSION } from "@askrigor/evidence-repository";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import Ajv from "ajv";

import {
  FROZEN_TOOL_LIST_SURFACES, TOOL_LIST_FROZEN_MESSAGE, frozenSurfaceServer, frozenToolListPath, servedToolList,
} from "../scripts/freeze-tool-lists.mts";
import { toolListVersionOf } from "../apps/research-mcp/src/tool-list-currency.js";
import { digestCanonicalJson } from "../apps/research-mcp/src/lessons/incident-contracts.js";
import { LATER_INPUTS_DESCRIPTION } from "../apps/research-mcp/src/later-inputs.js";
import { openToolOutputSchema } from "../apps/research-mcp/src/connector-input-schema.js";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import { FINALIZE_RESEARCH_CONTRACT } from "../apps/research-mcp/src/research-finalization-gate.js";
import { RESEARCH_OPERATIONS } from "../apps/research-mcp/src/register-tools.js";

function closedPaths(value: unknown, path = ""): string[] {
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => key === "additionalProperties" && child === false
    ? [`${path}.${key}`] : closedPaths(child, `${path}.${key}`));
}

function closedValuePaths(value: unknown, path = ""): string[] {
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => key === "enum" || key === "const"
    ? [`${path}.${key}`] : closedValuePaths(child, `${path}.${key}`));
}

const RUNNING = { hrp: "synthetic-hrp", universal: "synthetic-universal", build: "synthetic-build" };

describe("fixed tool definitions (owner answer 189a)", () => {
  it.each(FROZEN_TOOL_LIST_SURFACES)("freezes the served %s list and its exact digest", async (surface) => {
    const fixture = JSON.parse(await readFile(frozenToolListPath(surface), "utf8"));
    expect(await servedToolList(frozenSurfaceServer(surface)), TOOL_LIST_FROZEN_MESSAGE).toStrictEqual(fixture);
    expect(await toolListVersionOf(frozenSurfaceServer(surface)), TOOL_LIST_FROZEN_MESSAGE)
      .toBe(digestCanonicalJson(fixture).slice(0, 16));
  });

  it.each(FROZEN_TOOL_LIST_SURFACES)("keeps %s descriptions and schemas independent of running versions", async (surface) => {
    const canonical = await servedToolList(frozenSurfaceServer(surface));
    const running = await servedToolList(createAskRigorServer(surface === "gemini" ? "gemini" : "standard", {
      mcpSurface: surface === "claude" ? "/mcp/claude" : surface === "gemini" ? "/mcp/gemini" : "/mcp",
      runningVersions: RUNNING,
    }));
    expect(running).toEqual(canonical);
    const bytes = JSON.stringify(running);
    for (const volatile of [...Object.values(RUNNING), RESEARCH_USE_NOTICE_VERSION, FINALIZE_RESEARCH_CONTRACT,
      "Versions when this tool list was loaded", "this release"]) expect(bytes).not.toContain(volatile);
    // Dates/protocol-version literals cannot slip into another description, schema, enum or literal.
    expect(bytes).not.toMatch(/\b20\d\d-\d\d-\d\d\b|\b20\.[0-9]+\.[0-9]+\b/u);
  });

  it.each(FROZEN_TOOL_LIST_SURFACES)("leaves every published %s output schema open at every depth", async (surface) => {
    for (const tool of await servedToolList(frozenSurfaceServer(surface))) {
      expect(closedPaths(tool.outputSchema), `${surface}/${tool.name}`).toEqual([]);
      expect(closedValuePaths(tool.outputSchema), `${surface}/${tool.name}`).toEqual([]);
    }
  });

  it.each(FROZEN_TOOL_LIST_SURFACES)("keeps every %s published property and required input compatible with runtime", async (surface) => {
    for (const tool of await servedToolList(frozenSurfaceServer(surface))) {
      const operation = RESEARCH_OPERATIONS.find(({ name }) => name === tool.name)!;
      const runtime = z.toJSONSchema(operation.runtimeInputSchema, { target: "draft-7", io: "input" });
      const published = tool.inputSchema;
      for (const property of Object.keys(published.properties ?? {})) {
        expect(Object.hasOwn(runtime.properties!, property), `${surface}/${tool.name}/${property}`).toBe(true);
      }
      for (const property of runtime.required ?? []) {
        expect(published.required ?? [], `${surface}/${tool.name}/${property}`).toContain(property);
      }
      // No SDK parser can reject a new top-level value or strip it before the runtime wrapper sees it.
      const future = { future_input: { nested: "new" }, action: "future_action" };
      expect((operation.inputSchema as z.ZodObject).parse(future)).toEqual(future);
    }
  });

  it.each(FROZEN_TOOL_LIST_SURFACES)("publishes extensible object envelopes on %s within its transport budget", async (surface) => {
    const tools = await servedToolList(frozenSurfaceServer(surface));
    const omitted: string[] = [];
    for (const tool of tools) {
      const field = tool.inputSchema.properties?.later_inputs as Record<string, unknown> | undefined;
      if (field === undefined) { omitted.push(tool.name); continue; }
      expect(field.type, tool.name).toBe("object");
      expect(field.description, tool.name).toBe(LATER_INPUTS_DESCRIPTION);
      expect(field).not.toHaveProperty("properties");
      expect(field.additionalProperties, tool.name).not.toBe(false);
      expect(tool.inputSchema.required ?? []).not.toContain("later_inputs");
    }
    if (surface !== "gemini") expect(omitted).toEqual([]);
    else {
      expect(Buffer.byteLength(JSON.stringify({ tools }))).toBeLessThan(25_000);
      // Exact omissions are part of the frozen served catalog and are reported at freeze/closeout.
      expect(omitted).toEqual(JSON.parse(await readFile(frozenToolListPath(surface), "utf8"))
        .filter((tool: { inputSchema: { properties: object } }) => !Object.hasOwn(tool.inputSchema.properties, "later_inputs"))
        .map((tool: { name: string }) => tool.name));
    }
  });

  it("lets a retained schema validate later fields through nested strict objects, arrays and unions", () => {
    const schema = openToolOutputSchema(z.strictObject({
      nested: z.strictObject({ items: z.array(z.union([z.strictObject({ value: z.string() }), z.null()])) }),
    }));
    const published = z.toJSONSchema(schema, { target: "draft-7" });
    const validate = new Ajv().compile(published);
    expect(validate({ added: true, nested: { added: true, items: [{ value: "old", added: true }, null] } }),
      JSON.stringify(validate.errors)).toBe(true);
  });

  it("opens output values for retained clients without changing server-side validation", () => {
    const schema = openToolOutputSchema(z.strictObject({
      status: z.enum(["old"]), nested: z.strictObject({ kind: z.literal("old"), enabled: z.literal(true) }),
      items: z.array(z.union([z.strictObject({ state: z.enum(["old"]) }), z.null()])),
    }));
    const future = { status: "new", nested: { kind: "new", enabled: false }, items: [{ state: "new" }] };
    expect(new Ajv().compile(z.toJSONSchema(schema, { target: "draft-7" }))(future)).toBe(true);
    expect(schema.safeParse(future).success).toBe(false);
    expect(closedValuePaths(z.toJSONSchema(schema))).toEqual([]);
  });
});
