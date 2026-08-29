import { readFile } from "node:fs/promises";

import { Pool, type PoolClient, type PoolConfig } from "pg";

import type { LivingEvidenceContribution } from "./contracts.js";
import { deterministicUuid, sha256, stableJson } from "./hash.js";
import { prepareContribution, type PreparedContribution } from "./prepare.js";

export interface EvidenceRepositoryOptions {
  connectionString: string;
  schema?: string;
  ssl?: PoolConfig["ssl"];
  connectionTimeoutMillis?: number;
  queryTimeoutMillis?: number;
  statementTimeoutMillis?: number;
}

export type FailureInjection = "after_version" | "after_sections";

export interface ContributionReceipt {
  status: "inserted" | "idempotent_replay";
  analysisId: string;
  versionId: string;
  payloadSha256: string;
  wholeTextSha256: string;
  wholeTextBytes: number;
  sectionCount: number;
}

export interface KnowledgeSearchInput {
  text?: string;
  identifier?: { scheme: string; value: string };
  topicKey?: string;
  programOrExposure?: string;
  population?: string;
  outcome?: string;
  horizon?: string;
  capabilityState?: "can_support" | "cannot_support" | "uncertain";
  includeHistorical?: boolean;
  limit?: number;
}

export interface AnalysisReuseLookupInput {
  identifier: {
    scheme: "doi" | "pmid" | "pmcid" | "arxiv" | "nct" | "url" | "other";
    value: string;
  };
  sourceContentSha256: string;
  analysisKind: "study_method_audit" | "review_method_audit";
  analysisVersionId?: string;
  limit?: number;
}

export interface AnalysisReuseCandidate {
  analysisId: string;
  analysisVersionId: string;
  analysisKind: string;
  captureStatus: string;
  relationship: string;
  authoredAt: string;
  analysisUsable: boolean;
  sourceFamilyId: string;
  sourceVersionId: string;
  sourceContentSha256: string | null;
  sourceAccessStatus: string;
  sourceIdentifiers: Array<{ scheme: string; value: string }>;
  protocolManifestSha256s: string[];
  freshnessState: string | null;
  freshnessCheckedAt: string | null;
  completedImpactJobs: number;
  pendingImpactJobs: number;
  payload: LivingEvidenceContribution;
}

interface ExportedVersion {
  version_id: string;
  previous_version_id: string | null;
  relationship: string;
  capture_status: string;
  authored_at: string;
  coverage_statement: string;
  whole_text_sha256: string;
  whole_text_bytes: string;
  payload_sha256: string;
  idempotency_key: string;
  payload_json: LivingEvidenceContribution;
  sections: Array<{
    ordinal: number;
    section_key: string;
    title: string;
    content: string;
    content_sha256: string;
    content_bytes: string;
  }>;
  domains: unknown[];
  claim_capabilities: unknown[];
  future_analysis_items: unknown[];
  receipts: unknown[];
}

function assertSafeSchema(schema: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(schema)) {
    throw new Error("INVALID_POSTGRES_SCHEMA");
  }
  return schema;
}

export class PostgresEvidenceRepository {
  readonly schema: string;
  private readonly pool: Pool;

  constructor(options: EvidenceRepositoryOptions) {
    this.schema = assertSafeSchema(options.schema ?? "living_evidence");
    this.pool = new Pool({
      connectionString: options.connectionString,
      ssl: options.ssl,
      connectionTimeoutMillis: options.connectionTimeoutMillis,
      query_timeout: options.queryTimeoutMillis,
      statement_timeout: options.statementTimeoutMillis,
    });
  }

  async migrate(): Promise<void> {
    const migrationUrl = new URL("../migrations/0001_living_evidence.sql", import.meta.url);
    const migration = await readFile(migrationUrl, "utf8");
    const migrationSha256 = sha256(migration);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(migration.replaceAll("__SCHEMA__", this.schema));
      const prior = await client.query<{ migration_sha256: string }>(
        "SELECT migration_sha256 FROM schema_migrations WHERE migration_id = $1",
        ["0001_living_evidence"],
      );
      if (prior.rowCount === 0) {
        await client.query(
          "INSERT INTO schema_migrations (migration_id, migration_sha256) VALUES ($1, $2)",
          ["0001_living_evidence", migrationSha256],
        );
      } else if (prior.rows[0]!.migration_sha256 !== migrationSha256) {
        throw new Error("MIGRATION_SHA256_MISMATCH");
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async contribute(input: unknown, failureInjection?: FailureInjection): Promise<ContributionReceipt> {
    const prepared = prepareContribution(input);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      await this.setSearchPath(client);
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('askrigor:living-evidence-writer', 0))");
      const replay = await client.query<{
        version_id: string;
        payload_sha256: string;
        whole_text_sha256: string;
        whole_text_bytes: string;
      }>(
        "SELECT version_id, payload_sha256, whole_text_sha256, whole_text_bytes FROM analysis_versions WHERE idempotency_key = $1",
        [prepared.contribution.idempotencyKey],
      );
      if (replay.rowCount !== 0) {
        const row = replay.rows[0]!;
        if (row.payload_sha256 !== prepared.payloadSha256 || row.version_id !== prepared.contribution.analysis.versionId) {
          throw new Error("IDEMPOTENCY_KEY_PAYLOAD_MISMATCH");
        }
        await client.query("COMMIT");
        return this.receipt("idempotent_replay", prepared);
      }

      await this.insertProtocolsAndRun(client, prepared.contribution);
      const targets = await this.insertTargets(client, prepared.contribution);
      await this.insertAnalysis(client, prepared.contribution, targets);
      await this.insertVersion(client, prepared);
      if (failureInjection === "after_version") throw new Error("INJECTED_FAILURE_AFTER_VERSION");
      await this.insertSections(client, prepared);
      if (failureInjection === "after_sections") throw new Error("INJECTED_FAILURE_AFTER_SECTIONS");
      await this.insertStructuredAnalysis(client, prepared.contribution);
      await this.insertKnowledge(client, prepared.contribution);
      const eventId = deterministicUuid(`askrigor:repository-event:${prepared.payloadSha256}`);
      await client.query(
        `INSERT INTO repository_events
          (event_id, event_kind, run_id, analysis_id, version_id, payload_sha256, event_at, details)
         VALUES ($1, 'analysis_version_contributed', $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          eventId,
          prepared.contribution.run.runId,
          prepared.contribution.analysis.analysisId,
          prepared.contribution.analysis.versionId,
          prepared.payloadSha256,
          prepared.contribution.analysis.authoredAt,
          JSON.stringify({
            capture_status: prepared.contribution.analysis.captureStatus,
            relationship: prepared.contribution.analysis.relationship,
            raw_content_persisted: false,
          }),
        ],
      );
      const impact = prepared.contribution.knowledge?.impactJob;
      if (impact !== undefined && impact !== null) {
        await client.query(
          `INSERT INTO impact_jobs
            (job_id, triggering_event_id, source_version_id, status, affected_claim_version_ids,
             impact_receipt_sha256, failure_code)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
          [impact.jobId, eventId, prepared.contribution.source?.versionId ?? null, impact.status, JSON.stringify(impact.affectedClaimVersionIds), impact.impactReceiptSha256, impact.failureCode],
        );
      }
      await client.query("COMMIT");
      return this.receipt("inserted", prepared);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async exportAnalysis(analysisId: string): Promise<Record<string, unknown>> {
    const client = await this.pool.connect();
    try {
      await this.setSearchPath(client);
      const analysisResult = await client.query(
        `SELECT a.*, t.canonical_key, t.label AS topic_label,
                sf.source_kind, sf.identity_hash, sf.display_title
         FROM analyses a
         LEFT JOIN topics t ON t.topic_id = a.topic_id
         LEFT JOIN source_families sf ON sf.family_id = a.source_family_id
         WHERE a.analysis_id = $1`,
        [analysisId],
      );
      if (analysisResult.rowCount === 0) throw new Error("ANALYSIS_NOT_FOUND");
      const identifiers = await client.query(
        `SELECT scheme, canonical_value FROM source_identifiers
         WHERE family_id = (SELECT source_family_id FROM analyses WHERE analysis_id = $1)
         ORDER BY scheme, canonical_value`,
        [analysisId],
      );
      const versionResult = await client.query<Omit<ExportedVersion, "sections" | "domains" | "claim_capabilities" | "future_analysis_items" | "receipts">>(
        `SELECT version_id, previous_version_id, relationship, capture_status,
                authored_at::text, coverage_statement, whole_text_sha256,
                whole_text_bytes::text, payload_sha256, idempotency_key, payload_json
         FROM analysis_versions WHERE analysis_id = $1
         ORDER BY authored_at, inserted_at, version_id`,
        [analysisId],
      );
      const versions: ExportedVersion[] = [];
      for (const version of versionResult.rows) {
        const [sections, domains, claims, futureItems, receipts] = await Promise.all([
          client.query("SELECT ordinal, section_key, title, content, content_sha256, content_bytes::text FROM analysis_sections WHERE version_id = $1 ORDER BY ordinal", [version.version_id]),
          client.query("SELECT ordinal, rubric, domain, status, finding, evidence_locators, unresolved_fields, limitations FROM analysis_domain_findings WHERE version_id = $1 ORDER BY ordinal", [version.version_id]),
          client.query("SELECT ordinal, claim, capability, reason, evidence_locators FROM analysis_claim_capabilities WHERE version_id = $1 ORDER BY ordinal", [version.version_id]),
          client.query("SELECT item_id, question, rationale, priority, status, evidence_needed, resolved_by_version_id FROM future_analysis_items WHERE version_id = $1 ORDER BY inserted_at, item_id", [version.version_id]),
          client.query("SELECT receipt_id, receipt_kind, receipt_sha256, locator, details FROM analysis_receipts WHERE version_id = $1 ORDER BY receipt_kind, receipt_id", [version.version_id]),
        ]);
        const reconstructed = sections.rows.map(({ content }) => String(content)).join("");
        if (sha256(reconstructed) !== version.whole_text_sha256 || Buffer.byteLength(reconstructed, "utf8") !== Number(version.whole_text_bytes)) {
          throw new Error(`ANALYSIS_RECONSTRUCTION_MISMATCH version=${version.version_id}`);
        }
        for (const section of sections.rows) {
          if (sha256(String(section.content)) !== section.content_sha256 || Buffer.byteLength(String(section.content), "utf8") !== Number(section.content_bytes)) {
            throw new Error(`ANALYSIS_SECTION_RECONSTRUCTION_MISMATCH version=${version.version_id} ordinal=${section.ordinal}`);
          }
        }
        versions.push({
          ...version,
          sections: sections.rows as ExportedVersion["sections"],
          domains: domains.rows,
          claim_capabilities: claims.rows,
          future_analysis_items: futureItems.rows,
          receipts: receipts.rows,
        });
      }
      return {
        export_schema: "askrigor.living-evidence.analysis-export.v1",
        raw_source_content_included: false,
        analysis: analysisResult.rows[0],
        source_identifiers: identifiers.rows,
        versions,
      };
    } finally {
      client.release();
    }
  }

  async searchKnowledge(input: KnowledgeSearchInput): Promise<Record<string, unknown>> {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    const values: unknown[] = [];
    const where: string[] = [];
    const bind = (value: unknown): string => {
      values.push(value);
      return `$${values.length}`;
    };
    if (!input.includeHistorical) {
      where.push("ccp.usable = true");
      where.push(`EXISTS (
        SELECT 1
        FROM evidence_bindings current_binding
        JOIN source_versions current_source_version
          ON current_source_version.version_id = current_binding.source_version_id
        JOIN source_current_freshness current_freshness
          ON current_freshness.family_id = current_source_version.family_id
        WHERE current_binding.claim_version_id = ccp.version_id
          AND current_freshness.projection_state = 'current'
      )`);
    }
    if (input.capabilityState !== undefined) where.push(`ccp.capability_state = ${bind(input.capabilityState)}`);
    if (input.topicKey !== undefined) where.push(`t.canonical_key = ${bind(input.topicKey)}`);
    if (input.programOrExposure !== undefined) where.push(`ccp.program_or_exposure ILIKE ${bind(`%${input.programOrExposure}%`)}`);
    if (input.population !== undefined) where.push(`ccp.population ILIKE ${bind(`%${input.population}%`)}`);
    if (input.outcome !== undefined) where.push(`ccp.outcome ILIKE ${bind(`%${input.outcome}%`)}`);
    if (input.horizon !== undefined) where.push(`ccp.horizon ILIKE ${bind(`%${input.horizon}%`)}`);
    if (input.identifier !== undefined) {
      where.push(`EXISTS (
        SELECT 1 FROM evidence_bindings exact_eb
        JOIN source_versions exact_sv ON exact_sv.version_id = exact_eb.source_version_id
        JOIN source_identifiers exact_si ON exact_si.family_id = exact_sv.family_id
        WHERE exact_eb.claim_version_id = ccp.version_id
          AND exact_si.scheme = ${bind(input.identifier.scheme)}
          AND exact_si.canonical_value = ${bind(input.identifier.value)}
      )`);
    }
    let rankExpression = "0::real";
    if (input.text !== undefined && input.text.trim() !== "") {
      const query = bind(input.text.trim());
      where.push(`(
        to_tsvector('simple', ccp.normalized_assertion) @@ websearch_to_tsquery('simple', ${query})
        OR EXISTS (
          SELECT 1 FROM evidence_bindings text_eb
          JOIN source_versions text_sv ON text_sv.version_id = text_eb.source_version_id
          JOIN source_families text_sf ON text_sf.family_id = text_sv.family_id
          WHERE text_eb.claim_version_id = ccp.version_id
            AND to_tsvector('simple', text_sf.display_title) @@ websearch_to_tsquery('simple', ${query})
        )
      )`);
      rankExpression = `ts_rank(to_tsvector('simple', ccp.normalized_assertion), websearch_to_tsquery('simple', ${query}))`;
    }
    values.push(limit);
    const client = await this.pool.connect();
    try {
      await this.setSearchPath(client);
      const claimSource = input.includeHistorical
        ? `(SELECT cv.claim_id, cv.version_id, c.question_id, cv.normalized_assertion,
                   cv.capability_state, cv.status, cv.direction, cv.population,
                   cv.program_or_exposure, cv.comparator, cv.outcome, cv.horizon,
                   cv.setting,
                   (cv.status = 'current' AND NOT EXISTS (
                     SELECT 1 FROM claim_versions child
                     WHERE child.supersedes_claim_version_id = cv.version_id
                   )) AS usable
            FROM claim_versions cv JOIN claims c ON c.claim_id = cv.claim_id) ccp`
        : "claim_current_projection ccp";
      const result = await client.query(
        `SELECT ccp.*, q.normalized_question, t.canonical_key AS topic_key,
                ${rankExpression} AS text_rank,
                COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
                  'family_id', sf.family_id,
                  'source_version_id', sv.version_id,
                  'title', sf.display_title,
                  'access_status', sv.access_status,
                  'freshness_state', scf.projection_state,
                  'polarity', eb.polarity,
                  'locator', eb.locator,
                  'capability_ceiling', eb.capability_ceiling
                )) FILTER (WHERE eb.binding_id IS NOT NULL), '[]'::jsonb) AS evidence
         FROM ${claimSource}
         JOIN questions q ON q.question_id = ccp.question_id
         JOIN topics t ON t.topic_id = q.topic_id
         LEFT JOIN evidence_bindings eb ON eb.claim_version_id = ccp.version_id
         LEFT JOIN source_versions sv ON sv.version_id = eb.source_version_id
         LEFT JOIN source_families sf ON sf.family_id = sv.family_id
         LEFT JOIN source_current_freshness scf ON scf.family_id = sf.family_id
         ${where.length === 0 ? "" : `WHERE ${where.join(" AND ")}`}
         GROUP BY ccp.claim_id, ccp.version_id, ccp.question_id, ccp.normalized_assertion,
                  ccp.capability_state, ccp.status, ccp.direction, ccp.population,
                  ccp.program_or_exposure, ccp.comparator, ccp.outcome, ccp.horizon,
                  ccp.setting, ccp.usable, q.normalized_question, t.canonical_key
         ORDER BY text_rank DESC, ccp.normalized_assertion, ccp.version_id
         LIMIT $${values.length}`,
        values,
      );
      const queryReceipt = {
        query_schema: "askrigor.living-evidence.query-receipt.v1",
        generated_at: new Date().toISOString(),
        canonical_version_ids: result.rows.map(({ version_id }) => version_id),
        result_count: result.rows.length,
        request: input,
      };
      return { ...queryReceipt, query_sha256: sha256(stableJson(queryReceipt)), results: result.rows };
    } finally {
      client.release();
    }
  }

  async findAnalysisReuseCandidates(
    input: AnalysisReuseLookupInput,
  ): Promise<AnalysisReuseCandidate[]> {
    const parsed = analysisReuseLookup(input);
    const values: unknown[] = [
      parsed.identifier.scheme,
      parsed.identifier.value,
      parsed.sourceContentSha256,
      parsed.analysisKind,
    ];
    const versionFilter = parsed.analysisVersionId === undefined
      ? ""
      : `AND av.version_id = $${values.push(parsed.analysisVersionId)}`;
    values.push(parsed.limit);
    const client = await this.pool.connect();
    try {
      await this.setSearchPath(client);
      const result = await client.query<{
        analysis_id: string;
        analysis_version_id: string;
        analysis_kind: string;
        capture_status: string;
        relationship: string;
        authored_at: string;
        analysis_usable: boolean;
        source_family_id: string;
        source_version_id: string;
        source_content_sha256: string | null;
        source_access_status: string;
        source_identifiers: Array<{ scheme: string; value: string }>;
        protocol_manifest_sha256s: string[];
        freshness_state: string | null;
        freshness_checked_at: string | null;
        completed_impact_jobs: number;
        pending_impact_jobs: number;
        payload_json: LivingEvidenceContribution;
      }>(
        `SELECT
           a.analysis_id,
           av.version_id AS analysis_version_id,
           a.analysis_kind,
           av.capture_status,
           av.relationship,
           av.authored_at::text,
           acp.usable AS analysis_usable,
           sf.family_id AS source_family_id,
           sv.version_id AS source_version_id,
           sv.source_content_sha256,
           sv.access_status AS source_access_status,
           COALESCE((
             SELECT jsonb_agg(
               jsonb_build_object('scheme', all_identifiers.scheme, 'value', all_identifiers.canonical_value)
               ORDER BY all_identifiers.scheme, all_identifiers.canonical_value
             )
             FROM source_identifiers all_identifiers
             WHERE all_identifiers.family_id = sf.family_id
           ), '[]'::jsonb) AS source_identifiers,
           rr.protocol_manifest_sha256s,
           scf.projection_state AS freshness_state,
           scf.checked_at::text AS freshness_checked_at,
           (
             SELECT count(*)::integer
             FROM impact_jobs completed_source_impact
             WHERE completed_source_impact.source_version_id = sv.version_id
               AND completed_source_impact.status = 'complete'
           ) AS completed_impact_jobs,
           (
             SELECT count(*)::integer
             FROM impact_jobs source_impact
             WHERE source_impact.source_version_id = sv.version_id
               AND source_impact.status <> 'complete'
           ) AS pending_impact_jobs,
           av.payload_json
         FROM source_identifiers matched_identifier
         JOIN source_families sf ON sf.family_id = matched_identifier.family_id
         JOIN source_versions sv ON sv.family_id = sf.family_id
         JOIN analyses a ON a.source_family_id = sf.family_id
         JOIN analysis_versions av
           ON av.analysis_id = a.analysis_id
          AND av.source_version_id = sv.version_id
         JOIN analysis_current_projection acp ON acp.version_id = av.version_id
         JOIN research_runs rr ON rr.run_id = av.run_id
         LEFT JOIN source_current_freshness scf ON scf.family_id = sf.family_id
         WHERE matched_identifier.scheme = $1
           AND matched_identifier.canonical_value = $2
           AND sv.source_content_sha256 = $3
           AND a.analysis_kind = $4
           ${versionFilter}
         ORDER BY av.authored_at DESC, av.inserted_at DESC, av.version_id DESC
         LIMIT $${values.length}`,
        values,
      );
      return result.rows.map((row) => ({
        analysisId: row.analysis_id,
        analysisVersionId: row.analysis_version_id,
        analysisKind: row.analysis_kind,
        captureStatus: row.capture_status,
        relationship: row.relationship,
        authoredAt: row.authored_at,
        analysisUsable: row.analysis_usable,
        sourceFamilyId: row.source_family_id,
        sourceVersionId: row.source_version_id,
        sourceContentSha256: row.source_content_sha256,
        sourceAccessStatus: row.source_access_status,
        sourceIdentifiers: row.source_identifiers,
        protocolManifestSha256s: row.protocol_manifest_sha256s,
        freshnessState: row.freshness_state,
        freshnessCheckedAt: row.freshness_checked_at,
        completedImpactJobs: row.completed_impact_jobs,
        pendingImpactJobs: row.pending_impact_jobs,
        payload: row.payload_json,
      }));
    } finally {
      client.release();
    }
  }

  async getTopicGraph(topicId: string, maximumDepth = 8): Promise<Record<string, unknown>> {
    if (!Number.isInteger(maximumDepth) || maximumDepth < 0 || maximumDepth > 32) throw new Error("INVALID_TOPIC_GRAPH_DEPTH");
    const client = await this.pool.connect();
    try {
      await this.setSearchPath(client);
      const result = await client.query(
        `WITH RECURSIVE graph(topic_id, path, depth) AS (
           SELECT $1::uuid, ARRAY[$1::uuid], 0
           UNION ALL
           SELECT CASE WHEN te.from_topic_id = graph.topic_id THEN te.to_topic_id ELSE te.from_topic_id END,
                  graph.path || CASE WHEN te.from_topic_id = graph.topic_id THEN te.to_topic_id ELSE te.from_topic_id END,
                  graph.depth + 1
           FROM graph
           JOIN topic_edges te ON te.from_topic_id = graph.topic_id OR te.to_topic_id = graph.topic_id
           WHERE graph.depth < $2
             AND NOT (CASE WHEN te.from_topic_id = graph.topic_id THEN te.to_topic_id ELSE te.from_topic_id END = ANY(graph.path))
         )
         SELECT DISTINCT t.topic_id, t.canonical_key, t.label, min(graph.depth)::integer AS depth
         FROM graph JOIN topics t ON t.topic_id = graph.topic_id
         GROUP BY t.topic_id, t.canonical_key, t.label
         ORDER BY depth, t.canonical_key`,
        [topicId, maximumDepth],
      );
      return { root_topic_id: topicId, maximum_depth: maximumDepth, topics: result.rows };
    } finally {
      client.release();
    }
  }

  async rankAssessmentsForQuestion(questionId: string): Promise<Record<string, unknown>> {
    const client = await this.pool.connect();
    try {
      await this.setSearchPath(client);
      const result = await client.query(
        `SELECT a.assessment_id, a.version_id AS assessment_version_id,
                sf.family_id AS source_family_id, sf.display_title, sf.source_kind,
                a.rubric, a.rubric_version, a.internal_validity_status,
                a.internal_validity_reason, a.applicability_status,
                a.applicability_reason, a.disagreement_state,
                scf.projection_state AS freshness_state,
                count(adf.*) FILTER (WHERE adf.status = 'limitation_identified')::integer AS limitation_count,
                count(adf.*) FILTER (WHERE adf.status = 'unclear')::integer AS unclear_count,
                jsonb_agg(jsonb_build_object(
                  'domain', adf.domain, 'status', adf.status, 'finding', adf.finding,
                  'unresolved_fields', adf.unresolved_fields, 'limitations', adf.limitations
                ) ORDER BY adf.ordinal) FILTER (WHERE adf.domain IS NOT NULL) AS domains
         FROM assessments a
         JOIN source_versions sv ON sv.version_id = a.source_version_id
         JOIN source_families sf ON sf.family_id = sv.family_id
         LEFT JOIN analysis_versions av ON av.version_id = a.analysis_version_id
         LEFT JOIN analysis_domain_findings adf ON adf.version_id = av.version_id
         LEFT JOIN source_current_freshness scf ON scf.family_id = sf.family_id
         WHERE NOT EXISTS (
           SELECT 1 FROM assessments later_assessment
           WHERE later_assessment.supersedes_assessment_version_id = a.version_id
         )
           AND EXISTS (
             SELECT 1
             FROM evidence_bindings question_binding
             JOIN claim_current_projection current_claim
               ON current_claim.version_id = question_binding.claim_version_id
              AND current_claim.usable = true
             JOIN claims question_claim
               ON question_claim.claim_id = current_claim.claim_id
              AND question_claim.question_id = $1
             WHERE question_binding.source_version_id = sv.version_id
           )
         GROUP BY a.assessment_id, a.version_id, sf.family_id, sf.display_title, sf.source_kind,
                  a.rubric, a.rubric_version, a.internal_validity_status,
                  a.internal_validity_reason, a.applicability_status,
                  a.applicability_reason, a.disagreement_state, scf.projection_state
         ORDER BY
           CASE a.applicability_status WHEN 'adequate' THEN 0 WHEN 'limitation_identified' THEN 1 WHEN 'unclear' THEN 2 ELSE 3 END,
           CASE a.internal_validity_status WHEN 'adequate' THEN 0 WHEN 'limitation_identified' THEN 1 WHEN 'unclear' THEN 2 ELSE 3 END,
           count(adf.*) FILTER (WHERE adf.status = 'limitation_identified'),
           count(adf.*) FILTER (WHERE adf.status = 'unclear'),
           sf.display_title`,
        [questionId],
      );
      const orderingKeys = ["question applicability", "internal-validity profile", "domain limitations", "unclear domains", "title tie-break"];
      const receipt = {
        ranking_schema: "askrigor.living-evidence.transparent-ranking.v1",
        question_id: questionId,
        ordering_keys: orderingKeys,
        no_composite_score: true,
        unresolved_ties_preserved: true,
        assessment_version_ids: result.rows.map(({ assessment_version_id }) => assessment_version_id),
      };
      return { ...receipt, ranking_sha256: sha256(stableJson(receipt)), results: result.rows };
    } finally {
      client.release();
    }
  }

  async exportRepository(): Promise<Record<string, unknown>> {
    const tables = [
      "protocol_manifests", "research_runs", "topics", "topic_aliases", "topic_edges", "questions",
      "source_families", "source_identifiers", "source_versions", "source_edges", "claims", "claim_versions",
      "claim_edges", "analyses", "analysis_versions", "analysis_sections", "analysis_domain_findings",
      "analysis_claim_capabilities", "future_analysis_items", "analysis_receipts", "assessments",
      "evidence_bindings", "freshness_policies", "freshness_checks", "repository_events", "impact_jobs",
    ] as const;
    const client = await this.pool.connect();
    try {
      await this.setSearchPath(client);
      const records: Record<string, Array<Record<string, unknown>>> = {};
      for (const table of tables) {
        const result = await client.query<Record<string, unknown>>(`SELECT * FROM ${table} ORDER BY inserted_at, 1`);
        records[table] = result.rows;
      }
      const inventory = Object.fromEntries(Object.entries(records).map(([table, rows]) => [table, rows.length]));
      const canonicalRecords = Object.fromEntries(Object.entries(records).map(([table, rows]) => [
        table,
        rows
          .map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "inserted_at" && key !== "applied_at")))
          .sort((left, right) => stableJson(left).localeCompare(stableJson(right))),
      ]));
      const canonical = {
        export_schema: "askrigor.living-evidence.repository-export.v1",
        raw_source_content_included: false,
        inventory,
        records: canonicalRecords,
      };
      return { ...canonical, canonical_sha256: sha256(stableJson(canonical)) };
    } finally {
      client.release();
    }
  }

  async countRows(table: "analysis_versions" | "analysis_sections" | "repository_events"): Promise<number> {
    const client = await this.pool.connect();
    try {
      await this.setSearchPath(client);
      const result = await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${table}`);
      return Number(result.rows[0]!.count);
    } finally {
      client.release();
    }
  }

  async getCurrentProjection(analysisId: string): Promise<{
    versionId: string;
    relationship: string;
    captureStatus: string;
    usable: boolean;
  }> {
    const client = await this.pool.connect();
    try {
      await this.setSearchPath(client);
      const result = await client.query<{
        version_id: string;
        relationship: string;
        capture_status: string;
        usable: boolean;
      }>(
        "SELECT version_id, relationship, capture_status, usable FROM analysis_current_projection WHERE analysis_id = $1",
        [analysisId],
      );
      if (result.rowCount === 0) throw new Error("ANALYSIS_NOT_FOUND");
      const row = result.rows[0]!;
      return {
        versionId: row.version_id,
        relationship: row.relationship,
        captureStatus: row.capture_status,
        usable: row.usable,
      };
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async setSearchPath(client: PoolClient): Promise<void> {
    await client.query(`SET search_path TO ${this.schema}, public`);
  }

  private receipt(status: ContributionReceipt["status"], prepared: PreparedContribution): ContributionReceipt {
    return {
      status,
      analysisId: prepared.contribution.analysis.analysisId,
      versionId: prepared.contribution.analysis.versionId,
      payloadSha256: prepared.payloadSha256,
      wholeTextSha256: prepared.wholeTextSha256,
      wholeTextBytes: prepared.wholeTextBytes,
      sectionCount: prepared.contribution.analysis.sections.length,
    };
  }

  private async insertProtocolsAndRun(client: PoolClient, contribution: LivingEvidenceContribution): Promise<void> {
    for (const manifest of contribution.run.protocolManifests) {
      await client.query(
        `INSERT INTO protocol_manifests (sha256, name, version, revision_date)
         VALUES ($1, $2, $3, $4) ON CONFLICT (sha256) DO NOTHING`,
        [manifest.sha256, manifest.name, manifest.version, manifest.revisionDate],
      );
      const stored = await client.query<{ name: string; version: string; revision_date: string }>(
        "SELECT name, version, revision_date::text FROM protocol_manifests WHERE sha256 = $1",
        [manifest.sha256],
      );
      const row = stored.rows[0];
      if (!row || row.name !== manifest.name || row.version !== manifest.version || row.revision_date !== manifest.revisionDate) {
        throw new Error("PROTOCOL_MANIFEST_CONFLICT");
      }
    }
    await client.query(
      `INSERT INTO research_runs
        (run_id, run_kind, started_at, completed_at, protocol_manifest_sha256s, provenance_note)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6) ON CONFLICT (run_id) DO NOTHING`,
      [
        contribution.run.runId,
        contribution.run.runKind,
        contribution.run.startedAt,
        contribution.run.completedAt,
        JSON.stringify(contribution.run.protocolManifests.map(({ sha256: digest }) => digest)),
        contribution.run.provenanceNote,
      ],
    );
    const storedRun = await client.query<{
      run_kind: string;
      started_at: Date;
      completed_at: Date;
      protocol_manifest_sha256s: string[];
      provenance_note: string;
    }>(
      `SELECT run_kind, started_at, completed_at, protocol_manifest_sha256s, provenance_note
       FROM research_runs WHERE run_id = $1`,
      [contribution.run.runId],
    );
    const run = storedRun.rows[0];
    if (
      !run ||
      run.run_kind !== contribution.run.runKind ||
      run.started_at.toISOString() !== contribution.run.startedAt ||
      run.completed_at.toISOString() !== contribution.run.completedAt ||
      JSON.stringify(run.protocol_manifest_sha256s) !== JSON.stringify(contribution.run.protocolManifests.map(({ sha256: digest }) => digest)) ||
      run.provenance_note !== contribution.run.provenanceNote
    ) {
      throw new Error("RESEARCH_RUN_CONFLICT");
    }
  }

  private async insertTargets(client: PoolClient, contribution: LivingEvidenceContribution): Promise<{ topicId: string | null; sourceFamilyId: string | null; sourceVersionId: string | null }> {
    if (contribution.topic !== null) {
      await client.query(
        "INSERT INTO topics (topic_id, canonical_key, label) VALUES ($1, $2, $3) ON CONFLICT (topic_id) DO NOTHING",
        [contribution.topic.topicId, contribution.topic.canonicalKey, contribution.topic.label],
      );
      const storedTopic = await client.query<{ canonical_key: string; label: string }>(
        "SELECT canonical_key, label FROM topics WHERE topic_id = $1",
        [contribution.topic.topicId],
      );
      if (storedTopic.rows[0]?.canonical_key !== contribution.topic.canonicalKey || storedTopic.rows[0]?.label !== contribution.topic.label) {
        throw new Error("TOPIC_ID_CONFLICT");
      }
    }
    if (contribution.source !== null) {
      const source = contribution.source;
      await client.query(
        `INSERT INTO source_families (family_id, source_kind, identity_hash, display_title)
         VALUES ($1, $2, $3, $4) ON CONFLICT (family_id) DO NOTHING`,
        [source.familyId, source.sourceKind, source.identityHash, source.displayTitle],
      );
      const storedFamily = await client.query<{ source_kind: string; identity_hash: string; display_title: string }>(
        "SELECT source_kind, identity_hash, display_title FROM source_families WHERE family_id = $1",
        [source.familyId],
      );
      const family = storedFamily.rows[0];
      if (!family || family.source_kind !== source.sourceKind || family.identity_hash !== source.identityHash || family.display_title !== source.displayTitle) {
        throw new Error("SOURCE_FAMILY_ID_CONFLICT");
      }
      for (const identifier of source.identifiers) {
        await client.query(
          `INSERT INTO source_identifiers (family_id, scheme, canonical_value)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [source.familyId, identifier.scheme, identifier.value],
        );
        const storedIdentifier = await client.query<{ family_id: string }>(
          "SELECT family_id FROM source_identifiers WHERE scheme = $1 AND canonical_value = $2",
          [identifier.scheme, identifier.value],
        );
        if (storedIdentifier.rows[0]?.family_id !== source.familyId) {
          throw new Error("SOURCE_IDENTIFIER_CONFLICT");
        }
      }
      await client.query(
        `INSERT INTO source_versions
          (version_id, family_id, source_content_sha256, access_status, retrieved_at, source_locator, raw_content_persisted)
         VALUES ($1, $2, $3, $4, $5, $6, false) ON CONFLICT (version_id) DO NOTHING`,
        [source.versionId, source.familyId, source.sourceContentSha256, source.accessStatus, source.retrievedAt, source.sourceLocator],
      );
      const storedVersion = await client.query<{
        family_id: string;
        source_content_sha256: string | null;
        access_status: string;
        retrieved_at: Date | null;
        source_locator: string | null;
        raw_content_persisted: boolean;
      }>(
        `SELECT family_id, source_content_sha256, access_status, retrieved_at, source_locator, raw_content_persisted
         FROM source_versions WHERE version_id = $1`,
        [source.versionId],
      );
      const version = storedVersion.rows[0];
      if (
        !version ||
        version.family_id !== source.familyId ||
        version.source_content_sha256 !== source.sourceContentSha256 ||
        version.access_status !== source.accessStatus ||
        (version.retrieved_at?.toISOString() ?? null) !== source.retrievedAt ||
        version.source_locator !== source.sourceLocator ||
        version.raw_content_persisted
      ) {
        throw new Error("SOURCE_VERSION_ID_CONFLICT");
      }
    }
    return {
      topicId: contribution.topic?.topicId ?? null,
      sourceFamilyId: contribution.source?.familyId ?? null,
      sourceVersionId: contribution.source?.versionId ?? null,
    };
  }

  private async insertAnalysis(client: PoolClient, contribution: LivingEvidenceContribution, targets: { topicId: string | null; sourceFamilyId: string | null }): Promise<void> {
    const prior = await client.query<{ topic_id: string | null; source_family_id: string | null }>(
      "SELECT topic_id, source_family_id FROM analyses WHERE analysis_id = $1",
      [contribution.analysis.analysisId],
    );
    if (prior.rowCount === 0) {
      if (contribution.analysis.relationship !== "initial") throw new Error("ANALYSIS_INITIAL_VERSION_REQUIRED");
      await client.query(
        "INSERT INTO analyses (analysis_id, analysis_kind, topic_id, source_family_id) VALUES ($1, $2, $3, $4)",
        [contribution.analysis.analysisId, contribution.analysis.analysisKind, targets.topicId, targets.sourceFamilyId],
      );
    } else {
      const row = prior.rows[0]!;
      if (contribution.analysis.relationship === "initial") {
        throw new Error("ANALYSIS_ALREADY_HAS_INITIAL_VERSION");
      }
      if (row.topic_id !== targets.topicId || row.source_family_id !== targets.sourceFamilyId) {
        throw new Error("ANALYSIS_TARGET_MISMATCH");
      }
    }
  }

  private async insertVersion(client: PoolClient, prepared: PreparedContribution): Promise<void> {
    const { contribution } = prepared;
    await client.query(
      `INSERT INTO analysis_versions
        (version_id, analysis_id, run_id, source_version_id, previous_version_id,
         relationship, capture_status, authored_at, coverage_statement,
         whole_text_sha256, whole_text_bytes, payload_sha256, idempotency_key, payload_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)`,
      [
        contribution.analysis.versionId,
        contribution.analysis.analysisId,
        contribution.run.runId,
        contribution.source?.versionId ?? null,
        contribution.analysis.previousVersionId,
        contribution.analysis.relationship,
        contribution.analysis.captureStatus,
        contribution.analysis.authoredAt,
        contribution.analysis.coverageStatement,
        prepared.wholeTextSha256,
        prepared.wholeTextBytes,
        prepared.payloadSha256,
        contribution.idempotencyKey,
        JSON.stringify(contribution),
      ],
    );
  }

  private async insertSections(client: PoolClient, prepared: PreparedContribution): Promise<void> {
    for (const section of prepared.contribution.analysis.sections) {
      const digest = prepared.sectionDigests[section.ordinal]!;
      await client.query(
        `INSERT INTO analysis_sections
          (version_id, ordinal, section_key, title, content, content_sha256, content_bytes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [prepared.contribution.analysis.versionId, section.ordinal, section.sectionKey, section.title, section.content, digest.sha256, digest.bytes],
      );
    }
  }

  private async insertStructuredAnalysis(client: PoolClient, contribution: LivingEvidenceContribution): Promise<void> {
    const versionId = contribution.analysis.versionId;
    for (const domain of contribution.analysis.domains) {
      await client.query(
        `INSERT INTO analysis_domain_findings
          (version_id, ordinal, rubric, domain, status, finding, evidence_locators, unresolved_fields, limitations)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb)`,
        [versionId, domain.ordinal, domain.rubric, domain.domain, domain.status, domain.finding, JSON.stringify(domain.evidenceLocators), JSON.stringify(domain.unresolvedFields), JSON.stringify(domain.limitations)],
      );
    }
    for (const claim of contribution.analysis.claimCapabilities) {
      await client.query(
        `INSERT INTO analysis_claim_capabilities
          (version_id, ordinal, claim, capability, reason, evidence_locators)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [versionId, claim.ordinal, claim.claim, claim.capability, claim.reason, JSON.stringify(claim.evidenceLocators)],
      );
    }
    for (const item of contribution.analysis.futureAnalysisItems) {
      await client.query(
        `INSERT INTO future_analysis_items
          (item_id, version_id, question, rationale, priority, status, evidence_needed, resolved_by_version_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
        [item.itemId, versionId, item.question, item.rationale, item.priority, item.status, JSON.stringify(item.evidenceNeeded), item.resolvedByVersionId],
      );
    }
    for (const receipt of contribution.receipts) {
      await client.query(
        `INSERT INTO analysis_receipts
          (receipt_id, version_id, receipt_kind, receipt_sha256, locator, details)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [receipt.receiptId, versionId, receipt.receiptKind, receipt.receiptSha256, receipt.locator, JSON.stringify(receipt.details)],
      );
    }
  }

  private async insertKnowledge(client: PoolClient, contribution: LivingEvidenceContribution): Promise<void> {
    const knowledge = contribution.knowledge;
    if (knowledge === undefined) return;
    if (knowledge.question !== null) {
      if (contribution.topic === null) throw new Error("KNOWLEDGE_QUESTION_TOPIC_REQUIRED");
      const question = knowledge.question;
      await client.query(
        `INSERT INTO questions
          (question_id, topic_id, normalized_question, population, program_or_exposure, comparator, outcome, horizon, setting, created_by_run_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (question_id) DO NOTHING`,
        [question.questionId, contribution.topic.topicId, question.normalizedQuestion, question.dimensions.population, question.dimensions.programOrExposure, question.dimensions.comparator, question.dimensions.outcome, question.dimensions.horizon, question.dimensions.setting, contribution.run.runId],
      );
      const stored = await client.query<{
        topic_id: string;
        normalized_question: string;
        population: string | null;
        program_or_exposure: string | null;
        comparator: string | null;
        outcome: string | null;
        horizon: string | null;
        setting: string | null;
      }>(
        `SELECT topic_id, normalized_question, population, program_or_exposure,
                comparator, outcome, horizon, setting
         FROM questions WHERE question_id = $1`,
        [question.questionId],
      );
      const row = stored.rows[0];
      const dimensions = question.dimensions;
      if (
        row?.topic_id !== contribution.topic.topicId ||
        row.normalized_question !== question.normalizedQuestion ||
        row.population !== dimensions.population ||
        row.program_or_exposure !== dimensions.programOrExposure ||
        row.comparator !== dimensions.comparator ||
        row.outcome !== dimensions.outcome ||
        row.horizon !== dimensions.horizon ||
        row.setting !== dimensions.setting
      ) {
        throw new Error("QUESTION_ID_CONFLICT");
      }
    }
    for (const edge of knowledge.topicEdges) {
      await client.query(
        `INSERT INTO topic_edges (edge_id, from_topic_id, to_topic_id, relation, run_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [edge.edgeId, edge.fromTopicId, edge.toTopicId, edge.relation, contribution.run.runId],
      );
    }
    for (const claim of knowledge.claims) {
      const existing = await client.query<{ question_id: string; claim_type: string }>(
        "SELECT question_id, claim_type FROM claims WHERE claim_id = $1",
        [claim.claimId],
      );
      if (existing.rowCount === 0) {
        if (claim.supersedesClaimVersionId !== null) throw new Error("CLAIM_INITIAL_VERSION_REQUIRED");
        await client.query(
          "INSERT INTO claims (claim_id, question_id, claim_type) VALUES ($1, $2, $3)",
          [claim.claimId, claim.questionId, claim.claimType],
        );
      } else {
        if (claim.supersedesClaimVersionId === null) throw new Error("CLAIM_ALREADY_HAS_INITIAL_VERSION");
        if (existing.rows[0]!.question_id !== claim.questionId || existing.rows[0]!.claim_type !== claim.claimType) throw new Error("CLAIM_ID_CONFLICT");
      }
      const dimensions = claim.dimensions;
      await client.query(
        `INSERT INTO claim_versions
          (version_id, claim_id, created_by_run_id, normalized_assertion, population, program_or_exposure,
           comparator, outcome, horizon, setting, direction, inference_type, capability_state,
           uncertainty_and_limitations, status, supersedes_claim_version_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $16)`,
        [claim.versionId, claim.claimId, contribution.run.runId, claim.normalizedAssertion, dimensions.population, dimensions.programOrExposure, dimensions.comparator, dimensions.outcome, dimensions.horizon, dimensions.setting, claim.direction, claim.inferenceType, claim.capabilityState, JSON.stringify(claim.uncertaintyAndLimitations), claim.status, claim.supersedesClaimVersionId],
      );
    }
    for (const edge of knowledge.sourceEdges) {
      await client.query(
        `INSERT INTO source_edges
          (edge_id, from_source_version_id, to_source_version_id, relation, confidence, uncertainty, supersedes_edge_id, created_by_run_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [edge.edgeId, edge.fromSourceVersionId, edge.toSourceVersionId, edge.relation, edge.confidence, edge.uncertainty, edge.supersedesEdgeId, contribution.run.runId],
      );
    }
    for (const edge of knowledge.claimEdges) {
      await client.query(
        `INSERT INTO claim_edges
          (edge_id, from_claim_version_id, to_claim_version_id, relation, confidence, uncertainty, supersedes_edge_id, created_by_run_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [edge.edgeId, edge.fromClaimVersionId, edge.toClaimVersionId, edge.relation, edge.confidence, edge.uncertainty, edge.supersedesEdgeId, contribution.run.runId],
      );
    }
    if (knowledge.assessment !== null) {
      if (contribution.source === null) throw new Error("ASSESSMENT_SOURCE_REQUIRED");
      const assessment = knowledge.assessment;
      await client.query(
        `INSERT INTO assessments
          (assessment_id, version_id, analysis_version_id, source_version_id, rubric, rubric_version,
           assessor_type, assessor_identifier, internal_validity_status, internal_validity_reason,
           applicability_status, applicability_reason, disagreement_state,
           supersedes_assessment_version_id, created_by_run_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [assessment.assessmentId, assessment.versionId, contribution.analysis.versionId, contribution.source.versionId, assessment.rubric, assessment.rubricVersion, assessment.assessorType, assessment.assessorIdentifier, assessment.internalValidity.status, assessment.internalValidity.reason, assessment.applicability.status, assessment.applicability.reason, assessment.disagreementState, assessment.supersedesAssessmentVersionId, contribution.run.runId],
      );
    }
    for (const binding of knowledge.evidenceBindings) {
      await client.query(
        `INSERT INTO evidence_bindings
          (binding_id, claim_version_id, source_version_id, locator, polarity, extraction_type,
           capability_ceiling, validation_receipt_id, limitations, created_by_run_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)`,
        [binding.bindingId, binding.claimVersionId, binding.sourceVersionId, binding.locator, binding.polarity, binding.extractionType, binding.capabilityCeiling, binding.validationReceiptId, JSON.stringify(binding.limitations), contribution.run.runId],
      );
    }
    if (knowledge.freshnessPolicy !== null) {
      if (contribution.source === null) throw new Error("FRESHNESS_SOURCE_REQUIRED");
      const policy = knowledge.freshnessPolicy;
      await client.query(
        `INSERT INTO freshness_policies
          (policy_id, source_family_id, source_class, cadence_days, maximum_age_days, owner_role, required_checks, failure_behavior)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8) ON CONFLICT (policy_id) DO NOTHING`,
        [policy.policyId, contribution.source.familyId, policy.sourceClass, policy.cadenceDays, policy.maximumAgeDays, policy.ownerRole, JSON.stringify(policy.requiredChecks), policy.failureBehavior],
      );
      const storedPolicy = await client.query<{
        source_family_id: string;
        source_class: string;
        cadence_days: number;
        maximum_age_days: number;
        owner_role: string;
        required_checks: string[];
        failure_behavior: string;
      }>(
        `SELECT source_family_id, source_class, cadence_days, maximum_age_days,
                owner_role, required_checks, failure_behavior
         FROM freshness_policies WHERE policy_id = $1`,
        [policy.policyId],
      );
      const row = storedPolicy.rows[0];
      if (
        row?.source_family_id !== contribution.source.familyId ||
        row.source_class !== policy.sourceClass ||
        row.cadence_days !== policy.cadenceDays ||
        row.maximum_age_days !== policy.maximumAgeDays ||
        row.owner_role !== policy.ownerRole ||
        JSON.stringify(row.required_checks) !== JSON.stringify(policy.requiredChecks) ||
        row.failure_behavior !== policy.failureBehavior
      ) {
        throw new Error("FRESHNESS_POLICY_ID_CONFLICT");
      }
    }
    for (const check of knowledge.freshnessChecks) {
      await client.query(
        `INSERT INTO freshness_checks
          (check_id, policy_id, checked_at, outcome, projection_state, next_due_at, receipt_sha256, limitations)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
        [check.checkId, check.policyId, check.checkedAt, check.outcome, check.projectionState, check.nextDueAt, check.receiptSha256, JSON.stringify(check.limitations)],
      );
    }
  }
}

function analysisReuseLookup(input: AnalysisReuseLookupInput): Required<Omit<AnalysisReuseLookupInput, "analysisVersionId">> & Pick<AnalysisReuseLookupInput, "analysisVersionId"> {
  if (!/^[a-f0-9]{64}$/u.test(input.sourceContentSha256)) {
    throw new Error("INVALID_REUSE_SOURCE_SHA256");
  }
  const value = input.identifier.value.trim();
  if (value.length === 0 || value.length > 2_048) {
    throw new Error("INVALID_REUSE_SOURCE_IDENTIFIER");
  }
  if (input.analysisVersionId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(input.analysisVersionId)) {
    throw new Error("INVALID_REUSE_ANALYSIS_VERSION_ID");
  }
  const limit = Math.min(Math.max(input.limit ?? 4, 1), 10);
  return { ...input, identifier: { ...input.identifier, value }, limit };
}
