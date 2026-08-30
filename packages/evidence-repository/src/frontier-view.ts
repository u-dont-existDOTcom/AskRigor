import { assertNoProhibitedPersistentKeys } from "./contracts.js";
import { sha256, stableJson } from "./hash.js";

export interface ResearchFrontierDerivedViews {
  sourceCanonicalSha256: string;
  obsidianMarkdown: string;
  mermaid: string;
}

export function renderResearchFrontierViews(input: unknown): ResearchFrontierDerivedViews {
  assertNoProhibitedPersistentKeys(input);
  const snapshot = record(input, "FRONTIER_VIEW_INVALID");
  const sourceCanonicalSha256 = stringField(snapshot, "canonical_sha256");
  const canonical = { ...snapshot };
  delete canonical.canonical_sha256;
  if (sha256(stableJson(canonical)) !== sourceCanonicalSha256) {
    throw new Error("FRONTIER_VIEW_CANONICAL_SHA256_MISMATCH");
  }

  const topic = record(snapshot.topic, "FRONTIER_VIEW_TOPIC_INVALID");
  const question = record(snapshot.question, "FRONTIER_VIEW_QUESTION_INVALID");
  const frontierId = stringField(snapshot, "frontier_id");
  const topicKey = stringField(topic, "canonical_key");
  const topicLabel = stringField(topic, "label");
  const questionId = stringField(question, "question_id");
  const questionText = stringField(question, "normalized_question");
  const lanes = records(snapshot.lanes, "FRONTIER_VIEW_LANES_INVALID")
    .sort(byFields("canonical_key", "lane_id"));
  const passes = records(snapshot.passes, "FRONTIER_VIEW_PASSES_INVALID")
    .sort(byFields("executed_at", "pass_id"));
  const candidates = records(snapshot.current_candidates, "FRONTIER_VIEW_CANDIDATES_INVALID")
    .sort(byFields("decision", "display_title", "candidate_id"));
  const trails = records(snapshot.current_trails, "FRONTIER_VIEW_TRAILS_INVALID")
    .sort(byFields("priority", "state", "trail_kind", "trail_id"));

  const mermaid = renderMermaid(questionText, lanes, passes, candidates, trails);
  const markdown = [
    "---",
    "askrigor_schema: askrigor.living-evidence.research-frontier-view.v1",
    "derived_view: true",
    "not_evidence_authority: true",
    `frontier_id: ${yaml(frontierId)}`,
    `topic_key: ${yaml(topicKey)}`,
    `question_id: ${yaml(questionId)}`,
    `source_canonical_sha256: ${yaml(sourceCanonicalSha256)}`,
    "---",
    "",
    `# ${markdownInline(topicLabel)}`,
    "",
    `> Derived from the canonical PostgreSQL frontier. This map is a navigation and research-control view, not evidence authority.`,
    "",
    "## Question",
    "",
    markdownInline(questionText),
    "",
    "## Search lanes",
    "",
    ...lanes.flatMap((lane) => {
      const laneId = stringField(lane, "lane_id");
      const lanePasses = passes.filter((pass) => pass.lane_id === laneId);
      const header = `### ${markdownInline(stringField(lane, "label"))}`;
      const summary = `- Provider: ${markdownInline(stringField(lane, "provider"))} · source class: ${markdownInline(stringField(lane, "source_class"))} · next delta start: ${markdownInline(nullableText(lane.next_delta_start))}`;
      const passLines = lanePasses.length === 0
        ? ["- No recorded passes."]
        : lanePasses.map((pass) => `- ${stringField(pass, "status")} · ${windowText(pass)} · ${stringField(pass, "coverage_relation")}`);
      return [header, "", summary, ...passLines, ""];
    }),
    "## Current candidates",
    "",
    ...(candidates.length === 0
      ? ["- None recorded."]
      : candidates.map((candidate) =>
        `- **${markdownInline(stringField(candidate, "display_title"))}** — ${markdownInline(stringField(candidate, "decision"))}: ${markdownInline(stringField(candidate, "decision_reason"))}`
      )),
    "",
    "## Current research trails",
    "",
    ...(trails.length === 0
      ? ["- None recorded."]
      : trails.map((trail) => {
        const capability = typeof trail.next_capability === "string"
          ? ` Next: ${markdownInline(trail.next_capability)}`
          : "";
        const description = markdownInline(stringField(trail, "description"));
        const separator = /[.!?]$/u.test(description) ? "" : ".";
        return `- **${markdownInline(stringField(trail, "priority"))} / ${markdownInline(stringField(trail, "state"))} / ${markdownInline(stringField(trail, "trail_kind"))}** — ${description}${separator}${capability}`;
      })),
    "",
    "## Map",
    "",
    "```mermaid",
    mermaid.trimEnd(),
    "```",
    "",
  ].join("\n");

  return {
    sourceCanonicalSha256,
    obsidianMarkdown: markdown,
    mermaid,
  };
}

function renderMermaid(
  question: string,
  lanes: Array<Record<string, unknown>>,
  passes: Array<Record<string, unknown>>,
  candidates: Array<Record<string, unknown>>,
  trails: Array<Record<string, unknown>>,
): string {
  const lines = [
    "flowchart LR",
    `  question[\"Question: ${mermaidLabel(question)}\"]`,
  ];
  for (const lane of lanes) {
    const laneId = stringField(lane, "lane_id");
    const laneNode = node("lane", laneId);
    lines.push(`  ${laneNode}[\"Lane: ${mermaidLabel(stringField(lane, "label"))}\"]`);
    lines.push(`  question --> ${laneNode}`);
  }
  for (const pass of passes) {
    const passId = stringField(pass, "pass_id");
    const passNode = node("pass", passId);
    lines.push(`  ${passNode}[\"Pass: ${mermaidLabel(stringField(pass, "status"))} · ${mermaidLabel(windowText(pass))}\"]`);
    lines.push(`  ${node("lane", stringField(pass, "lane_id"))} --> ${passNode}`);
  }
  for (const candidate of candidates) {
    const candidateNode = node("candidate", stringField(candidate, "candidate_id"));
    lines.push(`  ${candidateNode}[\"Candidate: ${mermaidLabel(stringField(candidate, "display_title"))} · ${mermaidLabel(stringField(candidate, "decision"))}\"]`);
    lines.push(`  ${node("pass", stringField(candidate, "observed_in_pass_id"))} --> ${candidateNode}`);
  }
  for (const trail of trails) {
    const trailNode = node("trail", stringField(trail, "trail_id"));
    lines.push(`  ${trailNode}[\"Trail: ${mermaidLabel(stringField(trail, "trail_kind"))} · ${mermaidLabel(stringField(trail, "state"))}\"]`);
    const laneId = trail.lane_id;
    lines.push(`  ${typeof laneId === "string" ? node("lane", laneId) : "question"} -.-> ${trailNode}`);
  }
  lines.push("  classDef trail stroke-dasharray: 5 5");
  if (trails.length > 0) lines.push(`  class ${trails.map((trail) => node("trail", stringField(trail, "trail_id"))).join(",")} trail`);
  return `${lines.join("\n")}\n`;
}

function windowText(pass: Record<string, unknown>): string {
  const start = pass.confirmed_start ?? pass.requested_start;
  const end = pass.confirmed_end_exclusive ?? pass.requested_end_exclusive;
  return typeof start === "string" && typeof end === "string"
    ? `${start} to ${end} (end exclusive)`
    : "date coverage unscoped";
}

function node(prefix: string, identity: string): string {
  return `${prefix}_${sha256(identity).slice(0, 12)}`;
}

function yaml(value: string): string {
  return JSON.stringify(value);
}

function mermaidLabel(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\\", "&#92;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("[", "&#91;")
    .replaceAll("]", "&#93;")
    .replaceAll("(", "&#40;")
    .replaceAll(")", "&#41;")
    .replace(/[\r\n]+/gu, " ");
}

function markdownInline(value: string): string {
  return value
    .replace(/[\r\n]+/gu, " ")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\\", "\\\\")
    .replace(/([`*_\[\]!|])/gu, "\\$1");
}

function nullableText(value: unknown): string {
  return typeof value === "string" ? value : "not established";
}

function record(value: unknown, error: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(error);
  return value as Record<string, unknown>;
}

function records(value: unknown, error: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) throw new Error(error);
  return value.map((entry) => record(entry, error));
}

function stringField(value: Record<string, unknown>, field: string): string {
  const result = value[field];
  if (typeof result !== "string" || result.length === 0) throw new Error(`FRONTIER_VIEW_FIELD_INVALID field=${field}`);
  return result;
}

function byFields(...fields: string[]) {
  return (left: Record<string, unknown>, right: Record<string, unknown>) => {
    for (const field of fields) {
      const comparison = String(left[field] ?? "").localeCompare(String(right[field] ?? ""));
      if (comparison !== 0) return comparison;
    }
    return 0;
  };
}
