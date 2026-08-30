import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  PostgresEvidenceRepository,
  renderResearchFrontierViews,
  sha256,
  stableJson,
} from "../packages/evidence-repository/src/index.js";
import { HISTORICAL_PILOT_QUESTION_ID, historicalPilotContributions } from "./living-evidence-pilot-fixtures.mts";
import { researchFrontierFixture } from "./living-evidence-task-acceptance.mts";

interface GeneratedFile {
  relativePath: string;
  content: string;
}

function markdownSafe(value: unknown): string {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function mermaidLabel(value: unknown): string {
  return String(value ?? "").replaceAll("\\", "\\\\").replaceAll('"', "'").replaceAll("\n", " ");
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const root = process.cwd();
  const outputDirectory = resolve(process.env.ASKRIGOR_LIVING_EVIDENCE_OUTPUT ?? "/tmp/askrigor-living-evidence-pilot");
  const repository = new PostgresEvidenceRepository({
    connectionString,
    schema: process.env.ASKRIGOR_LIVING_EVIDENCE_SCHEMA ?? "living_evidence",
    ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined,
  });
  try {
    await repository.migrate();
    const contributions = await historicalPilotContributions(root);
    const receipts = [];
    for (const contribution of contributions) receipts.push(await repository.contribute(contribution));
    const frontierContribution = researchFrontierFixture("pilot-v1");
    const frontierReceipt = await repository.contributeFrontier(frontierContribution);
    const frontierEnvelope = await repository.getResearchFrontier({
      frontierId: frontierContribution.frontier.frontierId,
    });
    const frontierSnapshot = (frontierEnvelope.frontiers as Array<Record<string, unknown>>)[0]!;
    const frontierViews = renderResearchFrontierViews(frontierSnapshot);
    const analyses = [];
    for (const analysisId of new Set(contributions.map(({ analysis }) => analysis.analysisId))) {
      analyses.push(await repository.exportAnalysis(analysisId));
    }
    const repositoryExport = await repository.exportRepository();
    const records = repositoryExport.records as Record<string, Array<Record<string, unknown>>>;
    const prpTopic = records.topics!.find(({ canonical_key }) => canonical_key === "health.hip-osteoarthritis.platelet-rich-plasma");
    if (prpTopic === undefined) throw new Error("PILOT_TOPIC_NOT_FOUND");
    const topicGraph = await repository.getTopicGraph(String(prpTopic.topic_id));
    const queryResults = {
      exact_identifier: await repository.searchKnowledge({ identifier: { scheme: "doi", value: "10.7759/cureus.72057" }, includeHistorical: true }),
      full_text: await repository.searchKnowledge({ text: "platelet rich plasma", includeHistorical: true }),
      structured: await repository.searchKnowledge({
        topicKey: "health.hip-osteoarthritis.platelet-rich-plasma",
        programOrExposure: "platelet-rich plasma",
        outcome: "pain",
        includeHistorical: true,
      }),
      current_only_after_synthetic_invalidation: await repository.searchKnowledge({
        topicKey: "health.hip-osteoarthritis.platelet-rich-plasma",
        programOrExposure: "platelet-rich plasma",
        includeHistorical: false,
      }),
    };
    const qualityRanking = await repository.rankAssessmentsForQuestion(HISTORICAL_PILOT_QUESTION_ID);
    const counts = {
      exact_identifier: Number(queryResults.exact_identifier.result_count),
      full_text: Number(queryResults.full_text.result_count),
      structured_historical: Number(queryResults.structured.result_count),
      current_after_invalidation: Number(queryResults.current_only_after_synthetic_invalidation.result_count),
      quality_ranking: (qualityRanking.results as unknown[]).length,
      topic_graph: (topicGraph.topics as unknown[]).length,
    };
    const expectedCounts = {
      exact_identifier: 1,
      full_text: 4,
      structured_historical: 7,
      current_after_invalidation: 0,
      quality_ranking: 5,
      topic_graph: 3,
    };
    if (JSON.stringify(counts) !== JSON.stringify(expectedCounts)) {
      throw new Error(`PILOT_FIXED_QUERY_MISMATCH actual=${JSON.stringify(counts)} expected=${JSON.stringify(expectedCounts)}`);
    }
    const retrievalBenchmark = {
      benchmark_schema: "askrigor.living-evidence.retrieval-decision.v1",
      fixed_query_counts: counts,
      exact_provenance_visible: true,
      current_and_historical_separated: true,
      synthetic_invalidation_propagated: true,
      transparent_quality_ordering_without_composite_score: true,
      recursive_topic_graph_answered: true,
      postgres_material_query_misses: 0,
      vector_or_separate_graph_service_justified: false,
      decision: "retain PostgreSQL structured/full-text/edge retrieval for the pilot; keep embeddings and a separate graph service deferred",
      flat_json_role: "portable export and review baseline only; it does not become the concurrent transactional authority",
    };
    const artifact = {
      artifact_schema: "askrigor.living-evidence.pilot-review.v1",
      generated_at: new Date().toISOString(),
      source_policy: {
        complete_performed_analysis_storage_verified: true,
        historical_imports_labeled_to_actual_extent: true,
        community_derived_analysis_included: false,
        raw_source_content_included: false,
        raw_private_or_provider_data_included: false,
        historical_gaps_reconstructed: false,
        formal_research_frontier_included: true,
        youtube_or_community_records: 0,
      },
      receipts,
      frontier_receipt: frontierReceipt,
      research_frontier: frontierSnapshot,
      analyses,
      repository: repositoryExport,
      fixed_queries: queryResults,
      topic_graph: topicGraph,
      transparent_quality_ranking: qualityRanking,
      retrieval_decision_benchmark: retrievalBenchmark,
    };
    const artifactText = `${JSON.stringify(artifact, null, 2)}\n`;
    await mkdir(outputDirectory, { recursive: true });
    await mkdir(join(outputDirectory, "obsidian", "Analyses"), { recursive: true });
    await mkdir(join(outputDirectory, "obsidian", "Frontiers"), { recursive: true });
    await mkdir(join(outputDirectory, "maps"), { recursive: true });
    await chmod(outputDirectory, 0o700);
    await chmod(join(outputDirectory, "obsidian"), 0o700);
    await chmod(join(outputDirectory, "obsidian", "Analyses"), 0o700);
    await chmod(join(outputDirectory, "obsidian", "Frontiers"), 0o700);
    await chmod(join(outputDirectory, "maps"), 0o700);
    const artifactPath = join(outputDirectory, "living-evidence-pilot-review.json");
    const manifestPath = join(outputDirectory, "living-evidence-pilot-review.manifest.json");
    await writeFile(artifactPath, artifactText, { encoding: "utf8", mode: 0o600 });

    const generated: GeneratedFile[] = [
      { relativePath: "repository-export.json", content: `${JSON.stringify(repositoryExport, null, 2)}\n` },
      { relativePath: "fixed-query-results.json", content: `${JSON.stringify(queryResults, null, 2)}\n` },
      { relativePath: "transparent-quality-ranking.json", content: `${JSON.stringify(qualityRanking, null, 2)}\n` },
      { relativePath: "topic-graph.json", content: `${JSON.stringify(topicGraph, null, 2)}\n` },
      { relativePath: "retrieval-decision-benchmark.json", content: `${JSON.stringify(retrievalBenchmark, null, 2)}\n` },
      {
        relativePath: "excluded-artifacts.json",
        content: `${JSON.stringify({
          schema: "askrigor.living-evidence.excluded-artifacts.v1",
          excluded: ["raw source bodies", "transcripts", "comments and replies", "creator or commenter identity", "raw chat or prompts", "private research content", "provider response bodies", "credentials"],
          youtube_or_community_records: 0,
          raw_source_content_included: false,
        }, null, 2)}\n`,
      },
      {
        relativePath: `obsidian/Frontiers/${frontierContribution.frontier.frontierId}.md`,
        content: frontierViews.obsidianMarkdown,
      },
      {
        relativePath: "maps/research-frontier.mmd",
        content: frontierViews.mermaid,
      },
      {
        relativePath: "deletion-manifest.json",
        content: `${JSON.stringify({
          schema: "askrigor.living-evidence.deletion-manifest.v1",
          generated_at: new Date().toISOString(),
          delete_by: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000).toISOString(),
          targets: ["the exact disposable pilot database/schema", "generated local review/export artifacts", "any separately approved Railway pilot resources"],
          production_targets: [],
          automated_backups_enabled: false,
          logical_export_required_before_deletion: true,
        }, null, 2)}\n`,
      },
    ];

    for (const exported of analyses) {
      const analysis = exported.analysis as Record<string, unknown>;
      const versions = exported.versions as Array<Record<string, unknown>>;
      const title = analysis.display_title ?? analysis.topic_label ?? analysis.analysis_id;
      const note = [
        "<!-- GENERATED READ-ONLY VIEW. PostgreSQL records and exact receipts are authoritative. -->",
        `# ${markdownSafe(title)}`,
        "",
        `- Analysis ID: \`${analysis.analysis_id}\``,
        `- Kind: \`${analysis.analysis_kind}\``,
        `- Current versions represented: ${versions.length}`,
        `- Raw source content included: **no**`,
        "",
        ...versions.flatMap((version) => [
          `## Version ${version.version_id}`,
          "",
          `- Capture: \`${version.capture_status}\``,
          `- Relationship: \`${version.relationship}\``,
          `- Whole-text SHA-256: \`${version.whole_text_sha256}\``,
          `- Coverage: ${markdownSafe(version.coverage_statement)}`,
          "",
          ...(version.sections as Array<Record<string, unknown>>).flatMap((section) => [String(section.content)]),
        ]),
      ].join("\n");
      generated.push({ relativePath: `obsidian/Analyses/${analysis.analysis_id}.md`, content: `${note}\n` });
    }

    const topics = records.topics ?? [];
    const topicEdges = records.topic_edges ?? [];
    const sourceFamilies = records.source_families ?? [];
    const claims = records.claim_versions ?? [];
    const topicNode = new Map(topics.map((topic, index) => [String(topic.topic_id), `T${index}`]));
    const mapLines = [
      "# Generated living-evidence pilot map",
      "",
      "> GENERATED READ-ONLY VIEW. Canonical PostgreSQL rows and receipts control.",
      "",
      "```mermaid",
      "flowchart LR",
      ...topics.map((topic, index) => `  T${index}[\"${mermaidLabel(topic.label)}\"]`),
      ...topicEdges.map((edge) => `  ${topicNode.get(String(edge.from_topic_id))} -->|${mermaidLabel(edge.relation)}| ${topicNode.get(String(edge.to_topic_id))}`),
      ...sourceFamilies.map((source, index) => `  S${index}[\"${mermaidLabel(source.display_title)}\"]`),
      ...claims.map((claim, index) => `  C${index}[\"[${mermaidLabel(claim.status)}] ${mermaidLabel(claim.normalized_assertion).slice(0, 100)}\"]`),
      "```",
      "",
      "The map deliberately includes both current and historical claim versions, labels every claim status, and does not imply that proximity, count, or retrieval rank establishes evidentiary authority.",
    ];
    generated.push({ relativePath: "maps/living-evidence-pilot-map.md", content: `${mapLines.join("\n")}\n` });

    const roCrateGraph = [
      { "@id": "ro-crate-metadata.json", "@type": "CreativeWork", about: { "@id": "./" }, conformsTo: { "@id": "https://w3id.org/ro/crate/1.3" } },
      { "@id": "./", "@type": "Dataset", name: "AskRigor living-evidence pilot export", hasPart: [
        { "@id": "repository-export.json" }, { "@id": "fixed-query-results.json" }, { "@id": "transparent-quality-ranking.json" }, { "@id": "retrieval-decision-benchmark.json" }, { "@id": "maps/living-evidence-pilot-map.md" }, { "@id": "maps/research-frontier.mmd" }, { "@id": `obsidian/Frontiers/${frontierContribution.frontier.frontierId}.md` },
      ] },
      ...topics.map((topic) => ({ "@id": `urn:askrigor:topic:${topic.topic_id}`, "@type": "DefinedTerm", name: topic.label, identifier: topic.canonical_key })),
      ...sourceFamilies.map((source) => ({ "@id": `urn:askrigor:source-family:${source.family_id}`, "@type": "ScholarlyArticle", name: source.display_title, additionalType: source.source_kind })),
      ...claims.map((claim) => ({ "@id": `urn:askrigor:claim-version:${claim.version_id}`, "@type": "Claim", text: claim.normalized_assertion, creativeWorkStatus: claim.status })),
    ];
    generated.push({
      relativePath: "ro-crate-metadata.json",
      content: `${JSON.stringify({ "@context": "https://w3id.org/ro/crate/1.2/context", "@graph": roCrateGraph }, null, 2)}\n`,
    });

    for (const file of generated) {
      await writeFile(join(outputDirectory, file.relativePath), file.content, { encoding: "utf8", mode: 0o600 });
    }
    const fileInventory = [
      { relativePath: "living-evidence-pilot-review.json", content: artifactText },
      ...generated,
    ].map(({ relativePath, content }) => ({
      path: relativePath,
      sha256: sha256(content),
      bytes: Buffer.byteLength(content, "utf8"),
    }));
    const manifest = {
      artifact_sha256: sha256(artifactText),
      artifact_bytes: Buffer.byteLength(artifactText, "utf8"),
      artifact_content_sha256: sha256(stableJson(artifact)),
      artifact_contains_generation_timestamps: true,
      repository_canonical_sha256: repositoryExport.canonical_sha256,
      analysis_count: analyses.length,
      version_count: analyses.reduce((count, analysis) => count + (analysis.versions as unknown[]).length, 0),
      source_family_count: sourceFamilies.length,
      claim_version_count: claims.length,
      frontier_count: Number((repositoryExport.inventory as Record<string, number>).research_frontiers),
      frontier_contribution_count: Number((repositoryExport.inventory as Record<string, number>).frontier_contributions),
      discovery_pass_count: Number((repositoryExport.inventory as Record<string, number>).discovery_passes),
      file_inventory: fileInventory,
      raw_source_content_included: false,
      community_data_included: false,
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    process.stdout.write(`${JSON.stringify({ status: "PASS", ...manifest, artifact: artifactPath, manifest: manifestPath })}\n`);
    process.stdout.write(`REVIEW THIS FILE: ${artifactPath}\n`);
  } finally {
    await repository.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown pilot failure";
  process.stderr.write(`Living-evidence pilot failed: ${message}\n`);
  process.exitCode = 1;
});
