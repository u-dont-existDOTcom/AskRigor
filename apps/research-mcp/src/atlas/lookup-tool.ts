import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { PostgresAtlasPageSource, type AtlasPageSource } from "@askrigor/evidence-repository";
import { z } from "zod";
import { livingEvidenceReuseConfigFromEnv } from "../config.js";
import { getResearchFrontier, type ResearchFrontierReader } from "../research-frontier-tool.js";
import { searchResearchFrontiers, researchFrontierSearchOutputSchema, type ResearchFrontierCatalogReader } from "../research-frontier-search-tool.js";
import { issueResearchReceipt, researchTargetDigest, type ResearchReceiptOptions } from "../research-receipts.js";
import { loadAtlasFindings, loadAtlasTopic, NOT_CHECKED_LABEL, type ShownFinding } from "./page-data.js";
import { atlasSearchQuery } from "./search.js";
import { atlasPageUrl, atlasReceiptFinding } from "./reuse.js";

/** Keeps the 33-tool catalog: search_research_frontiers now searches the public Atlas as well as its stored plans. */
export const atlasLookupInputSchema = z.object({
  query: z.string().optional().describe("Words to search in the Atlas, exactly as its pages do: at most 300 characters and 20 words, in any language."),
  topic_key: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,199}$/u).optional().describe("An exact Atlas topic key; may be combined with query."),
  research_target: z.string().trim().min(1).max(500).optional().describe("The research target, copied as given to discovery and finalize_research. Required for a lookup receipt that counts for the final check."),
  limit: z.number().int().min(1).max(20).default(10),
}).strict().superRefine((input, context) => {
  if (input.query === undefined && input.topic_key === undefined) context.addIssue({ code: "custom", message: "Give query or topic_key." });
  if (input.query !== undefined) {
    const parsed = atlasSearchQuery(input.query);
    if (parsed.query === null) context.addIssue({ code: "custom", path: ["query"], message: parsed.message! });
  }
});
const identifiers = z.array(z.object({ scheme: z.enum(["doi", "pmid", "pmcid", "nct"]), value: z.string() }).strict());
const findingSchema = z.object({
  publication_number: z.string(), atlas_number: z.string().nullable(),
  state: z.enum(["checked", NOT_CHECKED_LABEL]), label: z.string(), certainty: z.string().nullable(),
  wording: z.string(), applies_to: z.string().nullable(), question: z.string().nullable(),
  topic: z.object({ key: z.string(), label: z.string() }).strict().nullable(),
  sources: z.array(identifiers),
  links: z.array(z.object({ atlasNumber: z.string(), relation: z.enum(["same_as", "narrows", "contradicts", "replaces"]), direction: z.enum(["incoming", "outgoing"]) }).strict()),
  page_url: z.url(),
}).strict();
export const atlasLookupOutputSchema = z.object({
  record_type: z.literal("atlas_lookup"),
  retrieved_at: z.iso.datetime(),
  status: z.enum(["complete", "partial", "inaccessible", "error"]),
  query_words: z.array(z.string()), topic_key: z.string().nullable(),
  findings: z.array(findingSchema).max(20), has_more: z.boolean(),
  topic_leads: z.array(z.object({ topic_key: z.string(), findings: z.array(findingSchema).max(20), has_more: z.boolean() }).strict()).max(20),
  frontier_catalog: researchFrontierSearchOutputSchema.optional(),
  open_trails: z.array(z.object({ frontier_id: z.string(), topic_key: z.string(), question: z.string(),
    trail_id: z.string(), state: z.string(), description: z.string(), next_capability: z.string().nullable(),
  }).strict()).max(20),
  trails_have_more: z.boolean(), limitations: z.array(z.string()), research_receipt: z.string().optional(),
}).strict();
export interface AtlasLookupDependencies {
  source?: AtlasPageSource;
  reader?: ResearchFrontierReader & ResearchFrontierCatalogReader;
  receipt?: ResearchReceiptOptions;
  now?: () => Date;
  origin?: string;
}
export function configuredAtlasLookupSource(env: NodeJS.ProcessEnv = process.env): AtlasPageSource | undefined {
  try {
    const config = livingEvidenceReuseConfigFromEnv(env);
    return config === undefined ? undefined : new PostgresAtlasPageSource(config);
  } catch { return undefined; }
}
let lastReceiptOrder = 0;
const nextReceiptOrder = (now: Date): number => (lastReceiptOrder = Math.max(now.getTime(), lastReceiptOrder + 1));
const originOf = (raw: string | undefined): string => {
  try {
    const url = new URL(raw ?? "https://askrigor.com");
    if (url.protocol === "https:" && url.username === "" && url.password === "") return url.origin;
  } catch { /* Default public Atlas. */ }
  return "https://askrigor.com";
};
function publicFinding(finding: ShownFinding, origin: string): z.output<typeof findingSchema> {
  const checked = finding.status.kind !== "unreviewed";
  return { publication_number: finding.publicationNumber, atlas_number: finding.status.kind === "unreviewed" ? null : finding.status.atlasNumber,
    state: checked ? "checked" : NOT_CHECKED_LABEL, label: finding.status.kind, certainty: finding.certainty,
    wording: finding.claim, applies_to: finding.appliesTo, question: finding.question, topic: finding.topic,
    sources: finding.sources, links: finding.links, page_url: atlasPageUrl(finding.publicationNumber, origin) };
}
export async function lookupAtlas(raw: unknown, dependencies: AtlasLookupDependencies = {}): Promise<z.output<typeof atlasLookupOutputSchema>> {
  const input = atlasLookupInputSchema.parse(raw);
  const now = dependencies.now ?? (() => new Date());
  const origin = originOf(dependencies.origin ?? process.env.ASKRIGOR_ATLAS_PUBLIC_ORIGIN);
  const query = input.query === undefined ? undefined : atlasSearchQuery(input.query).query!;
  const output: z.output<typeof atlasLookupOutputSchema> = {
    record_type: "atlas_lookup", retrieved_at: now().toISOString(), status: "complete", query_words: query?.words ?? [],
    topic_key: input.topic_key ?? null, findings: [], has_more: false, topic_leads: [], open_trails: [],
    trails_have_more: false, limitations: [
      "Word search uses the public Atlas pages' exact tokens; different wording may leave relevant findings unmatched. No match is not evidence of absence.",
      "Unchecked findings are leads, never established findings. Re-read at least one of their sources before using them beyond a lead.",
      "Stored plans and their trails are research control, not evidence. Currentness is not assessed.",
    ],
  };
  // A lookup that could not run still signs an attempt receipt marked failed, so the final check can close its step
  // as tried, with a stated limit, rather than ask again for a search that cannot succeed (26 Oct regressions,
  // finding 2).
  const attemptReceipt = (): void => {
    if (dependencies.receipt === undefined || input.research_target === undefined) return;
    output.research_receipt = issueResearchReceipt("atlas_lookup", {
      words: query?.words ?? [], topic: input.topic_key, target: researchTargetDigest(input.research_target),
      t: nextReceiptOrder(now()), origin, found: [], failed: output.status,
    }, { ...dependencies.receipt, now });
  };
  if (dependencies.source === undefined) {
    output.status = "inaccessible";
    output.limitations.push("The public Atlas reader is not configured; the Atlas lookup did not run.");
    attemptReceipt();
    return output;
  }
  const returned = new Map<string, ShownFinding>();
  try {
    const page = await loadAtlasFindings(dependencies.source, { ...(query === undefined ? {} : { search: query }),
      ...(input.topic_key === undefined ? {} : { topicKey: input.topic_key }) });
    const findings = page.findings.slice(0, input.limit);
    output.findings = findings.map((finding) => publicFinding(finding, origin));
    output.has_more = page.before !== null || page.findings.length > input.limit;
    const topics = [...new Set([...(input.topic_key === undefined ? [] : [input.topic_key]),
      ...findings.flatMap(({ topic }) => topic === null ? [] : [topic.key])])];
    // Topic leads do not need to contain the query's words; they are open leads of the matched topic.
    for (const finding of findings) returned.set(finding.publicationNumber, finding);
    for (const topicKey of topics) {
      const topic = await loadAtlasTopic(dependencies.source, topicKey);
      const leads = topic?.sections.find(({ id }) => id === "leads")?.findings ?? [];
      const bounded = leads.filter((finding) => {
        if (returned.has(finding.publicationNumber)) return true;
        if (returned.size === 20) return false;
        returned.set(finding.publicationNumber, finding);
        return true;
      });
      output.topic_leads.push({ topic_key: topicKey, findings: bounded.map((finding) => publicFinding(finding, origin)),
        has_more: leads.length > bounded.length });
    }

  } catch {
    output.status = "error";
    output.findings = []; output.topic_leads = [];
    output.limitations.push("The public Atlas lookup failed; its receipt records an attempt that found nothing, not an empty Atlas.");
    attemptReceipt();
    return output;
  }
  const frontiers = [];
  if (input.query !== undefined) {
    const catalog = await searchResearchFrontiers({ query: input.query, limit: Math.min(input.limit, 25) }, { reader: dependencies.reader, now });
    output.frontier_catalog = catalog;
    if (catalog.search_status === "error" || catalog.search_status === "repository_unavailable") output.status = "partial";
    output.trails_have_more = catalog.data.has_more;
    for (const match of catalog.data.matches) {
      if (input.topic_key !== undefined && match.topic.canonical_key !== input.topic_key) continue;
      const result = await getResearchFrontier({ frontier_id: match.frontier_id }, { reader: dependencies.reader, now });
      if (result.lookup_status === "retrieved") frontiers.push(...result.data.frontiers);
      else output.status = "partial";
    }
  } else {
    const result = await getResearchFrontier({ topic_key: input.topic_key! }, { reader: dependencies.reader, now });
    if (result.lookup_status === "retrieved") frontiers.push(...result.data.frontiers);
    else if (result.lookup_status !== "not_indexed") output.status = "partial";
  }
  for (const frontier of frontiers) for (const trail of frontier.current_trails) {
    if (!["open", "ready", "blocked_retryable"].includes(trail.state)) continue;
    if (output.open_trails.length === 20) { output.trails_have_more = true; continue; }
    output.open_trails.push({ frontier_id: frontier.frontier_id, topic_key: frontier.topic.canonical_key,
      question: frontier.question.normalized_question, trail_id: trail.trail_id, state: trail.state,
      description: trail.description, next_capability: trail.next_capability });
  }
  if (output.status === "partial") output.limitations.push("Stored research plans could not all be read; this is a partial lookup, not an empty plan catalog.");
  const receiptOrder = nextReceiptOrder(now());
  // Bound whole records, never truncate a claim or source. This also fits the Actions' 60 KB response ceiling.
  const dropFinding = (): boolean => {
    const number = [...returned.keys()].at(-1);
    if (number === undefined) return false;
    returned.delete(number);
    output.findings = output.findings.filter((finding) => finding.publication_number !== number);
    output.has_more = true;
    for (const topic of output.topic_leads) {
      const kept = topic.findings.filter((finding) => finding.publication_number !== number);
      if (kept.length !== topic.findings.length) topic.has_more = true;
      topic.findings = kept;
    }
    return true;
  };
  for (;;) {
    try {
      if (dependencies.receipt !== undefined && input.research_target !== undefined)
        output.research_receipt = issueResearchReceipt("atlas_lookup", {
          words: query?.words ?? [], topic: input.topic_key, target: researchTargetDigest(input.research_target),
          t: receiptOrder, origin, found: [...returned.values()].map(atlasReceiptFinding),
        }, { ...dependencies.receipt, now });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "Research receipt exceeds its size limit" || !dropFinding()) throw error;
      continue;
    }
    if (Buffer.byteLength(JSON.stringify(output), "utf8") <= 52_000) break;
    const catalog = output.frontier_catalog;
    if (catalog !== undefined && catalog.data.matches.length > 0) {
      catalog.data.matches.pop(); catalog.data.result_count = catalog.data.matches.length;
      catalog.data.has_more = true; catalog.pagination.returned = catalog.data.matches.length;
      catalog.pagination.has_more = true; output.trails_have_more = true;
    } else if (output.open_trails.length > 0) {
      output.open_trails.pop(); output.trails_have_more = true;
    } else if (!dropFinding()) break;
  }
  return atlasLookupOutputSchema.parse(output);
}
export async function atlasLookupToolResult(input: unknown, dependencies: AtlasLookupDependencies): Promise<CallToolResult> {
  const output = await lookupAtlas(input, dependencies);
  return { content: [{ type: "text", text: `Atlas lookup: ${output.status}; ${output.findings.length} matching findings and ${output.open_trails.length} open research trails. ` +
    "Before research, build on the returned findings and leads; pass the research_receipt to finalize_research and declare each finding in atlas_reuse. " +
    (output.research_receipt === undefined ? "No lookup receipt was issued." : `research_receipt: ${output.research_receipt}`) }],
    // A failed lookup that signed its attempt receipt is not an error result: clients keep a result's receipt only then.
    structuredContent: output,
    ...(["error", "inaccessible"].includes(output.status) && output.research_receipt === undefined ? { isError: true } : {}) };
}
