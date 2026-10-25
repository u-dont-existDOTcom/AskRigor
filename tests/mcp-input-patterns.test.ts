import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import { finalizeResearchInputSchema } from "../apps/research-mcp/src/research-finalization-gate.js";
import { submitResearchContributionInputSchema } from "../apps/research-mcp/src/research-contributor-access-tool.js";

const UPPERCASE_DOIS = ["10.1002/14651858.CD014682.pub2", "10.23736/S1128-9155.18.00455-7"];
const DOI_SAMPLES = UPPERCASE_DOIS.flatMap((doi) => [
  doi, doi.toLowerCase(), `https://doi.org/${doi}`, `HTTPS://DOI.ORG/${doi}`, `HtTpS://Dx.DoI.OrG/${doi}`,
  `HTTP://DX.DOI.ORG/${doi}`
]);
const SAMPLES = [
  ...DOI_SAMPLES,
  "", "invalid value", "é", "a", "en", "en-US", "zh-Hant-TW", "12345", "0",
  "2026-10-17", "2024-02-29", "2025-02-29", "2026-13-01",
  "2026-10-17T12:00:00Z", "2026-10-17T12:00:00.5+02:00", "2026-10-17T12:00:00", "2025-02-29T12:00:00Z",
  "PMC12345", "pmc12345", "PmC12345", "PMC0", "PMC12345678901234567",
  "NCT12345678", "nct12345678", "NCT1234567",
  "a".repeat(64), "A".repeat(64), `aft1_${"a".repeat(32)}`, `aft1_${"a".repeat(31)}`,
  "jats_000001_abcdef012345", "pdf_000001_abcdef012345", "direct_000001_abcdef012345",
  "free-contributor-v2-2026-09-30", "free-contributor-v3-2026-10-22", "hip-oa", "aaaaaaaaaaa",
  "123e4567-e89b-42d3-a456-426614174000", "123E4567-E89B-42D3-A456-426614174000",
  "00000000-0000-0000-0000-000000000000", "ffffffff-ffff-ffff-ffff-ffffffffffff",
  "10.1002/", "https://example.org/10.1002/test", "10.123/test", "10.1234567890/test",
  // Atlas phase 2: a findings card's id and an accepted finding's number, in any case.
  "ARF-0142", "arf-0042", "ARF-1234567890", "ARF-", "F-1007", "f-1001", "F-0999", "F-100",
  // Decision 171: a publication's number, in any case.
  "P-1003", "p-1001", "P-0999", "P-100"
];

type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject => typeof value === "object" && value !== null;

function visitJson(value: unknown, visit: (node: JsonObject, path: string) => void, path = "input"): void {
  if (!isObject(value)) return;
  visit(value, path);
  for (const [key, child] of Object.entries(value)) visitJson(child, visit, `${path}.${key}`);
}

// Inspect the schemas the real server registered, including wrappers, arrays,
// unions, raw shapes, and string-format checks (not only .regex() literals).
function inspectZod(input: unknown, tool: string): Map<string, z.ZodType<string>[]> {
  const byPattern = new Map<string, z.ZodType<string>[]>();
  const seen = new Set<object>();
  const visit = (value: unknown): void => {
    if (!isObject(value) || seen.has(value)) return;
    seen.add(value);
    if (value instanceof RegExp) {
      expect(value.flags, `${tool}: ${value}`).not.toMatch(/[ismy]/u);
      return;
    }
    const definition = isObject(value._zod) && isObject(value._zod.def) ? value._zod.def : value;
    if (definition.type === "string" && typeof value.safeParse === "function") {
      const checks = Array.isArray(definition.checks) ? definition.checks : [];
      for (const pattern of [definition.pattern, ...checks.map((check) => check._zod?.def?.pattern)]) {
        if (pattern instanceof RegExp) {
          byPattern.set(pattern.source, [...byPattern.get(pattern.source) ?? [], value as unknown as z.ZodType<string>]);
        }
      }
    }
    for (const child of Object.values(definition)) visit(child);
  };
  visit(input);
  return byPattern;
}

describe("published MCP input patterns", () => {
  it.each(["/mcp", "/mcp/claude", "/mcp/gemini"] as const)(
    "preserves registered Zod matching on %s without unpublishable flags",
    async (surface) => {
      // Observe registration without replacing it; tools/list still comes from
      // the real server and its surface-specific catalog projection.
      const registration = vi.spyOn(McpServer.prototype, "registerTool");
      let server: ReturnType<typeof createAskRigorServer>;
      let inputs: Map<string, unknown>;
      try {
        server = createAskRigorServer(surface === "/mcp/gemini" ? "gemini" : "standard", { mcpSurface: surface });
        inputs = new Map(registration.mock.calls.map(([name, config]) => [name, config.inputSchema]));
      } finally {
        registration.mockRestore();
      }
      const client = new Client({ name: "input-pattern-test", version: "0.1.0" });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      try {
        await server.connect(serverTransport);
        await client.connect(clientTransport);
        const { tools } = await client.listTools();
        expect(tools).toHaveLength(surface === "/mcp/gemini" ? 22 : 33);
        // Gemini deliberately publishes pattern constraints as prose hints.
        // Check every registered input even when its pattern is not published.
        const patterns = new Map([...inputs].map(([name, input]) => [name, inspectZod(input, `${surface} ${name}`)]));
        if (inputs.has("finalize_research")) {
          // Its connector wrapper publishes metadata from this schema; the
          // handler parses with it after accepting the permissive transport.
          patterns.set("finalize_research", inspectZod(finalizeResearchInputSchema, `${surface} finalize_research`));
        }
        if (inputs.has("submit_research_contribution")) {
          // The same for the contribution (owner question 127): the intake checks every call with this contract.
          patterns.set("submit_research_contribution",
            inspectZod(submitResearchContributionInputSchema, `${surface} submit_research_contribution`));
        }
        let publishedPatterns = 0;
        let doiFields = 0;
        for (const tool of tools) {
          expect(inputs.has(tool.name)).toBe(true);
          visitJson(tool.inputSchema, (node, path) => {
            if (typeof node.pattern === "string") {
              publishedPatterns++;
              const published = new RegExp(node.pattern, "u");
              const originals = patterns.get(tool.name)?.get(node.pattern) ?? [];
              expect(originals.length, `${surface} ${tool.name} ${path}: registered pattern`).toBeGreaterThan(0);
              expect(SAMPLES.some((sample) => published.test(sample)), `${tool.name} ${path}: positive sample`).toBe(true);
              for (const original of originals) {
                for (const sample of SAMPLES) {
                  expect(published.test(sample), `${surface} ${tool.name} ${path}: ${sample}`)
                    .toBe(original.safeParse(sample).success);
                }
              }
            }
            if (isObject(node.properties)) {
              const input = inputs.get(tool.name);
              const schema = input instanceof z.ZodObject ? input : z.object(input as z.ZodRawShape);
              for (const [field, fieldSchema] of Object.entries(node.properties)) {
                if (field !== "doi" && !field.endsWith("_doi")) continue;
                doiFields++;
                // The catalog currently has one DOI field, at the input root.
                // Fail visibly if a new nested DOI needs samples and a binding.
                expect(path).toBe("input");
                const original = schema.shape[field] as z.ZodType<string>;
                expect(original).toBeDefined();
                for (const doi of DOI_SAMPLES) {
                  expect(original.safeParse(doi).success, `${surface} ${tool.name}.${field}: ${doi}`).toBe(true);
                  if (isObject(fieldSchema) && typeof fieldSchema.pattern === "string") {
                    expect(new RegExp(fieldSchema.pattern, "u").test(doi)).toBe(true);
                  }
                }
              }
            }
          });
        }
        expect(doiFields).toBeGreaterThan(0);
        if (surface === "/mcp/gemini") expect(publishedPatterns).toBe(0);
        else expect(publishedPatterns).toBeGreaterThan(0);
      } finally {
        await client.close();
        await server.close();
      }
    }
  );
});
