import type { Pool, PoolClient } from "pg";
import { z } from "zod";

import {
  assertSafeAtlasSchema,
  ATLAS_ERASED_TEXT,
  AtlasWriteConflict,
  atlasErasedIntentPayload,
  atlasPool,
  atlasRunId,
  atlasStateRequest,
  atlasWriterReceipt,
  planAtlasWrite,
  prepareStoredAtlasIntent,
  type AtlasCanonicalWriter,
  type AtlasFindingIntent,
  type AtlasFindingPromotionFailureCode,
  type AtlasFindingPromotionReceipt,
  type AtlasIntentErasure,
  type AtlasMadeWith,
  type AtlasPromotionStore,
  type AtlasPromotionUnit,
  type AtlasState,
  type AtlasStateFinding,
  type AtlasStateReader,
  type AtlasStateRequest,
  type AtlasStoredIntent,
  type AtlasVersionContent,
  type AtlasWritePlan,
  type AtlasWriterReceipt,
  type PostgresAtlasStoreOptions,
  type PreparedAtlasStoredIntent,
} from "./atlas-findings.js";

// Atlas phase 2, part A: the PostgreSQL canonical writer and reader (design section 3). The writer runs only in the
// one-shot admin container, as the migrator; the reader runs as the public runtime's SELECT-only reader role.

/**
 * The canonical writers' lock (the contribution writer takes it too). The Atlas writer takes it for its session before
 * the transaction begins, so the transaction's snapshot is taken after any other writer has committed.
 */
const WRITER_LOCK = "SELECT pg_advisory_lock(hashtextextended('askrigor:living-evidence-writer', 0))";
const WRITER_UNLOCK = "SELECT pg_advisory_unlock(hashtextextended('askrigor:living-evidence-writer', 0))";

const requestSchema = z.object({
  publicNumbers: z.array(z.string().regex(/^F-[1-9][0-9]{3,}$/u)).max(100).default([]),
  wordingKeys: z.array(z.string().regex(/^[a-f0-9]{64}$/u)).max(100).default([]),
  questions: z.array(z.object({
    topicKey: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,199}$/u),
    normalizedQuestion: z.string().min(1).max(2_000),
  }).strict()).max(20).default([]),
  identifiers: z.array(z.object({
    scheme: z.enum(["doi", "pmid", "pmcid", "nct"]),
    value: z.string().min(1).max(2_048),
  }).strict()).max(100).default([]),
  topicKeys: z.array(z.string().regex(/^[a-z0-9][a-z0-9._-]{0,199}$/u)).max(100).default([]),
  replacesGraph: z.boolean().default(false),
  questionUsesOf: z.array(z.string().regex(/^F-[1-9][0-9]{3,}$/u)).max(100).default([]),
}).strict();

interface LinkRow {
  link_id: string;
  from_finding_id: string;
  to_finding_id: string;
  relation: AtlasState["links"][number]["relation"];
  disagreement: string | null;
  withdrawn: boolean;
}

/**
 * What the canonical store holds for a request, inside the caller's transaction (the reader's read-only snapshot or
 * the writer's, under its lock): the findings the request names by number, wording key, exact question or shared
 * source family; every finding linked to them, and each of those findings' contradicts partners, with every link of
 * all of them (the context labels need); the topics named or used; and the source families the identifiers name.
 */
export async function readAtlasStateWith(client: PoolClient, request: AtlasStateRequest): Promise<AtlasState> {
  const parsed = requestSchema.parse(request);
  const seeds = new Set<string>();
  const seed = (rows: Array<{ finding_id: string }>) => {
    for (const { finding_id: id } of rows) seeds.add(id);
  };
  if (parsed.publicNumbers.length > 0) {
    seed((await client.query<{ finding_id: string }>(
      "SELECT finding_id FROM atlas_findings WHERE public_number = ANY($1::text[])",
      [parsed.publicNumbers],
    )).rows);
  }
  if (parsed.wordingKeys.length > 0) {
    seed((await client.query<{ finding_id: string }>(
      `SELECT DISTINCT finding_id FROM atlas_finding_versions
        WHERE card_wording_key = ANY($1::bpchar[]) OR accepted_wording_key = ANY($1::bpchar[])`,
      [parsed.wordingKeys],
    )).rows);
  }
  const questions: AtlasState["questions"] = [];
  for (const question of parsed.questions) {
    const found = await client.query<{ question_id: string; topic_id: string; normalized_question: string }>(
      `SELECT question.question_id, question.topic_id, question.normalized_question
         FROM questions question
         JOIN topics topic ON topic.topic_id = question.topic_id
        WHERE topic.canonical_key = $1 AND question.normalized_question = $2
          AND question.population IS NULL AND question.program_or_exposure IS NULL
          AND question.comparator IS NULL AND question.outcome IS NULL
          AND question.horizon IS NULL AND question.setting IS NULL
        ORDER BY question.question_id`,
      [question.topicKey, question.normalizedQuestion],
    );
    for (const row of found.rows) {
      questions.push({ questionId: row.question_id, topicId: row.topic_id, normalizedQuestion: row.normalized_question });
    }
    if (found.rows.length > 0) {
      seed((await client.query<{ finding_id: string }>(
        `SELECT finding.finding_id FROM atlas_findings finding
           JOIN claims claim ON claim.claim_id = finding.claim_id
          WHERE claim.question_id = ANY($1::uuid[])`,
        [found.rows.map(({ question_id: id }) => id)],
      )).rows);
    }
  }
  // An erasure weighs who else uses the finding's question (decision 7): every Atlas finding that answers it joins the
  // state, and the claims no Atlas finding holds and the research frontiers that ask it are counted.
  let questionUses: AtlasState["questionUses"];
  if (parsed.questionUsesOf.length > 0) {
    const used = await client.query<{ question_id: string; text: string; non_atlas_uses: number }>(
      `SELECT question.question_id, question.normalized_question AS text,
              ((SELECT count(*) FROM claims other
                 WHERE other.question_id = question.question_id
                   AND NOT EXISTS (SELECT 1 FROM atlas_findings held WHERE held.claim_id = other.claim_id))
               + (SELECT count(*) FROM research_frontiers frontier
                   WHERE frontier.question_id = question.question_id))::int AS non_atlas_uses
         FROM questions question
        WHERE question.question_id IN (
                SELECT claim.question_id FROM atlas_findings finding
                  JOIN claims claim ON claim.claim_id = finding.claim_id
                 WHERE finding.public_number = ANY($1::text[])
              )
        ORDER BY question.question_id`,
      [parsed.questionUsesOf],
    );
    questionUses = used.rows.map((row) =>
      ({ questionId: row.question_id, text: row.text, nonAtlasUses: Number(row.non_atlas_uses) }));
    if (used.rows.length > 0) {
      seed((await client.query<{ finding_id: string }>(
        `SELECT finding.finding_id FROM atlas_findings finding
           JOIN claims claim ON claim.claim_id = finding.claim_id
          WHERE claim.question_id = ANY($1::uuid[])`,
        [used.rows.map(({ question_id: id }) => id)],
      )).rows);
    }
  }
  let namedFamilyIds: string[] = [];
  if (parsed.identifiers.length > 0) {
    namedFamilyIds = (await client.query<{ family_id: string }>(
      `SELECT DISTINCT identifier.family_id
         FROM source_identifiers identifier
         JOIN unnest($1::text[], $2::text[]) AS requested(scheme, canonical_value)
           ON requested.scheme = identifier.scheme AND requested.canonical_value = identifier.canonical_value`,
      [parsed.identifiers.map(({ scheme }) => scheme), parsed.identifiers.map(({ value }) => value)],
    )).rows.map(({ family_id: id }) => id);
    if (namedFamilyIds.length > 0) {
      seed((await client.query<{ finding_id: string }>(
        `SELECT DISTINCT version.finding_id
           FROM atlas_finding_versions version
           JOIN evidence_bindings binding ON binding.claim_version_id = version.claim_version_id
           JOIN source_versions source ON source.version_id = binding.source_version_id
          WHERE source.family_id = ANY($1::uuid[])`,
        [namedFamilyIds],
      )).rows);
    }
  }

  const links = new Map<string, LinkRow>();
  const readLinks = async (findingIds: string[]) => {
    if (findingIds.length === 0) return;
    const rows = await client.query<LinkRow>(
      `SELECT link.link_id, link.from_finding_id, link.to_finding_id, link.relation, link.disagreement,
              EXISTS (
                SELECT 1 FROM atlas_finding_link_withdrawals withdrawal WHERE withdrawal.link_id = link.link_id
              ) AS withdrawn
         FROM atlas_finding_links link
        WHERE link.from_finding_id = ANY($1::uuid[]) OR link.to_finding_id = ANY($1::uuid[])`,
      [findingIds],
    );
    for (const row of rows.rows) links.set(row.link_id, row);
  };
  await readLinks([...seeds]);
  const linked = new Set(seeds);
  for (const link of links.values()) {
    linked.add(link.from_finding_id);
    linked.add(link.to_finding_id);
  }
  await readLinks([...linked].filter((id) => !seeds.has(id)));
  const partners = new Set(linked);
  for (const link of links.values()) {
    if (link.relation !== "contradicts" || link.withdrawn) continue;
    if (linked.has(link.from_finding_id)) partners.add(link.to_finding_id);
    if (linked.has(link.to_finding_id)) partners.add(link.from_finding_id);
  }
  await readLinks([...partners].filter((id) => !linked.has(id)));

  const findings = await readFindings(client, [...partners]);
  const topics = await client.query<{ topic_id: string; canonical_key: string; label: string }>(
    `SELECT topic_id, canonical_key, label FROM topics
      WHERE canonical_key = ANY($1::text[]) OR topic_id = ANY($2::uuid[])
      ORDER BY canonical_key`,
    [parsed.topicKeys, [...new Set(findings.map(({ topicId }) => topicId))]],
  );
  const boundFamilyIds = findings.flatMap(({ versions }) => versions.flatMap(({ bindings }) =>
    bindings.map(({ familyId }) => familyId)));
  const families = await client.query<{
    family_id: string;
    source_kind: string;
    identity_hash: string;
    display_title: string;
    identifiers: Array<{ scheme: string; value: string }>;
  }>(
    `SELECT family.family_id, family.source_kind, family.identity_hash::text, family.display_title,
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object('scheme', identifier.scheme, 'value', identifier.canonical_value)
                ORDER BY identifier.scheme, identifier.canonical_value)
                FROM source_identifiers identifier WHERE identifier.family_id = family.family_id
            ), '[]'::jsonb) AS identifiers
       FROM source_families family
      WHERE family.family_id = ANY($1::uuid[])
      ORDER BY family.family_id`,
    [[...new Set([...namedFamilyIds, ...boundFamilyIds])]],
  );
  const sourceVersions = namedFamilyIds.length === 0 ? [] : (await client.query<{
    version_id: string;
    family_id: string;
    retrieved_at: Date;
  }>(
    `SELECT version_id, family_id, retrieved_at FROM source_versions
      WHERE family_id = ANY($1::uuid[]) AND access_status = 'metadata_only'
        AND source_content_sha256 IS NULL AND retrieved_at IS NOT NULL
      ORDER BY family_id, retrieved_at, version_id`,
    [namedFamilyIds],
  )).rows;
  const replacesLinks = !parsed.replacesGraph ? null : (await client.query<{ from_finding_id: string; to_finding_id: string }>(
    `SELECT link.from_finding_id, link.to_finding_id FROM atlas_finding_links link
      WHERE link.relation = 'replaces'
        AND NOT EXISTS (SELECT 1 FROM atlas_finding_link_withdrawals withdrawal WHERE withdrawal.link_id = link.link_id)
      ORDER BY link.link_id`,
  )).rows.map((row) => ({ fromFindingId: row.from_finding_id, toFindingId: row.to_finding_id }));

  return {
    findings,
    links: [...links.values()]
      .sort((left, right) => left.link_id.localeCompare(right.link_id))
      .map((row) => ({
        linkId: row.link_id,
        fromFindingId: row.from_finding_id,
        toFindingId: row.to_finding_id,
        relation: row.relation,
        disagreement: row.disagreement,
        withdrawn: row.withdrawn,
      })),
    replacesLinks,
    topics: topics.rows.map((row) => ({ topicId: row.topic_id, canonicalKey: row.canonical_key, label: row.label })),
    questions,
    sourceFamilies: families.rows.map((row) => ({
      familyId: row.family_id,
      sourceKind: row.source_kind,
      identityHash: row.identity_hash,
      displayTitle: row.display_title,
      identifiers: row.identifiers,
    })),
    sourceVersions: sourceVersions.map((row) => ({
      versionId: row.version_id,
      familyId: row.family_id,
      retrievedAt: new Date(row.retrieved_at).toISOString(),
    })),
    ...(questionUses === undefined ? {} : { questionUses }),
  };
}

async function readFindings(client: PoolClient, findingIds: string[]): Promise<AtlasStateFinding[]> {
  if (findingIds.length === 0) return [];
  const findings = await client.query<{
    finding_id: string;
    public_number: string;
    claim_id: string;
    question_id: string;
    topic_id: string;
    entry_kind: "finding" | "lead";
    lead_origin: "unverified_finding" | "open_lead" | null;
  }>(
    `SELECT finding.finding_id, finding.public_number, finding.claim_id, claim.question_id, question.topic_id,
            finding.entry_kind, finding.lead_origin
       FROM atlas_findings finding
       JOIN claims claim ON claim.claim_id = finding.claim_id
       JOIN questions question ON question.question_id = claim.question_id
      WHERE finding.finding_id = ANY($1::uuid[])
      ORDER BY finding.public_number`,
    [findingIds],
  );
  const versions = await client.query<{
    finding_id: string;
    claim_version_id: string;
    version_number: number;
    status: string;
    normalized_assertion: string;
    population: string | null;
    certainty: AtlasVersionContent["certainty"];
    usual_answer: string | null;
    why_not_usual: string | null;
    what_would_change_it: string | null;
    who_else: string | null;
    what_it_changes: string | null;
    tags: AtlasVersionContent["tags"];
    verified_bases: AtlasVersionContent["verifiedBases"];
    numbers: AtlasVersionContent["numbers"];
    kind: NonNullable<AtlasVersionContent["kind"]> | null;
    program_or_exposure: string | null;
    subject_type: NonNullable<AtlasVersionContent["subjectType"]> | null;
    direction: NonNullable<AtlasVersionContent["direction"]> | "unclear";
    search_scope: NonNullable<AtlasVersionContent["searchScope"]> | null;
    research_checked_on: string;
    made_with: AtlasMadeWith;
    card_wording_key: string | null;
    accepted_wording_key: string | null;
    edited_at_acceptance: boolean;
    erased: boolean;
  }>(
    `SELECT version.finding_id, version.claim_version_id, version.version_number, claimed.status,
            claimed.normalized_assertion, claimed.population, version.certainty, version.usual_answer,
            version.why_not_usual, version.what_would_change_it, version.who_else, version.what_it_changes,
            version.tags, version.verified_bases, version.numbers, version.kind, claimed.program_or_exposure,
            version.subject_type, claimed.direction, version.search_scope,
            to_char(version.research_checked_on, 'YYYY-MM-DD') AS research_checked_on, version.made_with,
            version.card_wording_key::text, version.accepted_wording_key::text, version.edited_at_acceptance,
            EXISTS (
              SELECT 1 FROM atlas_redactions redaction WHERE redaction.claim_version_id = version.claim_version_id
            ) AS erased
       FROM atlas_finding_versions version
       JOIN claim_versions claimed ON claimed.version_id = version.claim_version_id
      WHERE version.finding_id = ANY($1::uuid[])
      ORDER BY version.finding_id, version.version_number`,
    [findingIds],
  );
  const bindings = await client.query<{
    claim_version_id: string;
    source_version_id: string;
    family_id: string;
    locator: string;
    polarity: string;
    capability_ceiling: string;
    limitations: string[];
  }>(
    `SELECT binding.claim_version_id, binding.source_version_id, source.family_id, binding.locator,
            binding.polarity, binding.capability_ceiling, binding.limitations
       FROM evidence_bindings binding
       JOIN source_versions source ON source.version_id = binding.source_version_id
      WHERE binding.claim_version_id = ANY($1::uuid[])
      ORDER BY binding.claim_version_id, binding.locator, binding.source_version_id`,
    [versions.rows.map(({ claim_version_id: id }) => id)],
  );
  return findings.rows.map((finding) => ({
    findingId: finding.finding_id,
    publicNumber: finding.public_number,
    claimId: finding.claim_id,
    questionId: finding.question_id,
    topicId: finding.topic_id,
    entryKind: finding.entry_kind,
    leadOrigin: finding.lead_origin,
    versions: versions.rows
      .filter((version) => version.finding_id === finding.finding_id)
      .map((version) => ({
        claimVersionId: version.claim_version_id,
        versionNumber: Number(version.version_number),
        status: version.status,
        content: {
          wording: version.normalized_assertion,
          appliesTo: version.population,
          certainty: version.certainty,
          usualAnswer: version.usual_answer,
          whyNotUsual: version.why_not_usual,
          whatWouldChangeIt: version.what_would_change_it,
          whoElse: version.who_else,
          whatItChanges: version.what_it_changes,
          tags: version.tags,
          verifiedBases: version.verified_bases,
          numbers: version.numbers,
          // Atlas phase 3: a field the version did not declare is left out, as the intent left it out; a version with
          // no direction holds claim_versions' unclear.
          ...(version.kind === null ? {} : { kind: version.kind }),
          ...(version.program_or_exposure === null ? {} : { subject: version.program_or_exposure }),
          ...(version.subject_type === null ? {} : { subjectType: version.subject_type }),
          ...(version.direction === "unclear" ? {} : { direction: version.direction }),
          ...(version.search_scope === null ? {} : { searchScope: version.search_scope }),
        },
        researchCheckedOn: version.research_checked_on,
        madeWith: version.made_with,
        cardWordingKey: version.card_wording_key,
        acceptedWordingKey: version.accepted_wording_key,
        editedAtAcceptance: version.edited_at_acceptance,
        erased: version.erased,
        bindings: bindings.rows
          .filter((binding) => binding.claim_version_id === version.claim_version_id)
          .map((binding) => ({
            sourceVersionId: binding.source_version_id,
            familyId: binding.family_id,
            locator: binding.locator,
            polarity: binding.polarity,
            capabilityCeiling: binding.capability_ceiling,
            limitations: binding.limitations,
          })),
      })),
  }));
}

/** Inserts every row of a plan, in foreign-key order, inside the caller's transaction. */
async function executeAtlasPlan(client: PoolClient, plan: AtlasWritePlan, appliedAt: string): Promise<void> {
  const runId = plan.run.runId;
  await client.query(
    `INSERT INTO research_runs
       (run_id, run_kind, started_at, completed_at, protocol_manifest_sha256s, provenance_note)
     VALUES ($1, $2, $3, $3, $4::jsonb, $5)`,
    [runId, plan.run.runKind, plan.decidedAt, JSON.stringify(plan.run.protocolManifestSha256s), plan.run.provenanceNote],
  );
  await client.query(
    `INSERT INTO atlas_intent_applications (intent_id, intent_kind, public_number, payload_sha256, run_id, applied_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [plan.intent.intentId, plan.intent.intentKind, plan.intent.publicNumber, plan.intent.payloadSha256, runId, appliedAt],
  );
  if (plan.topic !== null) {
    await client.query(
      "INSERT INTO topics (topic_id, canonical_key, label) VALUES ($1, $2, $3)",
      [plan.topic.topicId, plan.topic.canonicalKey, plan.topic.label],
    );
  }
  if (plan.question !== null) {
    await client.query(
      `INSERT INTO questions
         (question_id, topic_id, normalized_question, population, program_or_exposure, comparator, outcome, horizon,
          setting, created_by_run_id)
       VALUES ($1, $2, $3, NULL, NULL, NULL, NULL, NULL, NULL, $4)`,
      [plan.question.questionId, plan.question.topicId, plan.question.normalizedQuestion, runId],
    );
  }
  if (plan.claim !== null) {
    // Atlas phase 3: the claim type the first version's kind gives (other without one, as in phase 2).
    await client.query(
      "INSERT INTO claims (claim_id, question_id, claim_type) VALUES ($1, $2, $3)",
      [plan.claim.claimId, plan.claim.questionId, plan.claim.claimType],
    );
  }
  if (plan.finding !== null) {
    await client.query(
      `INSERT INTO atlas_findings (finding_id, public_number, claim_id, entry_kind, lead_origin, created_by_run_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [plan.finding.findingId, plan.finding.publicNumber, plan.finding.claimId, plan.finding.entryKind,
        plan.finding.leadOrigin, runId],
    );
  }
  for (const family of plan.sourceFamilies) {
    await client.query(
      "INSERT INTO source_families (family_id, source_kind, identity_hash, display_title) VALUES ($1, $2, $3, $4)",
      [family.familyId, family.sourceKind, family.identityHash, family.displayTitle],
    );
  }
  for (const identifier of plan.sourceIdentifiers) {
    await client.query(
      "INSERT INTO source_identifiers (family_id, scheme, canonical_value) VALUES ($1, $2, $3)",
      [identifier.familyId, identifier.scheme, identifier.value],
    );
  }
  for (const version of plan.sourceVersions) {
    await client.query(
      `INSERT INTO source_versions
         (version_id, family_id, source_content_sha256, access_status, retrieved_at, source_locator,
          raw_content_persisted)
       VALUES ($1, $2, NULL, 'metadata_only', $3, NULL, false)`,
      [version.versionId, version.familyId, version.retrievedAt],
    );
  }
  for (const { checkId, familyId, check } of plan.sourceChecks) {
    await client.query(
      `INSERT INTO atlas_source_checks
         (check_id, source_family_id, provider, title, published_year, retraction_status, notices, owner_confirmed,
          envelope_sha256, checked_at, run_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)`,
      [checkId, familyId, check.provider, check.title, check.publishedYear, check.retractionStatus,
        JSON.stringify(check.notices), check.ownerConfirmed, check.envelopeSha256, check.checkedAt, runId],
    );
  }
  for (const version of plan.versions) {
    // Atlas phase 3: the subject is the claim's program_or_exposure and the direction its own column, which 0001's
    // claim model already has; a version without them keeps NULL and unclear, as in phase 2.
    await client.query(
      `INSERT INTO claim_versions
         (version_id, claim_id, created_by_run_id, normalized_assertion, population, program_or_exposure,
          comparator, outcome, horizon, setting, direction, inference_type, capability_state,
          uncertainty_and_limitations, status, supersedes_claim_version_id)
       VALUES ($1, $2, $3, $4, $5, $9, NULL, NULL, NULL, NULL, $10, 'unknown', $6, '[]'::jsonb, $7, $8)`,
      [
        version.claimVersionId, version.claimId, runId, version.content.wording, version.content.appliesTo,
        version.content.verifiedBases.length > 0 ? "can_support" : "uncertain", version.status,
        version.supersedesClaimVersionId, version.content.subject ?? null, version.content.direction ?? "unclear",
      ],
    );
    // And the kind, the subject type and the searches that found nothing, in migration 0018's columns.
    await client.query(
      `INSERT INTO atlas_finding_versions
         (claim_version_id, finding_id, version_number, certainty, usual_answer, why_not_usual, what_would_change_it,
          who_else, what_it_changes, tags, verified_bases, numbers, research_checked_on, made_with, card_wording_key,
          accepted_wording_key, edited_at_acceptance, kind, subject_type, search_scope)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14::jsonb, $15, $16, $17,
               $18, $19, $20::jsonb)`,
      [
        version.claimVersionId, version.findingId, version.versionNumber, version.content.certainty,
        version.content.usualAnswer, version.content.whyNotUsual, version.content.whatWouldChangeIt,
        version.content.whoElse, version.content.whatItChanges, JSON.stringify(version.content.tags),
        JSON.stringify(version.content.verifiedBases), JSON.stringify(version.content.numbers),
        version.researchCheckedOn, JSON.stringify(version.madeWith), version.cardWordingKey,
        version.acceptedWordingKey, version.editedAtAcceptance, version.content.kind ?? null,
        version.content.subjectType ?? null,
        version.content.searchScope === undefined ? null : JSON.stringify(version.content.searchScope),
      ],
    );
  }
  for (const binding of plan.bindings) {
    await client.query(
      `INSERT INTO evidence_bindings
         (binding_id, claim_version_id, source_version_id, locator, polarity, extraction_type, capability_ceiling,
          validation_receipt_id, limitations, created_by_run_id)
       VALUES ($1, $2, $3, $4, $5, 'authored_synthesis', $6, NULL, $7::jsonb, $8)`,
      [
        binding.bindingId, binding.claimVersionId, binding.sourceVersionId, binding.locator, binding.polarity,
        binding.capabilityCeiling, JSON.stringify(binding.limitations), runId,
      ],
    );
  }
  for (const link of plan.links) {
    await client.query(
      `INSERT INTO claim_edges
         (edge_id, from_claim_version_id, to_claim_version_id, relation, confidence, uncertainty, supersedes_edge_id,
          created_by_run_id)
       VALUES ($1, $2, $3, $4, 'verified', NULL, NULL, $5)`,
      [link.claimEdge.edgeId, link.claimEdge.fromClaimVersionId, link.claimEdge.toClaimVersionId,
        link.claimEdge.relation, runId],
    );
    await client.query(
      `INSERT INTO atlas_finding_links
         (link_id, from_finding_id, relation, to_finding_id, disagreement, rationale, claim_edge_id, decided_at, run_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [link.linkId, link.fromFindingId, link.relation, link.toFindingId, link.disagreement, link.rationale,
        link.claimEdge.edgeId, plan.decidedAt, runId],
    );
  }
  for (const withdrawal of plan.linkWithdrawals) {
    await client.query(
      `INSERT INTO atlas_finding_link_withdrawals (link_id, public_note, decided_at, run_id)
       VALUES ($1, $2, $3, $4)`,
      [withdrawal.linkId, withdrawal.publicNote, plan.decidedAt, runId],
    );
  }
  // Decision 7: each redaction row, then the one function the guard lets change wording replaces what it covers.
  for (const redaction of plan.redactions) {
    await client.query(
      `INSERT INTO atlas_redactions (redaction_id, finding_id, claim_version_id, reason_code, decided_at, run_id)
       VALUES ($1, $2, $3, 'could_identify_a_person', $4, $5)`,
      [redaction.redactionId, redaction.findingId, redaction.claimVersionId, plan.decidedAt, runId],
    );
  }
  for (const redaction of plan.redactions) {
    await client.query("SELECT erase_atlas_wording($1::uuid)", [redaction.redactionId]);
  }
  for (const change of plan.changes) {
    await client.query(
      `INSERT INTO atlas_finding_changes
         (change_id, finding_id, intent_id, change_kind, claim_version_id, label_before, label_after, public_note,
          link_id, research_checked_on, decided_at, run_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        change.changeId, change.findingId, plan.intent.intentId, change.changeKind, change.claimVersionId,
        change.labelBefore, change.labelAfter, change.publicNote, change.linkId, change.researchCheckedOn,
        plan.decidedAt, runId,
      ],
    );
  }
  await client.query(
    `INSERT INTO repository_events
       (event_id, event_kind, run_id, analysis_id, version_id, payload_sha256, event_at, details)
     VALUES ($1, $2, $3, NULL, NULL, $4, $5, $6::jsonb)`,
    [plan.event.eventId, plan.event.eventKind, runId, plan.intent.payloadSha256, plan.decidedAt,
      JSON.stringify(plan.event.details)],
  );
}

/** The receipt of an intent the writer already applied, from the rows its run wrote. */
async function replayReceipt(client: PoolClient, intent: PreparedAtlasStoredIntent): Promise<AtlasWriterReceipt> {
  const runId = atlasRunId(intent.intentId);
  const findings = await client.query<{ finding_id: string }>(
    "SELECT finding_id FROM atlas_findings WHERE created_by_run_id = $1",
    [runId],
  );
  const versions = await client.query<{ finding_id: string; claim_version_id: string }>(
    `SELECT version.finding_id, version.claim_version_id FROM atlas_finding_versions version
       JOIN claim_versions claimed ON claimed.version_id = version.claim_version_id
      WHERE claimed.created_by_run_id = $1`,
    [runId],
  );
  const changes = await client.query<{ change_id: string; finding_id: string }>(
    "SELECT change_id, finding_id FROM atlas_finding_changes WHERE run_id = $1",
    [runId],
  );
  const links = await client.query<{ link_id: string }>(
    `SELECT link_id FROM atlas_finding_links WHERE run_id = $1
     UNION SELECT link_id FROM atlas_finding_link_withdrawals WHERE run_id = $1`,
    [runId],
  );
  const checks = await client.query<{ source_family_id: string }>(
    "SELECT source_family_id FROM atlas_source_checks WHERE run_id = $1",
    [runId],
  );
  const redactions = await client.query<{ finding_id: string; claim_version_id: string }>(
    "SELECT finding_id, claim_version_id FROM atlas_redactions WHERE run_id = $1",
    [runId],
  );
  return atlasWriterReceipt({
    status: "idempotent_replay",
    intent,
    findingIds: [
      ...findings.rows.map(({ finding_id: id }) => id),
      ...versions.rows.map(({ finding_id: id }) => id),
      ...changes.rows.map(({ finding_id: id }) => id),
      ...redactions.rows.map(({ finding_id: id }) => id),
    ],
    claimVersionIds: [
      ...versions.rows.map(({ claim_version_id: id }) => id),
      ...redactions.rows.map(({ claim_version_id: id }) => id),
    ],
    changeIds: changes.rows.map(({ change_id: id }) => id),
    linkIds: links.rows.map(({ link_id: id }) => id),
    sourceFamilyIds: checks.rows.map(({ source_family_id: id }) => id),
  });
}

/**
 * Applies one prepared intent inside the caller's SERIALIZABLE transaction, which holds the writer lock: an intent
 * already applied is replayed from its rows; otherwise the canonical state is read, planned against and written.
 */
export async function applyAtlasIntentWith(
  client: PoolClient,
  intent: PreparedAtlasStoredIntent,
  appliedAt: string,
): Promise<AtlasWriterReceipt> {
  const applied = await client.query<{ intent_kind: string; public_number: string; payload_sha256: string }>(
    "SELECT intent_kind, public_number, payload_sha256::text FROM atlas_intent_applications WHERE intent_id = $1",
    [intent.intentId],
  );
  if (applied.rowCount !== 0) {
    const row = applied.rows[0]!;
    if (row.intent_kind !== intent.intentKind || row.public_number !== intent.publicNumber ||
      row.payload_sha256 !== intent.payloadSha256) {
      throw new AtlasWriteConflict("ATLAS_INTENT_APPLICATION_MISMATCH");
    }
    return replayReceipt(client, intent);
  }
  const state = await readAtlasStateWith(client, atlasStateRequest(intent));
  const plan = planAtlasWrite(intent, state);
  await executeAtlasPlan(client, plan, appliedAt);
  if (intent.payload.kind === "erase" && plan.redactions.length > 0) {
    await eraseIntentTextsWith(client, {
      publicNumber: intent.publicNumber,
      scope: intent.payload.scope,
      version: intent.payload.version,
      questionErased: false,
    }, appliedAt);
  }
  return plan.receipt;
}

/**
 * Decision 7, in the erasure's transaction: sets to the fixed marker, in every intent that names the finding and is not
 * pending, the texts the erasure removed (atlasErasedIntentPayload()), and marks when. Such a payload no longer matches
 * its hash; texts_erased_at says why. The question's text says whether it was erased.
 */
async function eraseIntentTextsWith(client: PoolClient, erasure: AtlasIntentErasure, at: string): Promise<void> {
  const question = await client.query<{ text: string }>(
    `SELECT question.normalized_question AS text FROM atlas_findings finding
       JOIN claims claim ON claim.claim_id = finding.claim_id
       JOIN questions question ON question.question_id = claim.question_id
      WHERE finding.public_number = $1`,
    [erasure.publicNumber],
  );
  const applied = { ...erasure, questionErased: question.rows[0]?.text === ATLAS_ERASED_TEXT };
  const intents = await client.query<{
    intent_id: string;
    public_number: string;
    status: "COMPLETED" | "FAILED";
    payload_json: AtlasFindingIntent;
  }>(
    `SELECT intent_id, public_number, status, payload_json FROM atlas_finding_intents
      WHERE status <> 'PENDING'
        AND (public_number = $1
             OR (intent_kind IN ('link', 'unlink') AND payload_json ->> 'toPublicNumber' = $1))
      ORDER BY queue_position`,
    [erasure.publicNumber],
  );
  for (const row of intents.rows) {
    const payload = atlasErasedIntentPayload(
      { publicNumber: row.public_number, status: row.status, payload: row.payload_json },
      applied,
    );
    if (payload === undefined) continue;
    await client.query(
      `UPDATE atlas_finding_intents
          SET payload_json = $2::jsonb, texts_erased_at = coalesce(texts_erased_at, $3::timestamptz)
        WHERE intent_id = $1::uuid AND status <> 'PENDING'`,
      [row.intent_id, JSON.stringify(payload), at],
    );
  }
}

async function setSearchPath(client: PoolClient, schema: string): Promise<void> {
  await client.query(`SET search_path TO ${schema}, public`);
  await client.query("SET TIME ZONE 'UTC'");
}

/** Ends a writer session: the transaction (COMMIT or ROLLBACK), then the session's writer lock, then the client. */
async function endWriterSession(
  client: PoolClient,
  statement: "COMMIT" | "ROLLBACK" | null,
  locked: boolean,
): Promise<void> {
  let failure: unknown;
  if (statement !== null) {
    try {
      await client.query(statement);
    } catch (error) {
      failure = error;
    }
  }
  if (locked) {
    try {
      await client.query(WRITER_UNLOCK);
    } catch (error) {
      failure ??= error;
    }
  }
  client.release(failure instanceof Error ? failure : undefined);
  if (failure !== undefined && statement === "COMMIT") throw failure;
}

/**
 * Runs work in one SERIALIZABLE transaction that holds the writer lock, then commits it; on any error it rolls back.
 * The client is ended (and released) exactly once either way.
 */
async function withinWriterTransaction<T>(
  client: PoolClient,
  schema: string,
  work: () => Promise<T>,
): Promise<T> {
  let locked = false;
  let begun = false;
  let result: T;
  try {
    await setSearchPath(client, schema);
    await client.query(WRITER_LOCK);
    locked = true;
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    begun = true;
    result = await work();
  } catch (error) {
    await endWriterSession(client, begun ? "ROLLBACK" : null, locked).catch(() => undefined);
    throw error;
  }
  await endWriterSession(client, "COMMIT", true);
  return result;
}

/** The canonical Atlas writer, standalone: one intent in its own SERIALIZABLE transaction under the writer lock. */
export class PostgresAtlasWriter implements AtlasCanonicalWriter {
  readonly schema: string;
  private readonly pool: Pool;
  private readonly now: () => string;

  constructor(options: PostgresAtlasStoreOptions, runtime: { now?: () => string } = {}) {
    this.schema = assertSafeAtlasSchema(options.schema ?? "living_evidence");
    this.pool = atlasPool(options);
    this.now = runtime.now ?? (() => new Date().toISOString());
  }

  async contributeAtlasFinding(intent: AtlasStoredIntent): Promise<AtlasWriterReceipt> {
    const prepared = prepareStoredAtlasIntent(intent);
    const client = await this.pool.connect();
    return withinWriterTransaction(client, this.schema, () => applyAtlasIntentWith(client, prepared, this.now()));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/** The canonical Atlas reader: one read-only snapshot. The public runtime's SELECT-only reader role is enough. */
export class PostgresAtlasReader implements AtlasStateReader {
  readonly schema: string;
  private readonly pool: Pool;

  constructor(options: PostgresAtlasStoreOptions) {
    this.schema = assertSafeAtlasSchema(options.schema ?? "living_evidence");
    this.pool = atlasPool(options);
  }

  async readAtlasState(request: AtlasStateRequest): Promise<AtlasState> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await setSearchPath(client, this.schema);
      const state = await readAtlasStateWith(client, request);
      await client.query("COMMIT");
      return state;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

interface PendingIntentRow {
  intent_id: string;
  intent_kind: AtlasStoredIntent["intentKind"];
  public_number: string;
  payload_json: unknown;
  payload_sha256: string;
  created_at: Date | string;
}

function isPgCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

/**
 * The runner's queue in PostgreSQL. One activation's pass is one SERIALIZABLE transaction that holds the writer lock
 * and the oldest pending intent's row lock (FOR UPDATE NOWAIT: the order is strictly first in, first out, so another
 * activation holding it stops this one rather than skipping it). The canonical write runs in a savepoint inside it,
 * and the intent's COMPLETED receipt or FAILED code commits with it, so a pass is atomic. An intent the writer already
 * applied (by a direct call) is completed through the writer's idempotent replay.
 */
export class PostgresAtlasPromotionStore implements AtlasPromotionStore {
  readonly schema: string;
  private readonly pool: Pool;

  constructor(options: PostgresAtlasStoreOptions) {
    this.schema = assertSafeAtlasSchema(options.schema ?? "living_evidence");
    this.pool = atlasPool(options);
  }

  async begin(): Promise<AtlasPromotionUnit | "none" | "busy"> {
    const client = await this.pool.connect();
    let locked = false;
    let begun = false;
    let outcome: { end: "COMMIT" | "ROLLBACK"; result: "none" | "busy" } | { row: PendingIntentRow };
    try {
      await setSearchPath(client, this.schema);
      await client.query(WRITER_LOCK);
      locked = true;
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      begun = true;
      try {
        const selected = await client.query<PendingIntentRow>(
          `SELECT intent_id, intent_kind, public_number, payload_json, payload_sha256::text, created_at
             FROM atlas_finding_intents
            WHERE status = 'PENDING'
            ORDER BY queue_position
            LIMIT 1
            FOR UPDATE NOWAIT`,
        );
        outcome = selected.rowCount === 0 ? { end: "COMMIT", result: "none" } : { row: selected.rows[0]! };
      } catch (error) {
        if (!isPgCode(error, "55P03")) throw error;
        outcome = { end: "ROLLBACK", result: "busy" };
      }
    } catch (error) {
      await endWriterSession(client, begun ? "ROLLBACK" : null, locked).catch(() => undefined);
      throw error;
    }
    if ("result" in outcome) {
      await endWriterSession(client, outcome.end, true);
      return outcome.result;
    }
    const row = outcome.row;
    return new PostgresAtlasPromotionUnit(client, {
      intentId: row.intent_id,
      intentKind: row.intent_kind,
      publicNumber: row.public_number,
      payload: row.payload_json,
      payloadSha256: row.payload_sha256,
      createdAt: new Date(row.created_at).toISOString(),
    });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

class PostgresAtlasPromotionUnit implements AtlasPromotionUnit {
  private finished = false;

  constructor(private readonly client: PoolClient, readonly intent: AtlasStoredIntent) {}

  async apply(intent: PreparedAtlasStoredIntent, appliedAt: string): Promise<AtlasWriterReceipt> {
    await this.client.query("SAVEPOINT atlas_write");
    try {
      const receipt = await applyAtlasIntentWith(this.client, intent, appliedAt);
      await this.client.query("RELEASE SAVEPOINT atlas_write");
      return receipt;
    } catch (error) {
      // Nothing the write did survives; the intent's row lock stays held for its FAILED code or for abandon().
      await this.client.query("ROLLBACK TO SAVEPOINT atlas_write");
      throw error;
    }
  }

  async complete(receipt: AtlasFindingPromotionReceipt, receiptSha256: string, completedAt: string): Promise<void> {
    const updated = await this.client.query(
      `UPDATE atlas_finding_intents
          SET status = 'COMPLETED', completed_at = $2::timestamptz, receipt_json = $3::jsonb, receipt_sha256 = $4
        WHERE intent_id = $1::uuid AND status = 'PENDING' AND payload_sha256 = $5
      RETURNING intent_id`,
      [this.intent.intentId, completedAt, JSON.stringify(receipt), receiptSha256, this.intent.payloadSha256],
    );
    if (updated.rowCount !== 1) throw new Error("ATLAS_PROMOTION_COMPLETION_CONFLICT");
    await this.end("COMMIT");
  }

  async fail(failureCode: AtlasFindingPromotionFailureCode, failedAt: string): Promise<void> {
    const updated = await this.client.query(
      `UPDATE atlas_finding_intents
          SET status = 'FAILED', failure_code = $2, failed_at = $3::timestamptz
        WHERE intent_id = $1::uuid AND status = 'PENDING' AND payload_sha256 = $4
      RETURNING intent_id`,
      [this.intent.intentId, failureCode, failedAt, this.intent.payloadSha256],
    );
    if (updated.rowCount !== 1) throw new Error("ATLAS_PROMOTION_FAILURE_CONFLICT");
    await this.end("COMMIT");
  }

  async abandon(): Promise<void> {
    await this.end("ROLLBACK").catch(() => undefined);
  }

  private async end(statement: "COMMIT" | "ROLLBACK"): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    await endWriterSession(this.client, statement, true);
  }
}
