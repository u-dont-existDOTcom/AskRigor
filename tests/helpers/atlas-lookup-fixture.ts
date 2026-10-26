import { issueResearchReceipt, researchTargetDigest, type ResearchReceiptOptions } from "../../apps/research-mcp/src/research-receipts.js";

/** A completed, empty Atlas lookup for fixtures that isolate another research gate. */
export function atlasLookupFixture(target: string, options: ResearchReceiptOptions): string {
  return issueResearchReceipt("atlas_lookup", { words: ["synthetic"], target: researchTargetDigest(target),
    origin: "https://askrigor.com", found: [] }, options);
}
export function withAtlasLookupFixture<T>(input: T, options: { secret?: string; now?: () => Date } | undefined): T {
  if (input === null || typeof input !== "object") return input;
  const raw = input as Record<string, unknown>;
  if (options?.secret === undefined || !Array.isArray(raw.receipts) || typeof raw.research_target !== "string" ||
    raw.research_target.trim() === "") return input;
  return { ...input, receipts: [...raw.receipts, atlasLookupFixture(raw.research_target, { ...options, secret: options.secret })] };
}
