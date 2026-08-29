import { PostgresEvidenceRepository, deterministicUuid, prepareContribution, sha256, stableJson, type LivingEvidenceContribution } from "../packages/evidence-repository/src/index.js";
import {
  STUDY_METHOD_AUDIT_DOMAINS,
  createValidatedStudyAuditContribution,
  resolveStudyAuditReuse,
  validateStudyMethodAudit,
  type StudyMethodAuditSubmission,
} from "../apps/research-mcp/src/index.js";
import type { ProtocolManifest } from "../packages/protocol/src/index.js";
import type { AuditableDocumentIndex } from "../packages/sources/src/index.js";
import { Pool } from "pg";

const CURRENT_PROTOCOLS: ProtocolManifest[] = [
  { name: "AskRigor Universal", version: "20.5.15", revisionDate: "2026-08-24", sha256: "69c5186862ade61d6a97dc842b8c027324c7e2f3fd7147064a360049e0d25172" },
  { name: "AskRigor HRP", version: "20.5.23", revisionDate: "2026-08-24", sha256: "bf2adc1c4daea8241c47b2a111d4a19e6bf7427a6401ecf1b3ba75a58e046299" },
];

function fixture(namespace: string): LivingEvidenceContribution {
  const text = `# Complete performed analysis\n\n${"lossless-analysis-content ".repeat(6_000)}\n`;
  const sourceIdentifier = `10.1234/acceptance.${sha256(namespace).slice(0, 16)}`;
  const sourceIdentifiers = [{ scheme: "doi" as const, value: sourceIdentifier }];
  return {
    schemaVersion: 1,
    idempotencyKey: `acceptance:${namespace}:initial`,
    run: {
      runId: deterministicUuid(`${namespace}:run:initial`),
      runKind: "live_research",
      startedAt: "2026-08-29T12:00:00.000Z",
      completedAt: "2026-08-29T12:01:00.000Z",
      protocolManifests: [
        { name: "AskRigor Universal", version: "20.5.15", revisionDate: "2026-08-24", sha256: "69c5186862ade61d6a97dc842b8c027324c7e2f3fd7147064a360049e0d25172" },
        { name: "AskRigor HRP", version: "20.5.23", revisionDate: "2026-08-24", sha256: "bf2adc1c4daea8241c47b2a111d4a19e6bf7427a6401ecf1b3ba75a58e046299" },
      ],
      provenanceNote: "Synthetic, non-health acceptance record for transactional and lossless-storage verification.",
    },
    topic: {
      topicId: deterministicUuid(`${namespace}:topic`),
      canonicalKey: `acceptance.${namespace.replaceAll(":", ".")}`,
      label: "Living-evidence acceptance fixture",
    },
    source: {
      familyId: deterministicUuid(`${namespace}:source-family`),
      versionId: deterministicUuid(`${namespace}:source-version`),
      sourceKind: "study",
      identityHash: sha256(stableJson(sourceIdentifiers)),
      displayTitle: "Synthetic acceptance study",
      identifiers: sourceIdentifiers,
      sourceContentSha256: sha256("synthetic source bytes not persisted"),
      accessStatus: "complete",
      retrievedAt: "2026-08-29T11:59:00.000Z",
      sourceLocator: `doi:${sourceIdentifier}`,
      rawContentPersisted: false,
    },
    analysis: {
      analysisId: deterministicUuid(`${namespace}:analysis`),
      versionId: deterministicUuid(`${namespace}:version:initial`),
      analysisKind: "study_method_audit",
      relationship: "initial",
      previousVersionId: null,
      captureStatus: "complete_performed_analysis",
      authoredAt: "2026-08-29T12:01:00.000Z",
      coverageStatement: "The complete synthetic analysis performed for this acceptance case is retained without truncation.",
      declaredWholeTextSha256: sha256(text),
      sections: [
        { ordinal: 0, sectionKey: "000-complete-analysis", title: "Complete performed analysis", content: text },
      ],
      domains: [
        {
          ordinal: 0,
          rubric: "study_method_v1",
          domain: "source_identity_and_version",
          status: "adequate",
          finding: "The synthetic source identity and version hash are explicit.",
          evidenceLocators: [`doi:${sourceIdentifier}`],
          unresolvedFields: [],
          limitations: ["Synthetic acceptance data cannot support a health conclusion."],
        },
      ],
      claimCapabilities: [
        {
          ordinal: 0,
          claim: "The persistence implementation retains all submitted analysis bytes.",
          capability: "can_support",
          reason: "The export reconstruction is checked against declared byte counts and SHA-256 digests.",
          evidenceLocators: ["acceptance:lossless-reconstruction"],
        },
      ],
      futureAnalysisItems: [
        {
          itemId: deterministicUuid(`${namespace}:future:item`),
          question: "Can a later clarification be appended without overwriting the original?",
          rationale: "Version lineage is a required acceptance property.",
          priority: "high",
          status: "open",
          evidenceNeeded: ["appended clarification version", "unchanged initial version digest"],
          resolvedByVersionId: null,
        },
      ],
    },
    receipts: [
      {
        receiptId: deterministicUuid(`${namespace}:receipt`),
        receiptKind: "synthetic_acceptance",
        receiptSha256: sha256("synthetic acceptance receipt"),
        locator: null,
        details: { synthetic: true, source_body_included: false },
      },
    ],
  };
}

function pendingImpactFixture(namespace: string): LivingEvidenceContribution {
  const contribution = fixture(namespace);
  const questionId = deterministicUuid(`${namespace}:question`);
  const claimId = deterministicUuid(`${namespace}:claim`);
  const claimVersionId = deterministicUuid(`${namespace}:claim-version`);
  const policyId = deterministicUuid(`${namespace}:freshness-policy`);
  contribution.knowledge = {
    question: {
      questionId,
      normalizedQuestion: "Does the synthetic acceptance intervention have a current evidence record?",
      dimensions: {
        population: "synthetic acceptance population",
        programOrExposure: "synthetic acceptance intervention",
        comparator: "synthetic comparator",
        outcome: "synthetic outcome",
        horizon: "synthetic horizon",
        setting: "synthetic setting",
      },
    },
    topicEdges: [],
    claims: [{
      claimId,
      versionId: claimVersionId,
      questionId,
      normalizedAssertion: "The synthetic claim must not be current while its impact job is pending.",
      claimType: "method",
      dimensions: {
        population: "synthetic acceptance population",
        programOrExposure: "synthetic acceptance intervention",
        comparator: "synthetic comparator",
        outcome: "synthetic outcome",
        horizon: "synthetic horizon",
        setting: "synthetic setting",
      },
      direction: "descriptive",
      inferenceType: "methodological",
      capabilityState: "uncertain",
      uncertaintyAndLimitations: ["Synthetic acceptance fixture."],
      status: "current",
      supersedesClaimVersionId: null,
    }],
    evidenceBindings: [{
      bindingId: deterministicUuid(`${namespace}:evidence-binding`),
      claimVersionId,
      sourceVersionId: contribution.source!.versionId,
      locator: "acceptance:pending-impact",
      polarity: "qualifies",
      extractionType: "source_bound_audit",
      capabilityCeiling: "uncertain",
      validationReceiptId: contribution.receipts[0]!.receiptId,
      limitations: ["Synthetic acceptance fixture."],
    }],
    sourceEdges: [],
    claimEdges: [],
    assessment: null,
    freshnessPolicy: {
      policyId,
      sourceClass: "study",
      cadenceDays: 30,
      maximumAgeDays: 30,
      ownerRole: "refresh_worker",
      requiredChecks: ["synthetic freshness check"],
      failureBehavior: "block_current_projection",
    },
    freshnessChecks: [{
      checkId: deterministicUuid(`${namespace}:freshness-check`),
      policyId,
      checkedAt: "2026-08-29T12:00:00.000Z",
      outcome: "current",
      projectionState: "current",
      nextDueAt: "2026-09-28T12:00:00.000Z",
      receiptSha256: sha256("synthetic current freshness receipt"),
      limitations: ["Synthetic acceptance fixture."],
    }],
    impactJob: {
      jobId: deterministicUuid(`${namespace}:impact-job`),
      status: "pending",
      affectedClaimVersionIds: [claimVersionId],
      impactReceiptSha256: null,
      failureCode: null,
    },
  };
  return contribution;
}

function reusableStudyAuditFixture(namespace: string): {
  index: AuditableDocumentIndex;
  audit: StudyMethodAuditSubmission;
  contribution: LivingEvidenceContribution;
} {
  const doi = `10.1234/reuse.${sha256(namespace).slice(0, 16)}`;
  const text = "Synthetic source material used transiently for repository read-through acceptance.";
  const textSha256 = sha256(text);
  const index: AuditableDocumentIndex = {
    source: {
      provider: "unpaywall_open_location",
      primary_identifier: doi,
      canonical_url: `https://repository.example.org/${doi}`,
      doi,
      title: "Synthetic reusable study audit",
      version: "acceptedVersion",
      format: "pdf_text",
      content_sha256: sha256(`pdf:${text}`),
      document_completeness: "full_text_with_body",
      identity_verification: "doi_exact",
    },
    section_paths: [["Page 1"]],
    blocks: [{
      block_id: `pdf_000001_${textSha256.slice(0, 12)}`,
      kind: "page_text",
      section_path: ["Page 1"],
      page_number: 1,
      text,
      text_sha256: textSha256,
    }],
  };
  const audit: StudyMethodAuditSubmission = {
    source_primary_identifier: doi,
    source_content_sha256: index.source.content_sha256,
    design_label: "synthetic parallel comparison",
    design_capability_statement: "The synthetic label is not a reliability verdict.",
    population_and_stage: "Synthetic population and stage for persistence acceptance only.",
    intervention_program: acceptanceProgram("synthetic intervention"),
    comparator_program: acceptanceProgram("synthetic comparator"),
    outcome_and_horizon: "Synthetic outcome and horizon.",
    domain_findings: STUDY_METHOD_AUDIT_DOMAINS.map((domain) => ({
      domain,
      status: "limitation_identified" as const,
      plain_language_finding: `Synthetic bounded ${domain} finding.`,
      evidence_block_ids: [index.blocks[0]!.block_id],
      unresolved_fields: [],
    })),
    claim_capabilities: [
      {
        claim: "The synthetic compared programs can be described.",
        capability: "can_support",
        reason: "The transient synthetic source block supplies that description.",
        evidence_block_ids: [index.blocks[0]!.block_id],
      },
      {
        claim: "The synthetic study proves a real treatment effect.",
        capability: "cannot_support",
        reason: "This is an acceptance fixture, not health evidence.",
        evidence_block_ids: [],
      },
    ],
  };
  return {
    index,
    audit,
    contribution: createValidatedStudyAuditContribution({
      index,
      auditReceipt: validateStudyMethodAudit(index, audit),
      protocolManifests: CURRENT_PROTOCOLS,
      startedAt: "2026-08-29T13:00:00.000Z",
      completedAt: "2026-08-29T13:01:00.000Z",
      freshness: {
        checkedAt: "2026-08-29T13:00:00.000Z",
        nextDueAt: "2099-09-28T13:00:00.000Z",
        receiptSha256: sha256(`${namespace}:freshness`),
      },
    }),
  };
}

function acceptanceProgram(name: string) {
  return {
    name,
    components: ["synthetic component"],
    dose_or_intensity: "synthetic dose",
    frequency: "synthetic frequency",
    duration: "synthetic duration",
    supervision: "synthetic supervision",
    adherence: "synthetic adherence",
    co_interventions: [],
    care_stage: "other" as const,
  };
}

function clarification(initial: LivingEvidenceContribution, namespace: string): LivingEvidenceContribution {
  const text = "# Clarification\n\nThe later analysis clarifies the acceptance claim while preserving the initial version unchanged.\n";
  return {
    ...structuredClone(initial),
    idempotencyKey: `acceptance:${namespace}:clarification`,
    run: {
      ...initial.run,
      runId: deterministicUuid(`${namespace}:run:clarification`),
      runKind: "clarification",
      startedAt: "2026-08-29T12:02:00.000Z",
      completedAt: "2026-08-29T12:03:00.000Z",
      provenanceNote: "Synthetic clarification acceptance run.",
    },
    analysis: {
      ...initial.analysis,
      versionId: deterministicUuid(`${namespace}:version:clarification`),
      analysisKind: "clarification",
      relationship: "clarifies",
      previousVersionId: initial.analysis.versionId,
      captureStatus: "clarification",
      authoredAt: "2026-08-29T12:03:00.000Z",
      coverageStatement: "Complete clarification contribution; the prior full analysis remains an immutable lineage member.",
      declaredWholeTextSha256: sha256(text),
      sections: [{ ordinal: 0, sectionKey: "000-clarification", title: "Clarification", content: text }],
      domains: [],
      claimCapabilities: [],
      futureAnalysisItems: initial.analysis.futureAnalysisItems.map((item) => ({
        ...item,
        status: "resolved",
        resolvedByVersionId: deterministicUuid(`${namespace}:version:clarification`),
      })),
    },
    receipts: [],
  };
}

function invalidation(initial: LivingEvidenceContribution, prior: LivingEvidenceContribution, namespace: string): LivingEvidenceContribution {
  const text = "# Invalidation\n\nThe synthetic lineage is invalidated solely to verify that current projections become unusable without deleting prior analysis.\n";
  return {
    ...structuredClone(initial),
    idempotencyKey: `acceptance:${namespace}:invalidation`,
    run: {
      ...initial.run,
      runId: deterministicUuid(`${namespace}:run:invalidation`),
      runKind: "correction",
      startedAt: "2026-08-29T12:04:00.000Z",
      completedAt: "2026-08-29T12:05:00.000Z",
      provenanceNote: "Synthetic invalidation acceptance run.",
    },
    analysis: {
      ...initial.analysis,
      versionId: deterministicUuid(`${namespace}:version:invalidation`),
      analysisKind: "invalidation",
      relationship: "invalidates",
      previousVersionId: prior.analysis.versionId,
      captureStatus: "invalidation",
      authoredAt: "2026-08-29T12:05:00.000Z",
      coverageStatement: "Complete synthetic invalidation reason; all earlier lineage members remain immutable and exportable.",
      declaredWholeTextSha256: sha256(text),
      sections: [{ ordinal: 0, sectionKey: "000-invalidation", title: "Invalidation", content: text }],
      domains: [],
      claimCapabilities: [],
      futureAnalysisItems: [],
    },
    receipts: [],
  };
}

async function expectReject(action: () => Promise<unknown>, expected: string): Promise<void> {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes(expected)) return;
    throw new Error(`EXPECTED_REJECTION_MISMATCH expected=${expected} actual=${message}`);
  }
  throw new Error(`EXPECTED_REJECTION_MISSING expected=${expected}`);
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const namespace = `acceptance-${process.pid}-${Date.now()}`;
  const schema = process.env.ASKRIGOR_ACCEPTANCE_SCHEMA ?? `living_evidence_acceptance_${process.pid}`;
  const repository = new PostgresEvidenceRepository({
    connectionString,
    schema,
    ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined,
  });
  const acceptancePool = new Pool({
    connectionString,
    ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined,
  });
  const checks: string[] = [];
  try {
    await repository.migrate();
    checks.push("migration_applied");
    const reusable = reusableStudyAuditFixture(`${namespace}:reuse`);
    await repository.contribute(reusable.contribution);
    const reuseCandidates = await repository.findAnalysisReuseCandidates({
      identifier: reusable.contribution.source!.identifiers[0]!,
      sourceContentSha256: reusable.index.source.content_sha256,
      analysisKind: "study_method_audit",
      analysisVersionId: reusable.contribution.analysis.versionId,
    });
    if (reuseCandidates.length !== 1) throw new Error("REUSABLE_STUDY_AUDIT_LOOKUP_FAILED");
    const reuseResolution = await resolveStudyAuditReuse({
      reader: repository,
      index: reusable.index,
      requestedDoi: reusable.index.source.doi!,
      protocolManifests: CURRENT_PROTOCOLS,
      analysisVersionId: reusable.contribution.analysis.versionId,
    });
    if (
      reuseResolution.projection.status !== "reusable" ||
      reuseResolution.audit === undefined ||
      validateStudyMethodAudit(reusable.index, reuseResolution.audit).audit_sha256 !==
        validateStudyMethodAudit(reusable.index, reusable.audit).audit_sha256
    ) {
      throw new Error("REUSABLE_STUDY_AUDIT_REVALIDATION_FAILED");
    }
    checks.push("exact_current_study_audit_lookup_and_revalidation");
    const initial = fixture(namespace);
    const prepared = prepareContribution(initial);
    const inserted = await repository.contribute(initial);
    if (inserted.status !== "inserted" || inserted.wholeTextBytes !== prepared.wholeTextBytes || prepared.wholeTextBytes < 100_000) {
      throw new Error("LOSSLESS_INSERT_RECEIPT_MISMATCH");
    }
    checks.push("large_complete_analysis_inserted_without_truncation");
    const replay = await repository.contribute(initial);
    if (replay.status !== "idempotent_replay") throw new Error("IDEMPOTENT_REPLAY_FAILED");
    checks.push("idempotent_replay");

    const idempotencyAttack = structuredClone(initial);
    idempotencyAttack.analysis.coverageStatement += " changed";
    await expectReject(() => repository.contribute(idempotencyAttack), "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH");
    checks.push("idempotency_key_payload_collision_rejected");

    const later = clarification(initial, namespace);
    await repository.contribute(later);
    const projection = await repository.getCurrentProjection(initial.analysis.analysisId);
    if (projection.versionId !== later.analysis.versionId || !projection.usable) throw new Error("CURRENT_PROJECTION_STALE");
    checks.push("clarification_appended_and_projected");

    const staleBranch = clarification(initial, `${namespace}:stale`);
    staleBranch.analysis.analysisId = initial.analysis.analysisId;
    staleBranch.analysis.previousVersionId = initial.analysis.versionId;
    staleBranch.topic = initial.topic;
    staleBranch.source = initial.source;
    await expectReject(() => repository.contribute(staleBranch), "duplicate key");
    checks.push("stale_concurrent_branch_rejected");

    const duplicateInitial = structuredClone(initial);
    duplicateInitial.idempotencyKey = `acceptance:${namespace}:duplicate-initial`;
    duplicateInitial.run.runId = deterministicUuid(`${namespace}:run:duplicate-initial`);
    duplicateInitial.analysis.versionId = deterministicUuid(`${namespace}:version:duplicate-initial`);
    await expectReject(() => repository.contribute(duplicateInitial), "ANALYSIS_ALREADY_HAS_INITIAL_VERSION");
    checks.push("second_initial_version_rejected");

    const protocolConflict = fixture(`${namespace}:protocol-conflict`);
    protocolConflict.run.protocolManifests[0]!.name = "Conflicting manifest name";
    await expectReject(() => repository.contribute(protocolConflict), "PROTOCOL_MANIFEST_CONFLICT");
    checks.push("protocol_hash_metadata_conflict_rejected");

    const sourceConflict = fixture(`${namespace}:source-conflict`);
    sourceConflict.source!.familyId = initial.source!.familyId;
    sourceConflict.source!.versionId = initial.source!.versionId;
    await expectReject(() => repository.contribute(sourceConflict), "SOURCE_FAMILY_ID_CONFLICT");
    checks.push("source_identity_conflict_rejected");

    const pendingImpact = pendingImpactFixture(`${namespace}:pending-impact`);
    await repository.contribute(pendingImpact);
    const blockedCurrent = await repository.searchKnowledge({
      topicKey: pendingImpact.topic!.canonicalKey,
      includeHistorical: false,
    });
    const retainedHistorical = await repository.searchKnowledge({
      topicKey: pendingImpact.topic!.canonicalKey,
      includeHistorical: true,
    });
    if (blockedCurrent.result_count !== 0 || retainedHistorical.result_count !== 1) {
      throw new Error("PENDING_IMPACT_CURRENT_PROJECTION_NOT_BLOCKED");
    }
    checks.push("pending_impact_blocks_current_but_preserves_history");

    const questionConflict = pendingImpactFixture(`${namespace}:question-conflict`);
    questionConflict.topic = pendingImpact.topic;
    questionConflict.knowledge!.question!.questionId = pendingImpact.knowledge!.question!.questionId;
    questionConflict.knowledge!.question!.normalizedQuestion = pendingImpact.knowledge!.question!.normalizedQuestion;
    questionConflict.knowledge!.question!.dimensions.outcome = "conflicting synthetic outcome";
    questionConflict.knowledge!.claims[0]!.questionId = pendingImpact.knowledge!.question!.questionId;
    await expectReject(() => repository.contribute(questionConflict), "QUESTION_ID_CONFLICT");
    checks.push("question_dimension_identity_conflict_rejected");

    const receiptMismatch = pendingImpactFixture(`${namespace}:receipt-source-mismatch`);
    receiptMismatch.knowledge!.evidenceBindings[0]!.validationReceiptId = initial.receipts[0]!.receiptId;
    await expectReject(
      () => repository.contribute(receiptMismatch),
      "EVIDENCE_BINDING_RECEIPT_SOURCE_MISMATCH",
    );
    checks.push("evidence_binding_receipt_source_mismatch_rejected");

    const resolutionInitial = fixture(`${namespace}:unknown-resolution`);
    await repository.contribute(resolutionInitial);
    const unknownResolution = clarification(resolutionInitial, `${namespace}:unknown-resolution`);
    unknownResolution.analysis.futureAnalysisItems[0]!.itemId = deterministicUuid(`${namespace}:unknown-resolution:never-opened-item`);
    await expectReject(
      () => repository.contribute(unknownResolution),
      "FUTURE_ANALYSIS_RESOLUTION_WITHOUT_OPEN_ITEM",
    );
    checks.push("unknown_future_analysis_resolution_rejected");

    const hierarchyTarget = deterministicUuid(`${namespace}:topic:hierarchy-target`);
    const hierarchyClient = await acceptancePool.connect();
    try {
      await hierarchyClient.query(`SET search_path TO ${schema}, public`);
      await hierarchyClient.query(
        "INSERT INTO topics (topic_id, canonical_key, label) VALUES ($1, $2, $3)",
        [hierarchyTarget, `acceptance.${namespace.replaceAll(":", ".")}.child`, "Hierarchy child"],
      );
      await hierarchyClient.query(
        `INSERT INTO topic_edges (edge_id, from_topic_id, to_topic_id, relation, run_id)
         VALUES ($1, $2, $3, 'broader_than', $4)`,
        [deterministicUuid(`${namespace}:topic-edge:forward`), initial.topic!.topicId, hierarchyTarget, initial.run.runId],
      );
    } finally {
      hierarchyClient.release();
    }
    await expectReject(async () => {
      const client = await acceptancePool.connect();
      try {
        await client.query(`SET search_path TO ${schema}, public`);
        await client.query(
          `INSERT INTO topic_edges (edge_id, from_topic_id, to_topic_id, relation, run_id)
           VALUES ($1, $2, $3, 'broader_than', $4)`,
          [deterministicUuid(`${namespace}:topic-edge:cycle`), hierarchyTarget, initial.topic!.topicId, initial.run.runId],
        );
      } finally {
        client.release();
      }
    }, "TOPIC_HIERARCHY_CYCLE");
    checks.push("topic_hierarchy_cycle_rejected");

    const sourceCycleVersion = deterministicUuid(`${namespace}:source-version:cycle-target`);
    const sourceCycleClient = await acceptancePool.connect();
    try {
      await sourceCycleClient.query(`SET search_path TO ${schema}, public`);
      await sourceCycleClient.query(
        `INSERT INTO source_versions
          (version_id, family_id, source_content_sha256, access_status, retrieved_at, source_locator, raw_content_persisted)
         VALUES ($1, $2, $3, 'complete', $4, $5, false)`,
        [sourceCycleVersion, initial.source!.familyId, sha256(`${namespace}:cycle-source-bytes`), "2026-08-29T12:06:00.000Z", "acceptance:cycle-source"],
      );
      await sourceCycleClient.query(
        `INSERT INTO source_edges
          (edge_id, from_source_version_id, to_source_version_id, relation, confidence, uncertainty, supersedes_edge_id, created_by_run_id)
         VALUES ($1, $2, $3, 'updates', 'verified', NULL, NULL, $4)`,
        [deterministicUuid(`${namespace}:source-edge:forward`), initial.source!.versionId, sourceCycleVersion, initial.run.runId],
      );
    } finally {
      sourceCycleClient.release();
    }
    await expectReject(async () => {
      const client = await acceptancePool.connect();
      try {
        await client.query(`SET search_path TO ${schema}, public`);
        await client.query(
          `INSERT INTO source_edges
            (edge_id, from_source_version_id, to_source_version_id, relation, confidence, uncertainty, supersedes_edge_id, created_by_run_id)
           VALUES ($1, $2, $3, 'updates', 'verified', NULL, NULL, $4)`,
          [deterministicUuid(`${namespace}:source-edge:cycle`), sourceCycleVersion, initial.source!.versionId, initial.run.runId],
        );
      } finally {
        client.release();
      }
    }, "SOURCE_LINEAGE_CYCLE");
    checks.push("source_lineage_cycle_rejected");

    const beforeRollback = await repository.countRows("analysis_versions");
    const rollbackFixture = fixture(`${namespace}:rollback`);
    await expectReject(() => repository.contribute(rollbackFixture, "after_sections"), "INJECTED_FAILURE_AFTER_SECTIONS");
    if (await repository.countRows("analysis_versions") !== beforeRollback) throw new Error("TRANSACTION_ROLLBACK_FAILED");
    checks.push("injected_failure_rolled_back");

    const prohibited = { ...structuredClone(rollbackFixture), raw_content: "must never persist" };
    await expectReject(() => repository.contribute(prohibited), "PROHIBITED_PERSISTENT_KEY");
    checks.push("prohibited_raw_data_rejected");

    const badDigest = structuredClone(rollbackFixture);
    badDigest.analysis.declaredWholeTextSha256 = "0".repeat(64);
    await expectReject(() => repository.contribute(badDigest), "ANALYSIS_WHOLE_TEXT_SHA256_MISMATCH");
    checks.push("declared_digest_mismatch_rejected");

    const invalidated = invalidation(initial, later, namespace);
    await repository.contribute(invalidated);
    const invalidProjection = await repository.getCurrentProjection(initial.analysis.analysisId);
    if (invalidProjection.versionId !== invalidated.analysis.versionId || invalidProjection.usable) throw new Error("INVALIDATION_PROJECTION_FAILED");
    checks.push("invalidation_preserves_lineage_and_blocks_current_use");

    const exported = await repository.exportAnalysis(initial.analysis.analysisId);
    const versions = exported.versions as Array<{ version_id: string; whole_text_sha256: string }>;
    if (versions.length !== 3 || versions[0]!.whole_text_sha256 !== prepared.wholeTextSha256) throw new Error("LINEAGE_EXPORT_MISMATCH");
    checks.push("complete_lineage_export_reconstructed");

    await expectReject(
      async () => {
        const client = await acceptancePool.connect();
        try {
          await client.query(`SET search_path TO ${schema}, public`);
          await client.query("UPDATE analysis_versions SET coverage_statement = 'tampered' WHERE version_id = $1", [initial.analysis.versionId]);
        } finally {
          client.release();
        }
      },
      "APPEND_ONLY_TABLE",
    );
    await expectReject(
      async () => {
        const client = await acceptancePool.connect();
        try {
          await client.query(`SET search_path TO ${schema}, public`);
          await client.query("DELETE FROM analysis_sections WHERE version_id = $1", [initial.analysis.versionId]);
        } finally {
          client.release();
        }
      },
      "APPEND_ONLY_TABLE",
    );
    checks.push("update_and_delete_rejected_by_database");

    process.stdout.write(`${JSON.stringify({ status: "PASS", schema, checks, check_count: checks.length, analysis_id: initial.analysis.analysisId, initial_sha256: prepared.wholeTextSha256 })}\n`);
  } finally {
    await acceptancePool.end();
    await repository.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown acceptance failure";
  process.stderr.write(`Living-evidence acceptance failed: ${message}\n`);
  process.exitCode = 1;
});
