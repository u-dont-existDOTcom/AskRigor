import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  deterministicUuid,
  sha256,
  stableJson,
  type LivingEvidenceContribution,
} from "../packages/evidence-repository/src/index.js";

const HISTORICAL_PROTOCOLS = [
  {
    name: "AskRigor HRP",
    version: "20.5.18",
    revisionDate: "2026-08-16",
    sha256: "4d27c5cd50b9cb097e247101128a89759b2da9c5ca1d758cfec812724b210ae5",
  },
  {
    name: "AskRigor Universal",
    version: "20.5.14",
    revisionDate: "2026-08-18",
    sha256: "8f929aa70bc71d8528da3527a22704b0cf85ffec08e9b7b13a186ead71505221",
  },
] as const;

const CURRENT_PROTOCOLS = [
  {
    name: "AskRigor HRP",
    version: "20.5.24",
    revisionDate: "2026-08-31",
    sha256: "dd494d5665331e42b91232245dbba0392ecc9918d63b2638ef35c6e7528604d1",
  },
  {
    name: "AskRigor Universal",
    version: "20.5.15",
    revisionDate: "2026-08-24",
    sha256: "69c5186862ade61d6a97dc842b8c027324c7e2f3fd7147064a360049e0d25172",
  },
] as const;

const ROOT_TOPIC_ID = deterministicUuid("askrigor:topic:hip-pain");
const HIP_OA_TOPIC_ID = deterministicUuid("askrigor:topic:hip-osteoarthritis");
const TOPIC_ID = deterministicUuid("askrigor:topic:hip-osteoarthritis:platelet-rich-plasma");
const QUESTION_ID = deterministicUuid("askrigor:question:hip-oa-prp-effectiveness-and-harms");
const REPORT_ANALYSIS_ID = deterministicUuid("askrigor:analysis:unspecified-hip-pain:2026-08-21");
const CUREUS_ANALYSIS_ID = deterministicUuid("askrigor:analysis:doi:10.7759/cureus.72057");

const QUESTION = {
  questionId: QUESTION_ID,
  normalizedQuestion: "For adults with hip osteoarthritis, what benefits, harms, durability, and evidence limits are established for platelet-rich plasma compared with placebo or other injections?",
  dimensions: {
    population: "adults with hip osteoarthritis",
    programOrExposure: "intra-articular platelet-rich plasma",
    comparator: "saline placebo, hyaluronic acid, corticosteroid, or another injection strategy",
    outcome: "pain, function, harms, durability, and structural outcomes",
    horizon: "short, medium, and long term",
    setting: "clinical treatment",
  },
} as const;

function reportParagraph(report: string, prefix: string): string {
  const start = report.indexOf(prefix);
  if (start === -1) throw new Error(`HISTORICAL_REPORT_PARAGRAPH_NOT_FOUND prefix=${prefix}`);
  const end = report.indexOf("\n\n", start);
  return report.slice(start, end === -1 ? report.length : end + 2);
}

function reportSection(report: string, startHeading: string, endHeading: string): string {
  const start = report.indexOf(startHeading);
  if (start === -1) throw new Error(`HISTORICAL_REPORT_SECTION_NOT_FOUND heading=${startHeading}`);
  const end = report.indexOf(endHeading, start + startHeading.length);
  if (end === -1) throw new Error(`HISTORICAL_REPORT_SECTION_END_NOT_FOUND heading=${endHeading}`);
  return report.slice(start, end);
}

export async function historicalPilotContributions(root: string): Promise<LivingEvidenceContribution[]> {
  const reportPath = join(root, "docs", "audits", "2026-08-21-unspecified-hip-pain-full-hrp.md");
  const report = await readFile(reportPath, "utf8");
  const reportSha256 = sha256(report);
  const formalAuditSection = reportSection(
    report,
    "### Decision-critical full-text audit\n",
    "## Forum Signal and direct-human findings\n",
  );
  const formalAuditSectionSha256 = sha256(formalAuditSection);
  const commonRun = {
    runKind: "historical_import" as const,
    startedAt: "2026-08-21T00:00:00.000Z",
    completedAt: "2026-08-21T23:59:59.000Z",
    protocolManifests: [...HISTORICAL_PROTOCOLS],
    provenanceNote: "Imported from the committed public AskRigor audit without reconstructing unavailable working memory or raw source bodies.",
  };
  const rootTopic = {
    topicId: ROOT_TOPIC_ID,
    canonicalKey: "health.hip-pain",
    label: "Hip pain",
  };
  const hipOaTopic = {
    topicId: HIP_OA_TOPIC_ID,
    canonicalKey: "health.hip-osteoarthritis",
    label: "Hip osteoarthritis",
  };
  const topic = {
    topicId: TOPIC_ID,
    canonicalKey: "health.hip-osteoarthritis.platelet-rich-plasma",
    label: "Hip osteoarthritis: platelet-rich plasma",
  };
  const reportContribution: LivingEvidenceContribution = {
    schemaVersion: 1,
    idempotencyKey: `historical-formal-audit-section:${formalAuditSectionSha256}`,
    run: { ...commonRun, runId: deterministicUuid(`askrigor:run:historical-formal-audit-section:${formalAuditSectionSha256}`) },
    topic: rootTopic,
    source: null,
    analysis: {
      analysisId: REPORT_ANALYSIS_ID,
      versionId: deterministicUuid(`askrigor:analysis-version:historical-formal-audit-section:${formalAuditSectionSha256}`),
      analysisKind: "topic_synthesis",
      relationship: "initial",
      previousVersionId: null,
      captureStatus: "partial_historical_capture",
      authoredAt: "2026-08-21T23:59:59.000Z",
      coverageStatement: "Exact byte-for-byte capture of the surviving formal-evidence full-text-audit section. The complete topic synthesis is intentionally not imported because it also contains community-derived material excluded by the pilot policy, so this version is explicitly partial.",
      declaredWholeTextSha256: formalAuditSectionSha256,
      sections: [{ ordinal: 0, sectionKey: "000-decision-critical-full-text-audit", title: "Decision-critical full-text audit", content: formalAuditSection }],
      domains: [],
      claimCapabilities: [
        {
          ordinal: 0,
          claim: "The captured section can support the recorded method limitations and access boundaries for the LEAP, HIT, PROHIP, replacement-trial, and Cochrane evidence it discusses.",
          capability: "can_support",
          reason: "The exact formal-evidence audit section is retained without importing the report's community-derived sections.",
          evidenceLocators: [`repo:${reportPath}#decision-critical-full-text-audit`, `sha256:${formalAuditSectionSha256}`],
        },
        {
          ordinal: 1,
          claim: "The captured section is a complete topic synthesis or a complete study-level method audit.",
          capability: "cannot_support",
          reason: "It is a deliberately bounded historical excerpt; missing study-domain analysis is not reconstructed.",
          evidenceLocators: [`repo:${reportPath}#decision-critical-full-text-audit`],
        },
      ],
      futureAnalysisItems: [],
    },
    receipts: [
      {
        receiptId: deterministicUuid(`askrigor:receipt:historical-formal-audit-section:${formalAuditSectionSha256}`),
        receiptKind: "committed_authored_analysis_excerpt",
        receiptSha256: formalAuditSectionSha256,
        locator: `repo:${reportPath}#decision-critical-full-text-audit`,
        details: {
          bytes: Buffer.byteLength(formalAuditSection, "utf8"),
          full_report_sha256: reportSha256,
          historical_partial: true,
          source_body_included: false,
          community_derived_material_included: false,
        },
      },
    ],
    knowledge: {
      question: null,
      topicEdges: [],
      claims: [],
      evidenceBindings: [],
      sourceEdges: [],
      claimEdges: [],
      assessment: null,
      freshnessPolicy: null,
      freshnessChecks: [],
      impactJob: null,
    },
  };

  const hipOaContext = reportParagraph(report, "For PRP, one five-RCT review");
  const hipOaContextHash = sha256(hipOaContext);
  const hipOaContribution: LivingEvidenceContribution = {
    schemaVersion: 1,
    idempotencyKey: `historical-topic-context:hip-osteoarthritis:${hipOaContextHash}`,
    run: { ...commonRun, runId: deterministicUuid("askrigor:run:historical-topic-context:hip-osteoarthritis") },
    topic: hipOaTopic,
    source: null,
    analysis: {
      analysisId: deterministicUuid("askrigor:analysis:topic-context:hip-osteoarthritis"),
      versionId: deterministicUuid(`askrigor:analysis-version:topic-context:hip-osteoarthritis:${hipOaContextHash}`),
      analysisKind: "topic_synthesis",
      relationship: "initial",
      previousVersionId: null,
      captureStatus: "partial_historical_capture",
      authoredAt: "2026-08-21T23:59:59.000Z",
      coverageStatement: "Exact surviving authored paragraph used only to establish the hip-osteoarthritis topic context; it is not represented as a complete topic synthesis.",
      declaredWholeTextSha256: hipOaContextHash,
      sections: [{ ordinal: 0, sectionKey: "000-hip-oa-context", title: "Hip osteoarthritis context", content: hipOaContext }],
      domains: [],
      claimCapabilities: [],
      futureAnalysisItems: [],
    },
    receipts: [{
      receiptId: deterministicUuid(`askrigor:receipt:topic-context:hip-osteoarthritis:${hipOaContextHash}`),
      receiptKind: "committed_authored_analysis",
      receiptSha256: hipOaContextHash,
      locator: `repo:${reportPath}`,
      details: { historical_partial: true, source_body_included: false },
    }],
    knowledge: {
      question: null,
      topicEdges: [{
        edgeId: deterministicUuid("askrigor:topic-edge:hip-pain:hip-osteoarthritis"),
        fromTopicId: ROOT_TOPIC_ID,
        toTopicId: HIP_OA_TOPIC_ID,
        relation: "broader_than",
      }],
      claims: [],
      evidenceBindings: [],
      sourceEdges: [],
      claimEdges: [],
      assessment: null,
      freshnessPolicy: null,
      freshnessChecks: [],
      impactJob: null,
    },
  };

  const cureusText = reportParagraph(report, "For PRP, one five-RCT review");
  const sourceIdentifiers = [
    { scheme: "doi" as const, value: "10.7759/cureus.72057" },
    { scheme: "pmid" as const, value: "39569300" },
    { scheme: "pmcid" as const, value: "PMC11578636" },
  ];
  const sourceContentSha256 = "d708fbfe67ebbb411c8937fdc55fc0021fe45a6188c2c503e50e820ce2b41cd3";
  const auditReceiptSha256 = "66de15115f1b121ecba82298f1e87e93ba615d1e578e446c619e2b1d3c1c919a";
  const cureusReceiptId = deterministicUuid("askrigor:receipt:10.7759/cureus.72057:historical-audit");
  const cureusAnalysisVersionId = deterministicUuid(`askrigor:analysis-version:cureus.72057:${sha256(cureusText)}`);
  const cureusSourceVersionId = deterministicUuid(`askrigor:source-version:${sourceContentSha256}`);
  const cureusClaimId = deterministicUuid("askrigor:claim:hip-oa-prp-routine-effectiveness-not-established");
  const cureusClaimVersionId = deterministicUuid("askrigor:claim-version:hip-oa-prp-routine-effectiveness-not-established:v1");
  const cureusPolicyId = deterministicUuid("askrigor:freshness-policy:doi:10.7759/cureus.72057");
  const studyContribution: LivingEvidenceContribution = {
    schemaVersion: 1,
    idempotencyKey: `historical-study-analysis:cureus-72057:${sha256(cureusText)}`,
    run: { ...commonRun, runId: deterministicUuid("askrigor:run:historical-study:10.7759/cureus.72057") },
    topic,
    source: {
      familyId: deterministicUuid("askrigor:source-family:doi:10.7759/cureus.72057"),
      versionId: cureusSourceVersionId,
      sourceKind: "review",
      identityHash: sha256(stableJson(sourceIdentifiers)),
      displayTitle: "Systematic review of platelet-rich plasma for hip osteoarthritis (Cureus 2024)",
      identifiers: sourceIdentifiers,
      sourceContentSha256,
      accessStatus: "complete",
      retrievedAt: "2026-08-25T00:00:00.000Z",
      sourceLocator: "https://doi.org/10.7759/cureus.72057",
      rawContentPersisted: false,
    },
    analysis: {
      analysisId: CUREUS_ANALYSIS_ID,
      versionId: cureusAnalysisVersionId,
      analysisKind: "review_method_audit",
      relationship: "initial",
      previousVersionId: null,
      captureStatus: "partial_historical_capture",
      authoredAt: "2026-08-25T00:00:00.000Z",
      coverageStatement: "All surviving committed AskRigor-authored study-specific analysis is captured, but the complete earlier 12-domain working analysis is not reconstructed from memory and therefore remains explicitly partial.",
      declaredWholeTextSha256: sha256(cureusText),
      sections: [{ ordinal: 0, sectionKey: "000-surviving-authored-appraisal", title: "Surviving authored appraisal", content: cureusText }],
      domains: [],
      claimCapabilities: [
        {
          ordinal: 0,
          claim: "The reviewed small trials establish routine clinical effectiveness or cartilage regeneration from PRP for hip osteoarthritis.",
          capability: "cannot_support",
          reason: "The surviving appraisal records small samples, variable preparation, and risk-of-bias concerns, while the broader synthesis records conflicting placebo-network evidence.",
          evidenceLocators: ["doi:10.7759/cureus.72057", `analysis-report-sha256:${reportSha256}`],
        },
      ],
      futureAnalysisItems: [
        {
          itemId: deterministicUuid("askrigor:future-analysis:10.7759/cureus.72057:full-review-audit"),
          question: "What does a fresh exact-source, 12-domain review-method audit establish, including study-family ancestry, pooling choices, missing results, conflicts, and recommendation scope?",
          rationale: "The source was previously read, but the complete authored domain analysis is not durably recoverable; clarity requires a new source-bound audit rather than reconstruction.",
          priority: "high",
          status: "open",
          evidenceNeeded: ["reacquired exact source bytes", "complete review-method audit receipt", "current external-evidence and integrity checks"],
          resolvedByVersionId: null,
        },
      ],
    },
    receipts: [
      {
        receiptId: cureusReceiptId,
        receiptKind: "historical_method_audit_receipt",
        receiptSha256: auditReceiptSha256,
        locator: "repo:project/CODEX-CURRENT-STATE.md",
        details: { source_blocks: 58, source_blocks_consumed: 58, source_body_included: false },
      },
    ],
    knowledge: {
      question: QUESTION,
      topicEdges: [{
        edgeId: deterministicUuid("askrigor:topic-edge:hip-osteoarthritis:prp"),
        fromTopicId: HIP_OA_TOPIC_ID,
        toTopicId: TOPIC_ID,
        relation: "broader_than",
      }],
      claims: [{
        claimId: cureusClaimId,
        versionId: cureusClaimVersionId,
        questionId: QUESTION_ID,
        normalizedAssertion: "The surviving audit does not establish routine clinical effectiveness or cartilage regeneration from platelet-rich plasma for hip osteoarthritis.",
        claimType: "effect",
        dimensions: QUESTION.dimensions,
        direction: "mixed",
        inferenceType: "methodological",
        capabilityState: "cannot_support",
        uncertaintyAndLimitations: ["Complete historical domain findings are not durably recoverable and require a fresh source-bound review audit."],
        status: "current",
        supersedesClaimVersionId: null,
      }],
      evidenceBindings: [{
        bindingId: deterministicUuid("askrigor:evidence-binding:cureus.72057:effectiveness-not-established:v1"),
        claimVersionId: cureusClaimVersionId,
        sourceVersionId: cureusSourceVersionId,
        locator: `analysis-report-sha256:${reportSha256}`,
        polarity: "qualifies",
        extractionType: "historical_import",
        capabilityCeiling: "cannot_support",
        validationReceiptId: cureusReceiptId,
        limitations: ["The full source was read previously, but only the terminal receipt and bounded authored appraisal survive durably."],
      }],
      sourceEdges: [],
      claimEdges: [],
      assessment: {
        assessmentId: deterministicUuid("askrigor:assessment:doi:10.7759/cureus.72057"),
        versionId: deterministicUuid("askrigor:assessment-version:doi:10.7759/cureus.72057:v1"),
        rubric: "review_method_v1",
        rubricVersion: "1.0",
        assessorType: "model",
        assessorIdentifier: "AskRigor primary Chat product run",
        internalValidity: { status: "unclear", reason: "A validated audit with unresolved fields is documented, but its complete domain text is not durably recoverable." },
        applicability: { status: "limitation_identified", reason: "The small trials and variable PRP preparations do not justify a general routine-effectiveness or regeneration conclusion." },
        disagreementState: "unresolved",
        supersedesAssessmentVersionId: null,
      },
      freshnessPolicy: {
        policyId: cureusPolicyId,
        sourceClass: "review",
        cadenceDays: 30,
        maximumAgeDays: 30,
        ownerRole: "refresh_worker",
        requiredChecks: ["source identity and content hash", "correction or retraction metadata", "linked evidence changes"],
        failureBehavior: "block_current_projection",
      },
      freshnessChecks: [{
        checkId: deterministicUuid("askrigor:freshness-check:doi:10.7759/cureus.72057:historical-import"),
        policyId: cureusPolicyId,
        checkedAt: "2026-08-25T00:00:00.000Z",
        outcome: "partial",
        projectionState: "stale",
        nextDueAt: null,
        receiptSha256: auditReceiptSha256,
        limitations: ["The historical audit receipt survives, but a fresh correction/retraction and source-content check is required before decision-important reuse."],
      }],
      impactJob: null,
    },
  };

  const relatedSpecs = [
    {
      key: "doi:10.1136/bjsports-2020-102179",
      kind: "review" as const,
      identifiers: [{ scheme: "doi" as const, value: "10.1136/bjsports-2020-102179" }, { scheme: "pmid" as const, value: "32829298" }],
      title: "Hip injection placebo network meta-analysis (2020)",
      accessStatus: "abstract_only" as const,
      paragraphPrefix: "Meta-analyses disagree:",
      assertion: "A 2020 placebo-network analysis reported no superiority of corticosteroid, platelet-rich plasma, or hyaluronic acid over saline at the reported two-to-four- and six-month horizons.",
      direction: "no_effect" as const,
      capability: "uncertain" as const,
      activeRegistry: false,
    },
    {
      key: "doi:10.1302/0301-620X.106B6.BJJ-2023-1272.R1",
      kind: "review" as const,
      identifiers: [{ scheme: "doi" as const, value: "10.1302/0301-620X.106B6.BJJ-2023-1272.R1" }, { scheme: "pmid" as const, value: "38821500" }],
      title: "Updated hip injection network meta-analysis (2024)",
      accessStatus: "abstract_only" as const,
      paragraphPrefix: "Meta-analyses disagree:",
      assertion: "An updated 2024 network analysis reported a three-month corticosteroid advantage but not a six-month pain advantage, illustrating conflicting injection estimates and horizons.",
      direction: "mixed" as const,
      capability: "uncertain" as const,
      activeRegistry: false,
    },
    {
      key: "nct:NCT04990128",
      kind: "registry" as const,
      identifiers: [{ scheme: "nct" as const, value: "NCT04990128" }],
      title: "Bone marrow aspirate concentrate versus triamcinolone trial",
      accessStatus: "metadata_only" as const,
      paragraphPrefix: "For PRP, one five-RCT review",
      assertion: "The NCT04990128 registry record had no posted results at retrieval and therefore could not support an efficacy conclusion.",
      direction: "descriptive" as const,
      capability: "cannot_support" as const,
      activeRegistry: true,
    },
    {
      key: "nct:NCT05497349",
      kind: "registry" as const,
      identifiers: [{ scheme: "nct" as const, value: "NCT05497349" }],
      title: "Leukocyte-rich versus leukocyte-poor PRP trial",
      accessStatus: "metadata_only" as const,
      paragraphPrefix: "For PRP, one five-RCT review",
      assertion: "The NCT05497349 registry record had no posted results at retrieval and therefore could not support comparative PRP efficacy.",
      direction: "descriptive" as const,
      capability: "cannot_support" as const,
      activeRegistry: true,
    },
    {
      key: "nct:NCT06793982",
      kind: "registry" as const,
      identifiers: [{ scheme: "nct" as const, value: "NCT06793982" }],
      title: "Platelet-rich plasma versus corticosteroid trial",
      accessStatus: "metadata_only" as const,
      paragraphPrefix: "For PRP, one five-RCT review",
      assertion: "The NCT06793982 registry record had no posted results at retrieval and therefore could not support comparative PRP efficacy.",
      direction: "descriptive" as const,
      capability: "cannot_support" as const,
      activeRegistry: true,
    },
  ];

  const relatedContributions: LivingEvidenceContribution[] = [];
  const relatedSourceVersions: string[] = [];
  const relatedClaimVersions: string[] = [];
  for (const [index, spec] of relatedSpecs.entries()) {
    const text = reportParagraph(report, spec.paragraphPrefix);
    const sourceFamilyId = deterministicUuid(`askrigor:source-family:${spec.key}`);
    const sourceVersionId = deterministicUuid(`askrigor:source-version:${spec.key}:historical-metadata`);
    const analysisId = deterministicUuid(`askrigor:analysis:${spec.key}`);
    const analysisVersionId = deterministicUuid(`askrigor:analysis-version:${spec.key}:${sha256(text)}`);
    const receiptId = deterministicUuid(`askrigor:receipt:${spec.key}:authored-synthesis`);
    const claimId = deterministicUuid(`askrigor:claim:${spec.key}:historical-bounded-claim`);
    const claimVersionId = deterministicUuid(`askrigor:claim-version:${spec.key}:v1`);
    const policyId = deterministicUuid(`askrigor:freshness-policy:${spec.key}`);
    relatedSourceVersions.push(sourceVersionId);
    relatedClaimVersions.push(claimVersionId);
    relatedContributions.push({
      schemaVersion: 1,
      idempotencyKey: `historical-related:${sha256(spec.key)}:${sha256(text)}`,
      run: { ...commonRun, runId: deterministicUuid(`askrigor:run:historical-related:${spec.key}`) },
      topic,
      source: {
        familyId: sourceFamilyId,
        versionId: sourceVersionId,
        sourceKind: spec.kind,
        identityHash: sha256(stableJson(spec.identifiers)),
        displayTitle: spec.title,
        identifiers: spec.identifiers,
        sourceContentSha256: null,
        accessStatus: spec.accessStatus,
        retrievedAt: "2026-08-21T00:00:00.000Z",
        sourceLocator: `${spec.identifiers[0]!.scheme}:${spec.identifiers[0]!.value}`,
        rawContentPersisted: false,
      },
      analysis: {
        analysisId,
        versionId: analysisVersionId,
        analysisKind: spec.kind === "review" ? "review_method_audit" : "claim_recalculation",
        relationship: "initial",
        previousVersionId: null,
        captureStatus: "partial_historical_capture",
        authoredAt: "2026-08-21T23:59:59.000Z",
        coverageStatement: "Complete surviving committed AskRigor-authored passage touching this source; no missing source-specific working analysis is reconstructed.",
        declaredWholeTextSha256: sha256(text),
        sections: [{ ordinal: 0, sectionKey: "000-surviving-authored-passage", title: "Surviving authored passage", content: text }],
        domains: [],
        claimCapabilities: [{ ordinal: 0, claim: spec.assertion, capability: spec.capability === "uncertain" ? "unclear" : spec.capability, reason: "Bounded by the access state and the surviving authored synthesis.", evidenceLocators: spec.identifiers.map(({ scheme, value }) => `${scheme}:${value}`) }],
        futureAnalysisItems: [{
          itemId: deterministicUuid(`askrigor:future-analysis:${spec.key}:fresh-audit`),
          question: `What does a fresh exact-source audit establish for ${spec.title}?`,
          rationale: "Only a bounded historical passage and source identifiers survive durably.",
          priority: spec.activeRegistry ? "high" : "medium",
          status: "open",
          evidenceNeeded: spec.activeRegistry ? ["current registry record", "posted-results check", "linked publication check"] : ["exact source bytes", "complete review-method audit", "current integrity checks"],
          resolvedByVersionId: null,
        }],
      },
      receipts: [{ receiptId, receiptKind: "committed_authored_analysis", receiptSha256: sha256(text), locator: `repo:${reportPath}`, details: { historical_partial: true, source_body_included: false } }],
      knowledge: {
        question: null,
        topicEdges: [],
        claims: [{
          claimId,
          versionId: claimVersionId,
          questionId: QUESTION_ID,
          normalizedAssertion: spec.assertion,
          claimType: spec.activeRegistry ? "access" : "effect",
          dimensions: QUESTION.dimensions,
          direction: spec.direction,
          inferenceType: spec.activeRegistry ? "descriptive" : "methodological",
          capabilityState: spec.capability,
          uncertaintyAndLimitations: [spec.activeRegistry ? "Registry status can change and no posted results were available at the historical retrieval." : "The complete source-specific method audit is not durably available in the repository."],
          status: "current",
          supersedesClaimVersionId: null,
        }],
        evidenceBindings: [{
          bindingId: deterministicUuid(`askrigor:evidence-binding:${spec.key}:v1`),
          claimVersionId,
          sourceVersionId,
          locator: `${spec.identifiers[0]!.scheme}:${spec.identifiers[0]!.value}`,
          polarity: spec.capability === "cannot_support" ? "qualifies" : "context_only",
          extractionType: "historical_import",
          capabilityCeiling: spec.capability,
          validationReceiptId: receiptId,
          limitations: ["Historical partial capture; refresh required before decision-important reuse."],
        }],
        sourceEdges: index === relatedSpecs.length - 1 ? [
          {
            edgeId: deterministicUuid("askrigor:source-edge:network-reviews:shared-population"),
            fromSourceVersionId: relatedSourceVersions[0]!,
            toSourceVersionId: relatedSourceVersions[1]!,
            relation: "shares_population_or_dataset_with",
            confidence: "inferred",
            uncertainty: "Both reviews concern hip injection evidence, but exact included-study overlap requires audit.",
            supersedesEdgeId: null,
          },
        ] : [],
        claimEdges: index === relatedSpecs.length - 1 ? [{
          edgeId: deterministicUuid("askrigor:claim-edge:network-reviews:contradictory-estimates"),
          fromClaimVersionId: relatedClaimVersions[0]!,
          toClaimVersionId: relatedClaimVersions[1]!,
          relation: "contradicts",
          confidence: "inferred",
          uncertainty: "The analyses differ by intervention and horizon; this is a visible estimate conflict, not proof that one review is invalid.",
          supersedesEdgeId: null,
        }] : [],
        assessment: {
          assessmentId: deterministicUuid(`askrigor:assessment:${spec.key}`),
          versionId: deterministicUuid(`askrigor:assessment-version:${spec.key}:v1`),
          rubric: spec.kind === "review" ? "review_method_v1" : "general_analysis_v1",
          rubricVersion: "1.0",
          assessorType: "model",
          assessorIdentifier: "AskRigor historical synthesis import",
          internalValidity: { status: "unclear", reason: "The complete source-specific method-domain audit is not durably available." },
          applicability: { status: "limitation_identified", reason: spec.activeRegistry ? "A no-results registry record is a research lead, not effect evidence." : "Population, injection implementation, comparators, and horizon must be matched before reuse." },
          disagreementState: spec.kind === "review" ? "unresolved" : "none_recorded",
          supersedesAssessmentVersionId: null,
        },
        freshnessPolicy: {
          policyId,
          sourceClass: spec.kind,
          cadenceDays: spec.activeRegistry ? 7 : 30,
          maximumAgeDays: spec.activeRegistry ? 7 : 30,
          ownerRole: "refresh_worker",
          requiredChecks: spec.activeRegistry ? ["registry status", "posted results", "linked publications"] : ["source identity", "correction or retraction metadata", "content/version changes"],
          failureBehavior: "mark_stale",
        },
        freshnessChecks: [{
          checkId: deterministicUuid(`askrigor:freshness-check:${spec.key}:historical-import`),
          policyId,
          checkedAt: "2026-08-21T00:00:00.000Z",
          outcome: "partial",
          projectionState: "stale",
          nextDueAt: null,
          receiptSha256: sha256(text),
          limitations: ["Historical import is intentionally stale pending a fresh source-specific check."],
        }],
        impactJob: null,
      },
    });
  }
  const registryInitial = relatedContributions.at(-1)!;
  const registryInitialClaim = registryInitial.knowledge!.claims[0]!;
  const syntheticText = "# Synthetic access-loss and invalidation event\n\nThis is a fixture-only event, not an observed change to NCT06793982. It proves that an inaccessible source can invalidate current use, preserve history, and complete dependency-impact accounting without overwriting the prior analysis.\n";
  const syntheticReceiptSha256 = sha256(syntheticText);
  const syntheticVersionId = deterministicUuid("askrigor:source-version:nct:NCT06793982:synthetic-inaccessible");
  const syntheticAnalysisVersionId = deterministicUuid("askrigor:analysis-version:nct:NCT06793982:synthetic-invalidation");
  const syntheticClaimVersionId = deterministicUuid("askrigor:claim-version:nct:NCT06793982:synthetic-invalidation");
  const syntheticReceiptId = deterministicUuid("askrigor:receipt:nct:NCT06793982:synthetic-invalidation");
  const syntheticContribution: LivingEvidenceContribution = {
    schemaVersion: 1,
    idempotencyKey: `synthetic-invalidation:nct-NCT06793982:${syntheticReceiptSha256}`,
    run: {
      runId: deterministicUuid("askrigor:run:nct:NCT06793982:synthetic-invalidation"),
      runKind: "synthetic_fixture",
      startedAt: "2026-08-29T17:00:00.000Z",
      completedAt: "2026-08-29T17:01:00.000Z",
      protocolManifests: [...CURRENT_PROTOCOLS],
      provenanceNote: "Explicit fixture-only access-loss event used to test invalidation and impact propagation; it is not a provider observation.",
    },
    topic,
    source: {
      ...registryInitial.source!,
      versionId: syntheticVersionId,
      accessStatus: "inaccessible",
      retrievedAt: "2026-08-29T17:00:30.000Z",
      sourceLocator: "synthetic-fixture:nct:NCT06793982:inaccessible",
    },
    analysis: {
      analysisId: registryInitial.analysis.analysisId,
      versionId: syntheticAnalysisVersionId,
      analysisKind: "invalidation",
      relationship: "invalidates",
      previousVersionId: registryInitial.analysis.versionId,
      captureStatus: "invalidation",
      authoredAt: "2026-08-29T17:01:00.000Z",
      coverageStatement: "Complete synthetic invalidation contribution; no claim is made that the external registry actually changed.",
      declaredWholeTextSha256: syntheticReceiptSha256,
      sections: [{ ordinal: 0, sectionKey: "000-synthetic-invalidation", title: "Synthetic invalidation", content: syntheticText }],
      domains: [],
      claimCapabilities: [{
        ordinal: 0,
        claim: "The fixture source remains usable as current evidence after its synthetic access-loss event.",
        capability: "cannot_support",
        reason: "The synthetic event intentionally invalidates current use while retaining history.",
        evidenceLocators: ["synthetic-fixture:nct:NCT06793982:inaccessible"],
      }],
      futureAnalysisItems: [],
    },
    receipts: [{
      receiptId: syntheticReceiptId,
      receiptKind: "synthetic_impact_fixture",
      receiptSha256: syntheticReceiptSha256,
      locator: null,
      details: { synthetic: true, provider_observation: false, source_body_included: false },
    }],
    knowledge: {
      question: null,
      topicEdges: [],
      claims: [{
        ...registryInitialClaim,
        versionId: syntheticClaimVersionId,
        normalizedAssertion: "Synthetic fixture state: the NCT06793982 record is inaccessible, so its prior no-results observation is not usable as current evidence.",
        direction: "descriptive",
        inferenceType: "unknown",
        capabilityState: "cannot_support",
        uncertaintyAndLimitations: ["This is an explicit synthetic event and not an observed external registry state."],
        status: "invalidated",
        supersedesClaimVersionId: registryInitialClaim.versionId,
      }],
      evidenceBindings: [{
        bindingId: deterministicUuid("askrigor:evidence-binding:nct:NCT06793982:synthetic-invalidation"),
        claimVersionId: syntheticClaimVersionId,
        sourceVersionId: syntheticVersionId,
        locator: "synthetic-fixture:nct:NCT06793982:inaccessible",
        polarity: "qualifies",
        extractionType: "metadata_only",
        capabilityCeiling: "cannot_support",
        validationReceiptId: syntheticReceiptId,
        limitations: ["Fixture-only state; no provider fact is asserted."],
      }],
      sourceEdges: [{
        edgeId: deterministicUuid("askrigor:source-edge:nct:NCT06793982:synthetic-update"),
        fromSourceVersionId: syntheticVersionId,
        toSourceVersionId: registryInitial.source!.versionId,
        relation: "updates",
        confidence: "verified",
        uncertainty: "Verified only as a synthetic repository event, not as an external registry update.",
        supersedesEdgeId: null,
      }],
      claimEdges: [{
        edgeId: deterministicUuid("askrigor:claim-edge:nct:NCT06793982:synthetic-supersession"),
        fromClaimVersionId: syntheticClaimVersionId,
        toClaimVersionId: registryInitialClaim.versionId,
        relation: "supersedes",
        confidence: "verified",
        uncertainty: "Fixture-only lineage.",
        supersedesEdgeId: null,
      }],
      assessment: {
        assessmentId: registryInitial.knowledge!.assessment!.assessmentId,
        versionId: deterministicUuid("askrigor:assessment-version:nct:NCT06793982:synthetic-invalidation"),
        rubric: "general_analysis_v1",
        rubricVersion: "1.0",
        assessorType: "deterministic_validator",
        assessorIdentifier: "AskRigor living-evidence pilot fixture validator",
        internalValidity: { status: "not_applicable", reason: "The source is synthetically inaccessible and not usable for a current methodological judgment." },
        applicability: { status: "not_applicable", reason: "The synthetic invalidation blocks current use." },
        disagreementState: "none_recorded",
        supersedesAssessmentVersionId: registryInitial.knowledge!.assessment!.versionId,
      },
      freshnessPolicy: null,
      freshnessChecks: [{
        checkId: deterministicUuid("askrigor:freshness-check:nct:NCT06793982:synthetic-invalidation"),
        policyId: registryInitial.knowledge!.freshnessPolicy!.policyId,
        checkedAt: "2026-08-29T17:00:30.000Z",
        outcome: "inaccessible",
        projectionState: "invalidated",
        nextDueAt: null,
        receiptSha256: syntheticReceiptSha256,
        limitations: ["Fixture-only state; no provider fact is asserted."],
      }],
      impactJob: {
        jobId: deterministicUuid("askrigor:impact-job:nct:NCT06793982:synthetic-invalidation"),
        status: "complete",
        affectedClaimVersionIds: [registryInitialClaim.versionId, syntheticClaimVersionId],
        impactReceiptSha256: syntheticReceiptSha256,
        failureCode: null,
      },
    },
  };
  return [reportContribution, hipOaContribution, studyContribution, ...relatedContributions, syntheticContribution];
}

export const HISTORICAL_PILOT_ANALYSIS_IDS = {
  topicSynthesis: REPORT_ANALYSIS_ID,
  cureusReview: CUREUS_ANALYSIS_ID,
};

export const HISTORICAL_PILOT_QUESTION_ID = QUESTION_ID;
