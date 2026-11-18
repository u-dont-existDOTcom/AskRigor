import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import { Pool } from "pg";

import {
  PostgresEvidenceRepository,
  PostgresPublicDossierPageSource,
  PostgresResearchContributorAccessStore,
  PostgresResearchDossierEraser,
  PostgresResearchDossierPublicationReview,
  PostgresResearchDossierPublisher,
  PostgresResearchDossierStore,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
  conflictCandidateId,
  deterministicUuid,
  publicDossierTopicOrder,
  stableJson,
  type ResearchDossierPublishInput,
  type ResearchDossierShowCheck,
} from "../packages/evidence-repository/src/index.js";
import { rowPassesPageGuard } from "../apps/research-mcp/src/atlas/page-guard.js";
import { publicDossierOf, publishResearchDossier } from "../apps/research-mcp/src/findings/dossier-publication.js";
import {
  DOSSIER_TOPIC_INDEX_PER_PAGE,
  loadDossierPage,
  loadDossierTopic,
  loadDossierTopicIndex,
} from "../apps/research-mcp/src/atlas/dossier-pages.js";
import { AtlasDossierReview } from "../apps/research-mcp/src/atlas/dossier-review.js";
import type { DossierConflictReader } from "../apps/research-mcp/src/findings/dossier-conflict-reading.js";

// AskRigor#477 stage 2 (owner answers 331a, 332a and 333a, 16 Nov 2026): migration 0040's public dossier copies, on a
// real PostgreSQL with production's four roles (scripts/run-research-dossier-publications-postgres-acceptance.sh).
// Every account, question and study here is synthetic.

const SCHEMA = "living_evidence";
const IDENTITY_SECRET = new TextEncoder().encode("synthetic-postgres-identity-secret-at-least-thirty-two-bytes");
const FREE_AGREEMENT = {
  noticeVersion: RESEARCH_USE_NOTICE_VERSION,
  eligibleDeidentifiedResearchContributionRequired: true,
  prohibitedPrivateAndRawContentExcluded: true,
  proposalReviewAndNoAuthorityAcknowledged: true,
  paidPrivateAlternativeAcknowledged: true,
} as const;
const AT = new Date("2026-11-17T12:00:00.000Z");

function assert(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`MISSING_${name}`);
  return value;
}

async function expectDenied(work: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await work();
  } catch (error) {
    if ((error as { code?: string }).code === "42501") return;
    throw new Error(`${code}: ${(error as Error).message}`);
  }
  throw new Error(code);
}

async function expectError(work: () => Promise<unknown>, pattern: RegExp, code: string): Promise<void> {
  try {
    await work();
  } catch (error) {
    if (pattern.test((error as Error).message)) return;
    throw new Error(`${code}: ${(error as Error).message}`);
  }
  throw new Error(code);
}

async function main(): Promise<void> {
  const phase = process.argv[2];
  const adminUrl = requiredEnv("DATABASE_URL");
  if (phase === "migrate") {
    const repository = new PostgresEvidenceRepository({ connectionString: adminUrl, schema: SCHEMA });
    try {
      await repository.migrate();
    } finally {
      await repository.close();
    }
    process.stdout.write(`${JSON.stringify({ status: "PASS", phase: "migrate", migration: "0040_research_dossier_publications" })}\n`);
    return;
  }
  if (phase !== "verify") throw new Error("EXPECTED_PHASE_MIGRATE_OR_VERIFY");
  const checks = await verify(adminUrl, requiredEnv("ASKRIGOR_RESEARCH_ACCESS_DATABASE_URL"),
    requiredEnv("ASKRIGOR_RESEARCH_REVIEW_DATABASE_URL"), requiredEnv("ASKRIGOR_LIVING_EVIDENCE_READER_DATABASE_URL"));
  process.stdout.write(`${JSON.stringify({ status: "PASS", phase: "verify", checks })}\n`);
}

async function verify(adminUrl: string, accessUrl: string, reviewUrl: string, readerUrl: string): Promise<string[]> {
  const checks: string[] = [];
  const admin = new Pool({ connectionString: adminUrl });
  const access = new Pool({ connectionString: accessUrl });
  const reviewPool = new Pool({ connectionString: reviewUrl });
  const readerPool = new Pool({ connectionString: readerUrl });
  const accountStore = new PostgresResearchContributorAccessStore({ connectionString: accessUrl, schema: SCHEMA });
  const service = new ResearchContributorAccessService({ store: accountStore, identitySecret: IDENTITY_SECRET, now: () => AT });
  const dossiers = new PostgresResearchDossierStore(access, SCHEMA);
  const publisher = new PostgresResearchDossierPublisher(access, SCHEMA);
  const review = new PostgresResearchDossierPublicationReview({ connectionString: reviewUrl, schema: SCHEMA });
  // The owner's review as the server makes it (Codex's third review, P1): a show of a copy not shown yet is compared
  // first with every shown dossier it could contradict, its own dossier's aside, here finding no conflict unless a check
  // is given. plainDecide is the store's own call, with no comparison.
  const plainDecide = review.decide.bind(review);
  const plainDecideLivingPerson = review.decideLivingPerson.bind(review);
  const noConflict = async (publicNumber: string, versionNumber: number): Promise<ResearchDossierShowCheck> => {
    const all: Awaited<ReturnType<typeof review.showCandidates>> = [];
    for (;;) {
      const last = all.at(-1);
      const page = await review.showCandidates(publicNumber, versionNumber,
        last === undefined ? null : { publicNumber: last.publicNumber, versionNumber: last.versionNumber }, 200);
      all.push(...page);
      if (page.length < 200) break;
    }
    return { compared: all.filter((candidate) => candidate.publicNumber !== publicNumber).map(conflictCandidateId),
      conflictCheck: "read", conflictFindings: [], overrideBy: null, overrideConflicts: [] };
  };
  review.decide = async (input) => await plainDecide({ ...input,
    check: input.check ?? await noConflict(input.publicNumber, input.versionNumber) });
  review.decideLivingPerson = async (input) => await plainDecideLivingPerson({ ...input,
    check: input.check ?? await noConflict(input.publicNumber, input.versionNumber) });
  // A shown copy's revised mark is new content shown, compared first too (Codex's fourth review).
  const plainRevise = review.reviseImportance.bind(review);
  review.reviseImportance = async (input) => await plainRevise({ ...input,
    check: input.check ?? await noConflict(input.publicNumber, input.versionNumber) });
  const eraser = new PostgresResearchDossierEraser({ connectionString: reviewUrl, schema: SCHEMA });
  const pages = new PostgresPublicDossierPageSource({ connectionString: readerUrl, schema: SCHEMA });
  // A copy forced to shown by hand, carrying the admission gate's word for its content as if the gate had admitted it,
  // so the table's own constraints are what refuse it (the show guard refuses it without; Codex's fourth review).
  const forceShown = (publicNumber: string) => {
    assert(/^D-[1-9][0-9]{3,}$/u.test(publicNumber), "FORCED_NUMBER_INVALID");
    return admin.query(`SELECT set_config('askrigor.dossier_show_admitted', public_sha256::text, true)
        FROM ${SCHEMA}.research_dossier_public_versions WHERE public_number = '${publicNumber}' AND version_number = 1;
      UPDATE ${SCHEMA}.research_dossier_public_versions SET state = 'shown', hold_reasons = '{}'
       WHERE public_number = '${publicNumber}' AND version_number = 1`);
  };
  try {
    // Applied, recorded once, and safe to run again: a second migrate changes nothing and keeps its digest.
    const recorded = await admin.query(`SELECT migration_sha256 FROM ${SCHEMA}.schema_migrations
      WHERE migration_id = '0040_research_dossier_publications'`);
    assert(recorded.rowCount === 1, "MIGRATION_0040_NOT_APPLIED");
    const again = new PostgresEvidenceRepository({ connectionString: adminUrl, schema: SCHEMA });
    try {
      await again.migrate();
    } finally {
      await again.close();
    }
    checks.push("migration_0040_applied_and_safe_to_run_again");

    // No role reads or writes a table; the reader reads only the two views; each function goes to exactly one role.
    for (const table of ["research_dossier_public_notices", "research_dossier_publications",
      "research_dossier_public_versions", "research_dossier_public_events", "research_dossier_public_generation"]) {
      for (const [pool, role] of [[access, "ACCESS"], [reviewPool, "REVIEW"], [readerPool, "READER"]] as const) {
        await expectDenied(() => pool.query(`SELECT * FROM ${SCHEMA}.${table}`), `${role}_READS_${table.toUpperCase()}`);
      }
    }
    for (const view of ["research_dossier_public_pages", "research_dossier_public_history", "research_dossier_public_topics",
      "research_dossier_public_changes"]) {
      await readerPool.query(`SELECT * FROM ${SCHEMA}.${view}`);
      await expectDenied(() => access.query(`SELECT * FROM ${SCHEMA}.${view}`), `ACCESS_READS_${view.toUpperCase()}`);
      await expectDenied(() => reviewPool.query(`SELECT * FROM ${SCHEMA}.${view}`), `REVIEW_READS_${view.toUpperCase()}`);
    }
    const executes = async (role: string, signature: string) => (await admin.query<{ allowed: boolean }>(
      "SELECT has_function_privilege($1, $2, 'EXECUTE') AS allowed", [role, `${SCHEMA}.${signature}`])).rows[0]!.allowed;
    const grants: Record<string, string> = {
      "publish_research_dossier_version(text, uuid, jsonb, text[], text, text[], timestamptz)":
        "askrigor_research_access",
      "research_dossier_conflict_candidates(text, uuid, text, integer, integer)": "askrigor_research_access",
      "research_dossier_conflict_matches(jsonb)": "none",
      "research_dossier_topic_names(jsonb)": "none",
      "research_dossier_public_passes_page_guard(jsonb)": "none",
      "research_dossier_lock_topics(text[])": "none",
      "research_dossier_lock_copy_topics(text, integer)": "none",
      "list_research_dossier_publications(text, integer)": "askrigor_research_review",
      "inspect_research_dossier_publication(text)": "askrigor_research_review",
      "decide_research_dossier_publication(text, integer, text, text, text[], text, text[], text, text[], timestamptz)":
        "askrigor_research_review",
      "decide_research_dossier_living_person(text, integer, text, text, text[], text, text[], text, text[], timestamptz)":
        "askrigor_research_review",
      "research_dossier_show_candidates(text, integer, text, integer, integer)": "askrigor_research_review",
      "research_dossier_show_check_invalid(text[], text, text[], text, text[])": "none",
      "research_dossier_show_refusal(jsonb, text, integer, boolean, text[], text, text[], text, text[])": "none",
      "research_dossier_conflict_partners(text[])": "none",
      "admit_research_dossier_after_privacy(text, integer, text[], text, text[], timestamptz)":
        "askrigor_research_review",
      "list_research_dossier_admission_pending(integer)": "askrigor_research_review",
      "research_dossier_admissible(living_evidence.research_dossier_public_versions)": "none",
      "revise_research_dossier_importance(text, integer, text, text, text, text, text[], text, text[], text, text[], timestamptz)": "askrigor_research_review",
      "state_research_dossier_living_person(text, integer, text, text, timestamptz)": "askrigor_research_review",
      "list_research_dossier_privacy_pending(integer)": "askrigor_research_review",
      "record_research_dossier_privacy_reading(text, integer, text, text, text, text, timestamptz)":
        "askrigor_research_review",
      "research_dossier_public_follow_private()": "none",
      "research_dossier_public_on_revocation()": "none",
      "research_dossier_public_changed()": "none",
      "research_dossier_public_version_guard()": "none",
      "research_dossier_public_show_guard()": "none",
      "research_dossier_pick(jsonb, text[])": "none",
      "research_dossier_public_projection(jsonb)": "none",
      "research_dossier_public_sizes_complete(jsonb)": "none",
    };
    for (const [signature, owner] of Object.entries(grants)) {
      for (const role of ["askrigor_research_access", "askrigor_research_review", "askrigor_reader"]) {
        assert(await executes(role, signature) === (role === owner), `GRANT_${role}_${signature.slice(0, signature.indexOf("("))}`);
      }
    }
    checks.push("tables_closed_views_to_the_reader_only_functions_to_exactly_one_role");

    // Accounts and their saved dossier versions.
    const hex = (label: string) => createHash("sha256").update(`publication-acceptance:${label}`).digest("hex");
    const digest = (value: unknown) => createHash("sha256").update(stableJson(value)).digest("hex");
    let sequence = 0;
    const account = async (label: string) => {
      const subject = `auth0|synthetic-publication-${label}`;
      await service.acceptFreeContributor(subject, FREE_AGREEMENT);
      return { subject, accountKey: service.accountKeyForSubject(subject) };
    };
    // A saved record as the server stores it with stage 2 on (storedResearchDossier): private parts beside the public
    // ones, decimals, a null count, curly quotes and accents, a related list with a repeat, its own key and a bad key.
    const savedPayloads = new Map<string, Record<string, any>>();
    const storedDossier = (label: string, change: (value: Record<string, any>) => void = () => undefined) => {
      const value: Record<string, any> = {
        scope: "public",
        question: `Synthetic question ${label}: what do the forms of inositol do?`,
        topic: { key: "synthetic-topic", name: "Synthetic inositol", other_names: ["Myo’s cousin", "IP6"],
          related: ["other-topic", "other-topic", "synthetic-topic", "Not A Key", "pcos-synthetic"] },
        forms: ["myo-inositol", "D-chiro-inositol"],
        searches: [{ id: "q1", database: "pubmed", query: "inositol randomized trial", records_found: 140 },
          { id: "q2", database: "europepmc", query: "inositol café study", date_range: { start: "2020-01-01",
            end: "2026-01-01" }, records_found: null }],
        studies: [
          { id: "s1", identifiers: [{ scheme: "pmid", value: "11111111" }], kind: "human_trial", form: "myo-inositol",
            dose: "2 g a day", population: "Adults with a metabolic syndrome", comparator: "placebo", participants: 100,
            read: "abstract", decision: "used" },
          { id: "s2", identifiers: [{ scheme: "doi", value: "10.1000/synthetic.pilot" }], kind: "animal",
            form: "D-chiro-inositol", participants: 40, read: "full_text_read", decision: "set_aside",
            decision_reason: "An animal study only" },
        ],
        results: [
          { id: "r1", study: "s1", outcome: "Fasting insulin improved", comparator: "placebo", follow_up: "12 weeks",
            direction: "benefit", certainty: "moderate", provenance: "reported",
            figure: { kind: "counts", option_events: 30, option_total: 50, comparator_events: 20, comparator_total: 50,
              nnt: 10 } },
          { id: "r2", study: "s2", outcome: "Testosterone rose", direction: "mixed", certainty: "low",
            provenance: "calculated", calculation: { operation: "percent_change", from: [6.17, 5] },
            figure: { kind: "value", value: 23.4, unit: "%", measure: "Mean change" } },
        ],
        findings: [
          { id: "f1", claim: "Myo-inositol improved fasting insulin against placebo.", certainty: "moderate",
            kind: "helps", applies_to: "Adults with a metabolic syndrome", form: "myo-inositol",
            population_key: "adults-metabolic-syndrome", rests_on: ["r1"],
            what_would_change_it: "Larger trials", importance: "important", draws_on_youtube_comments: false,
            card_finding: "none" },
          { id: "f2", claim: "Whether D-chiro-inositol helps people is not known.", certainty: "low", kind: "not_known",
            applies_to: "Adults", form: "D-chiro-inositol", rests_on: ["q2"], what_would_change_it: "A human trial",
            importance: "decision_changing" },
        ],
        coverage: { benefits: { status: "entries" }, harms: { status: "none_found", search: "q1" },
          null_results: { status: "not_researched", reason: "No trial reported one" },
          conflicts: { status: "entries" }, mainstream_options: { status: "entries" },
          people_reports: { status: "entries" } },
        community: { threads: ["https://forum.example/t/1"], communities: ["forum.example"], threads_read: 1,
          people: { better: 2, no_change: 1, worse: 0, mixed: 1 }, report_quality: { detailed: 1, measured: 0, bare: 3 } },
        open_trails: ["Controlled trials of D-chiro-inositol"],
        names_living_people: false,
        value: { saves_work: "substantial", quick_answer: "It may help.", adds: ["f2"], reason: "It compares forms.",
          confidence: "high", judged_by: "researching_ai" },
        stamp: { saved_at: AT.toISOString(), askrigor_version: "0.1.0", askrigor_build: "0123abc", hrp: "20.6.43",
          finalized_at: AT.toISOString(), receipts_checked: 6, checks: ["receipts", "privacy_screen"],
          not_checked: ["value_judgement"], card_number: 42, origin: { surface: "/mcp", run: "chat", readings: "askrigor" },
          privacy_reading: "pass" },
      };
      change(value);
      return value;
    };
    const save = async (accountKey: string, dossierLabel: string, label: string, expected: string | null = null,
      change?: (value: Record<string, any>) => void) => {
      const payload = storedDossier(label, change);
      const appended = await dossiers.append({
        accountKey, dossierKey: hex(`dossier:${dossierLabel}`), threadKey: hex(`thread:${dossierLabel}`),
        requestKey: hex(`request:${label}`), inputSha256: hex(`input:${label}`), payload, payloadSha256: digest(payload),
        cardNumber: null, identifiers: [{ scheme: "pmid", value: "11111111" }], expectedPreviousVersionId: expected,
        versionId: deterministicUuid(`publication-acceptance:version:${sequence++}`), at: AT,
      });
      assert(appended.outcome === "inserted", `DOSSIER_APPEND_${label}`);
      savedPayloads.set(appended.versionId, payload);
      return appended.versionId;
    };
    // Every conflict candidate of a saved version, a page at a time, as the server pages through them.
    const candidatesOf = async (accountKey: string, versionId: string) => {
      const all: Awaited<ReturnType<typeof publisher.conflictCandidates>> = [];
      for (;;) {
        const last = all.at(-1);
        const page = await publisher.conflictCandidates(accountKey, versionId,
          last === undefined ? null : { publicNumber: last.publicNumber, versionNumber: last.versionNumber }, 200);
        all.push(...page);
        if (page.length < 200) return all;
      }
    };
    // The copy the server sends: the saved record's public part as publicDossierOf makes it, and a conflict check made
    // against every candidate (here finding none unless told).
    const copy = async (accountKey: string, versionId: string,
      conflict: { conflictFindings?: string[] } = {}): Promise<ResearchDossierPublishInput> => ({
      accountKey, versionId, payload: publicDossierOf(savedPayloads.get(versionId)!) as unknown as Record<string, unknown>,
      compared: (await candidatesOf(accountKey, versionId)).map(conflictCandidateId), conflictCheck: "read",
      conflictFindings: conflict.conflictFindings ?? [], at: AT });
    const moderate = (value: Record<string, any>) => { value.value.confidence = "moderate"; };

    // No notice covers public dossiers until v7's release adds it: an active v6 account publishes nothing.
    const first = await account("first");
    const v1 = await save(first.accountKey, "one", "one-1");
    assert((await publisher.publish(await copy(first.accountKey, v1))).outcome === "account_refused",
      "PUBLISHED_WITHOUT_A_COVERING_NOTICE");
    assert((await pages.listShown({ limit: 10 })).length === 0, "PAGE_SHOWS_WITHOUT_A_COVERING_NOTICE");
    checks.push("nothing_published_while_no_notice_covers_public_dossiers");

    // Here only, v6 stands in for the notice v7 that the release would add.
    await admin.query(`INSERT INTO ${SCHEMA}.research_dossier_public_notices (notice_version, added_at) VALUES ($1, $2)`,
      [RESEARCH_USE_NOTICE_VERSION, AT]);
    const published = await publisher.publish(await copy(first.accountKey, v1));
    assert(published.outcome === "published" && published.state === "shown" && /^D-1\d{3,}$/u.test(published.publicNumber),
      "FIRST_PUBLISH_WRONG");
    const replay = await publisher.publish(await copy(first.accountKey, v1));
    assert(replay.outcome === "replayed" && replay.publicNumber === published.publicNumber, "PUBLISH_REPLAY_WRONG");
    const shown = await pages.listShown({ topicKeys: ["synthetic-topic"], limit: 10 });
    assert(shown.length === 1 && shown[0]!.publicNumber === published.publicNumber && !shown[0]!.accepted &&
      !Object.hasOwn(shown[0]!, "origin"), "READER_VIEW_WRONG");
    const readerColumns = await readerPool.query(`SELECT * FROM ${SCHEMA}.research_dossier_public_pages LIMIT 1`);
    assert(readerColumns.fields.every(({ name }) => !/origin|account|dossier_number|privacy|hold/u.test(name)),
      "READER_VIEW_EXPOSES_PRIVATE_COLUMNS");
    assert((await candidatesOf(first.accountKey, v1)).map(conflictCandidateId).join() === `${published.publicNumber}/1`,
      "OWN_EARLIER_COPY_NOT_A_CANDIDATE");
    checks.push("a_covered_account_publishes_once_and_the_reader_sees_only_public_columns");

    // Codex's review, finding 10: the publish function takes nothing on trust. Its own projection of the private record
    // is exactly the server's publicDossierOf, on records with and without people's reports, a protocol version or
    // highlighted findings; anything else, or a comparison without its group sizes, is refused; the digest, topic,
    // origin and why it is held are its own.
    const projected = async (versionId: string) => (await admin.query<{ same: boolean }>(
      `SELECT ${SCHEMA}.research_dossier_public_projection(stored.payload_json) = $2::jsonb AS same
         FROM ${SCHEMA}.research_dossier_versions stored WHERE stored.version_id = $1`,
      [versionId, JSON.stringify(publicDossierOf(savedPayloads.get(versionId)!))])).rows[0]!.same;
    assert(await projected(v1), "PROJECTION_DIFFERS");
    const deriving = await account("deriving");
    const variants: Array<(value: Record<string, any>) => void> = [
      (value) => { delete value.community; delete value.stamp.hrp; value.value.adds = []; },
      (value) => { delete value.topic.related; delete value.value.quick_answer; value.forms = []; },
    ];
    for (const [index, change] of variants.entries()) {
      const variant = await save(deriving.accountKey, `deriving-${index}`, `deriving-${index}`, null, change);
      assert(await projected(variant), `PROJECTION_DIFFERS_${index}`);
    }
    const d1 = await save(deriving.accountKey, "deriving-main", "deriving-main");
    const honest = await copy(deriving.accountKey, d1);
    const tampered = await publisher.publish({ ...honest, payload: { ...honest.payload,
      question: "A question the record never held" } });
    assert(tampered.outcome === "payload_refused", "TAMPERED_PAYLOAD_ACCEPTED");
    const unsized = await save(deriving.accountKey, "deriving-unsized", "deriving-unsized", null, (value) => {
      value.results[1].comparator = "baseline"; });
    assert((await publisher.publish(await copy(deriving.accountKey, unsized))).outcome === "payload_refused",
      "UNSIZED_COMPARISON_ACCEPTED");
    const derived = await publisher.publish(honest);
    assert(derived.outcome === "published" && derived.state === "shown" && derived.holdReasons.length === 0,
      "DERIVED_PUBLISH_WRONG");
    const derivedRow = (await review.inspect(derived.publicNumber))[0]!;
    assert(derivedRow.topicKey === "synthetic-topic" && derivedRow.relatedTopicKeys.join() === "other-topic,pcos-synthetic" &&
      /^[a-f0-9]{64}$/u.test(derivedRow.payloadSha256 ?? "") && derivedRow.origin.surface === "/mcp" &&
      derivedRow.privacyRead && !derivedRow.namesLivingPerson, "DERIVED_FACTS_WRONG");
    const leaked = JSON.stringify(derivedRow.payload);
    assert(!/card_number|0123abc|origin|names_living_people|draws_on_youtube|forum\.example\/t|saves_work/u.test(leaked),
      "PRIVATE_FIELD_IN_PUBLIC_COPY");
    checks.push("the_publisher_derives_the_copy_and_why_it_is_held_from_the_private_record");

    // A held newer version leaves the shown one on the pages; the check shows it, which supersedes the older.
    const v2 = await save(first.accountKey, "one", "one-2", v1, moderate);
    const held = await publisher.publish(await copy(first.accountKey, v2));
    assert(held.outcome === "published" && held.state === "held", "HELD_PUBLISH_WRONG");
    assert((await pages.listShown({ publicNumbers: [published.publicNumber], limit: 10 }))[0]?.versionNumber === 1,
      "HELD_VERSION_REPLACED_SHOWN");
    const queue = await review.list("held", 10);
    assert(queue.length === 1 && queue[0]!.holdReasons.join() === "not_high_confidence" &&
      queue[0]!.origin.surface === "/mcp", "HELD_QUEUE_WRONG");
    const showDecision = await review.decide({ publicNumber: published.publicNumber, versionNumber: 2, decision: "show",
      reason: null, at: AT });
    assert(showDecision.outcome === "decided" && showDecision.state === "shown", "SHOW_DECISION_WRONG");
    const afterShow = await pages.listShown({ publicNumbers: [published.publicNumber], limit: 10 });
    assert(afterShow.length === 1 && afterShow[0]!.versionNumber === 2, "SHOWN_NOT_SUPERSEDED");
    const history = await pages.history([published.publicNumber]);
    assert(history.map(({ versionNumber, state }) => `${versionNumber}:${state}`).join() === "2:shown,1:superseded",
      "HISTORY_WRONG");
    checks.push("held_copy_waits_and_shown_one_stays_until_the_check_shows_its_successor");

    // Only the newest version publishes; a decision on an older copy that would show it is refused.
    const v3 = await save(first.accountKey, "one", "one-3", v2);
    await save(first.accountKey, "one", "one-4", v3);
    assert((await publisher.publish(await copy(first.accountKey, v3))).outcome === "version_refused",
      "OLDER_VERSION_PUBLISHED");
    assert((await review.decide({ publicNumber: published.publicNumber, versionNumber: 1, decision: "show", reason: null,
      at: AT })).outcome === "not_decidable", "OLDER_COPY_SHOWN");
    checks.push("only_the_newest_version_publishes_or_shows");

    // Accepting marks it checked; an accepted copy can't be sent back for the check; taking down needs no newest rule.
    const accepted = await review.decide({ publicNumber: published.publicNumber, versionNumber: 2, decision: "accept",
      reason: "synthetic acceptance", at: AT });
    assert(accepted.outcome === "decided" && accepted.accepted, "ACCEPT_WRONG");
    assert((await pages.listShown({ publicNumbers: [published.publicNumber], limit: 10 }))[0]?.accepted === true,
      "ACCEPTED_NOT_ON_PAGE");
    assert((await review.decide({ publicNumber: published.publicNumber, versionNumber: 2, decision: "hold",
      reason: "synthetic", at: AT })).outcome === "not_decidable", "ACCEPTED_COPY_HELD");
    checks.push("acceptance_marks_checked_and_cannot_be_held_back");

    // Revocation (the 0037 trigger withdraws the pending private version) takes its unaccepted copy off the pages.
    const second = await account("second");
    const s1 = await save(second.accountKey, "two", "two-1");
    const secondCopy = await publisher.publish(await copy(second.accountKey, s1));
    assert(secondCopy.outcome === "published", "SECOND_PUBLISH_WRONG");
    assert((await pages.listShown({ publicNumbers: [secondCopy.publicNumber], limit: 1 })).length === 1, "SECOND_NOT_SHOWN");
    await service.revoke(second.subject);
    assert((await pages.listShown({ publicNumbers: [secondCopy.publicNumber], limit: 1 })).length === 0,
      "REVOKED_COPY_STILL_SHOWN");
    const revokedState = await review.inspect(secondCopy.publicNumber);
    assert(revokedState[0]?.state === "taken_down", "REVOKED_COPY_NOT_TAKEN_DOWN");
    assert((await review.decide({ publicNumber: secondCopy.publicNumber, versionNumber: 1, decision: "show", reason: null,
      at: AT })).outcome === "not_decidable", "WITHDRAWN_COPY_SHOWN_AGAIN");
    checks.push("revocation_takes_an_unaccepted_copy_off_the_pages_for_good");

    // Codex's review, finding 5: losing access is treated like erasure for an accepted copy. It stays on the pages, but
    // its dossier's copies keep no link to a private version, the private dossier or the account, and no record of where
    // the research ran; that dossier's unaccepted copies are erased with the link. Another dossier's unaccepted copy
    // leaves the pages even when the owner had reviewed its private version (which revocation does not withdraw).
    const leaving = await account("leaving");
    const l1 = await save(leaving.accountKey, "leaving", "leaving-1");
    const leavingCopy = await publisher.publish(await copy(leaving.accountKey, l1));
    assert(leavingCopy.outcome === "published", "LEAVING_PUBLISH_WRONG");
    assert((await review.decide({ publicNumber: leavingCopy.publicNumber, versionNumber: 1, decision: "accept",
      reason: null, at: AT })).outcome === "decided", "LEAVING_ACCEPT_WRONG");
    const l2 = await save(leaving.accountKey, "leaving", "leaving-2", l1, moderate);
    await publisher.publish(await copy(leaving.accountKey, l2));
    const b1 = await save(leaving.accountKey, "leaving-b", "leaving-b-1");
    const reviewedCopy = await publisher.publish(await copy(leaving.accountKey, b1));
    assert(reviewedCopy.outcome === "published", "REVIEWED_PUBLISH_WRONG");
    await admin.query(`INSERT INTO ${SCHEMA}.research_dossier_events (version_id, event, reason, happened_at)
      VALUES ($1, 'accepted', NULL, $2)`, [b1, AT]);
    await service.revoke(leaving.subject);
    const stillShown = await pages.listShown({ publicNumbers: [leavingCopy.publicNumber, reviewedCopy.publicNumber], limit: 5 });
    assert(stillShown.length === 1 && stillShown[0]!.publicNumber === leavingCopy.publicNumber && stillShown[0]!.accepted,
      "ACCESS_LOSS_PAGES_WRONG");
    const leavingRows = await review.inspect(leavingCopy.publicNumber);
    const leavingV1 = leavingRows.find(({ versionNumber }) => versionNumber === 1);
    assert(leavingV1?.state === "shown" && leavingV1.dossierNumber === null && Object.keys(leavingV1.origin).length === 0,
      "ACCEPTED_COPY_STILL_LINKED");
    assert(leavingRows.find(({ versionNumber }) => versionNumber === 2)?.state === "erased", "DETACHED_SIBLING_NOT_ERASED");
    const links = await admin.query<{ linked: string; dossier: string | null }>(`SELECT
        (SELECT count(*) FROM ${SCHEMA}.research_dossier_public_versions copy
          WHERE copy.public_number = $1 AND copy.version_id IS NOT NULL)::text AS linked,
        (SELECT publication.dossier_number FROM ${SCHEMA}.research_dossier_publications publication
          WHERE publication.public_number = $1) AS dossier`, [leavingCopy.publicNumber]);
    assert(links.rows[0]!.linked === "0" && links.rows[0]!.dossier === null, "ACCESS_LOSS_LINK_KEPT");
    const reviewedRow = (await review.inspect(reviewedCopy.publicNumber))[0];
    assert(reviewedRow?.state === "taken_down" && reviewedRow.dossierNumber !== null, "REVIEWED_COPY_STILL_SHOWN");
    checks.push("losing_access_detaches_accepted_copies_and_takes_down_the_rest");

    // Erasure (forget_card's, by the thread): an unaccepted copy is erased with its private version; an accepted one
    // stays, written without the person, and keeps nothing of where its research ran.
    const third = await account("third");
    const t1 = await save(third.accountKey, "three", "three-1");
    const thirdCopy = await publisher.publish(await copy(third.accountKey, t1));
    assert(thirdCopy.outcome === "published", "THIRD_PUBLISH_WRONG");
    assert(await eraser.eraseThread({ threadKey: hex("thread:three"), at: AT }) === 1, "THIRD_NOT_ERASED");
    const erased = await review.inspect(thirdCopy.publicNumber);
    assert(erased[0]?.state === "erased" && erased[0].payload === null && erased[0].topicKey === null &&
      Object.keys(erased[0].origin).length === 0, "UNACCEPTED_COPY_NOT_ERASED");
    assert(await eraser.eraseThread({ threadKey: hex("thread:one"), at: AT }) === 4, "FIRST_NOT_ERASED");
    const kept = await review.inspect(published.publicNumber);
    const keptShown = kept.find(({ versionNumber }) => versionNumber === 2);
    assert(keptShown?.state === "shown" && keptShown.accepted && keptShown.payload !== null &&
      Object.keys(keptShown.origin).length === 0, "ACCEPTED_COPY_NOT_KEPT_WITHOUT_ORIGIN");
    // Its older copy, superseded and never accepted, is erased with its version.
    assert(kept.find(({ versionNumber }) => versionNumber === 1)?.state === "erased", "SUPERSEDED_COPY_NOT_ERASED");
    assert((await pages.listShown({ publicNumbers: [published.publicNumber], limit: 1 })).length === 1,
      "ACCEPTED_COPY_LEFT_THE_PAGES");
    checks.push("erasure_erases_unaccepted_copies_and_keeps_accepted_ones_without_their_origin");

    // Codex's review, finding 1: no copy shows without a semantic privacy reading that passed its saved content. The
    // database refuses a shown copy without one, and the review can neither show nor accept a copy held for it.
    const unread = await account("unread");
    const u1 = await save(unread.accountKey, "unread", "unread-1", null, (value) => { delete value.stamp.privacy_reading; });
    const pending = await publisher.publish(await copy(unread.accountKey, u1));
    assert(pending.outcome === "published" && pending.state === "held" &&
      pending.holdReasons.join() === "privacy_reading_pending", "PRIVACY_PENDING_NOT_HELD");
    for (const decision of ["show", "accept"] as const) {
      assert((await review.decide({ publicNumber: pending.publicNumber, versionNumber: 1, decision, reason: null,
        at: AT })).outcome === "not_decidable", `PRIVACY_PENDING_${decision.toUpperCase()}N`);
    }
    await expectError(() => forceShown(pending.publicNumber), /check constraint/u,
    "PRIVACY_PENDING_FORCED_SHOWN");
    assert((await pages.listShown({ publicNumbers: [pending.publicNumber], limit: 1 })).length === 0,
      "PRIVACY_PENDING_ON_A_PAGE");
    checks.push("nothing_shows_without_a_privacy_reading_that_passed_the_saved_content");

    // Codex's re-review, P1: a copy held for the privacy reading gets one later, bound to the digest of the content
    // read. A reader that could not read is recorded as temporary and leaves it pending; a refusal is final for that
    // content; a pass lets the ordinary show work and shows nothing by itself.
    const [pendingRow] = await review.inspect(pending.publicNumber);
    assert((await review.privacyPending(50)).some(({ publicNumber, payloadSha256 }) =>
      publicNumber === pending.publicNumber && payloadSha256 === pendingRow!.payloadSha256), "PENDING_READING_NOT_LISTED");
    const later = (reading: Parameters<typeof review.recordPrivacyReading>[0]["reading"], contentSha256 =
      pendingRow!.payloadSha256!, publicNumber = pending.publicNumber) =>
      review.recordPrivacyReading({ publicNumber, versionNumber: 1, contentSha256, reading, at: AT });
    assert((await later({ status: "unavailable", reason: "daily_budget" })).outcome === "recorded",
      "TEMPORARY_READING_NOT_RECORDED");
    const temporary = (await review.inspect(pending.publicNumber))[0]!;
    assert(temporary.laterPrivacyReading === null && temporary.privacyUnavailable?.reason === "daily_budget",
      "TEMPORARY_READING_STORED_AS_FINAL");
    assert((await review.decide({ publicNumber: pending.publicNumber, versionNumber: 1, decision: "show", reason: null,
      at: AT })).outcome === "not_decidable", "SHOWN_AFTER_A_TEMPORARY_FAILURE");
    assert((await later({ status: "pass" }, "f".repeat(64))).outcome === "not_readable", "READING_OF_OTHER_CONTENT_RECORDED");
    assert((await later({ status: "pass" })).outcome === "recorded", "LATER_PASS_NOT_RECORDED");
    assert(!(await review.privacyPending(50)).some(({ publicNumber }) => publicNumber === pending.publicNumber),
      "PASSED_COPY_STILL_PENDING");
    assert((await pages.listShown({ publicNumbers: [pending.publicNumber], limit: 1 })).length === 0,
      "LATER_PASS_SHOWED_BY_ITSELF");
    await expectError(() => admin.query(`UPDATE ${SCHEMA}.research_dossier_public_versions
      SET privacy_reading_sha256 = $2 WHERE public_number = $1`, [pending.publicNumber, "e".repeat(64)]),
    /RESEARCH_DOSSIER_PUBLIC_VERSION_IMMUTABLE/u, "LATER_READING_REBOUND");
    assert((await review.decide({ publicNumber: pending.publicNumber, versionNumber: 1, decision: "show", reason: null,
      at: AT })).outcome === "decided", "LATER_PASS_NOT_SHOWABLE");
    const refusedVersion = await save(unread.accountKey, "unread-two", "unread-two-1", null,
      (value) => { delete value.stamp.privacy_reading; });
    const refusedCopy = await publisher.publish(await copy(unread.accountKey, refusedVersion));
    assert(refusedCopy.outcome === "published" && refusedCopy.state === "held", "SECOND_PENDING_NOT_HELD");
    const refusedSha = (await review.inspect(refusedCopy.publicNumber))[0]!.payloadSha256!;
    assert((await later({ status: "refuse", reason: "personal_health_story", path: "findings[0].claim" }, refusedSha,
      refusedCopy.publicNumber)).outcome === "recorded", "REFUSAL_NOT_RECORDED");
    const refusedRow = (await review.inspect(refusedCopy.publicNumber))[0]!;
    assert(refusedRow.laterPrivacyReading?.outcome === "refused" &&
      refusedRow.laterPrivacyReading.reason === "personal_health_story", "REFUSAL_STORED_WRONG");
    for (const reading of [{ status: "pass" as const }, { status: "unavailable" as const, reason: "timeout" as const }]) {
      assert((await later(reading, refusedSha, refusedCopy.publicNumber)).outcome === "not_readable",
        `REFUSED_CONTENT_READ_AGAIN_${reading.status.toUpperCase()}`);
    }
    for (const decision of ["show", "accept"] as const) {
      assert((await review.decide({ publicNumber: refusedCopy.publicNumber, versionNumber: 1, decision, reason: null,
        at: AT })).outcome === "not_decidable", `REFUSED_CONTENT_${decision.toUpperCase()}N`);
    }
    await expectError(() => forceShown(refusedCopy.publicNumber), /check constraint/u,
    "REFUSED_CONTENT_FORCED_SHOWN");
    checks.push("a_privacy_reading_made_later_is_bound_to_its_content_and_a_refusal_is_final");

    // Codex's third review, P1: a copy held only for the privacy reading shows by itself once a later reading passes
    // it, if it otherwise qualifies, after fresh checks under the locks: never before a pass, nor one held for anything
    // else, taken down by the owner, or whose account may no longer publish; an important conflict found now holds it
    // for that instead, a check that could not be made leaves it waiting, and one made against another set is stale.
    {
      const admittee = await account("admittee");
      const rival = await account("admittee-rival");
      const topic = (label: string) => (value: Record<string, any>) => {
        value.topic = { key: `admit-${label}`, name: `Admit ${label}`, other_names: [], related: [] };
        value.forms = [`admit-form-${label}`];
      };
      const waiting = async (label: string, change: (value: Record<string, any>) => void = () => undefined,
        owner = admittee) => {
        const version = await save(owner.accountKey, `admit-${label}`, `admit-${label}`, null, (value) => {
          topic(label)(value); delete value.stamp.privacy_reading; change(value); });
        const held = await publisher.publish(await copy(owner.accountKey, version));
        assert(held.outcome === "published" && held.state === "held" && held.holdReasons[0] === "privacy_reading_pending",
          `ADMIT_${label.toUpperCase()}_NOT_HELD`);
        return held.publicNumber;
      };
      const pass = async (publicNumber: string) => {
        const sha = (await review.inspect(publicNumber))[0]!.payloadSha256!;
        assert((await review.recordPrivacyReading({ publicNumber, versionNumber: 1, contentSha256: sha,
          reading: { status: "pass" }, at: AT })).outcome === "recorded", `ADMIT_PASS_NOT_RECORDED_${publicNumber}`);
      };
      const read = async (publicNumber: string): Promise<ResearchDossierShowCheck> => ({ compared:
        (await review.showCandidates(publicNumber, 1, null, 200)).map(conflictCandidateId), conflictCheck: "read",
      conflictFindings: [], overrideBy: null, overrideConflicts: [] });
      const admit = async (publicNumber: string, check?: ResearchDossierShowCheck) =>
        await review.admitAfterPrivacy({ publicNumber, versionNumber: 1, check: check ?? await read(publicNumber), at: AT });
      const pendingNumbers = async () => (await review.admissionPending(50)).map(({ publicNumber }) => publicNumber);

      const qualifies = await waiting("qualifies");
      assert((await admit(qualifies)).outcome === "not_admissible", "ADMITTED_BEFORE_A_PASS");
      await pass(qualifies);
      assert((await pendingNumbers()).includes(qualifies), "QUALIFYING_COPY_NOT_PENDING_ADMISSION");
      assert((await admit(qualifies)).outcome === "shown", "QUALIFYING_COPY_NOT_SHOWN");
      const shownCopy = await pages.listShown({ publicNumbers: [qualifies], limit: 1 });
      assert(shownCopy.length === 1 && !shownCopy[0]!.accepted, "ADMITTED_COPY_NOT_ON_THE_PAGES");
      const admittedEvents = await admin.query<{ event: string; reason: string | null }>(`SELECT event, reason
        FROM ${SCHEMA}.research_dossier_public_events WHERE public_number = $1 ORDER BY event_id`, [qualifies]);
      assert(admittedEvents.rows.at(-1)?.event === "shown" && admittedEvents.rows.at(-1)?.reason === "privacy_reading_passed",
        "ADMISSION_EVENT_MISSING");
      assert(!(await pendingNumbers()).includes(qualifies), "SHOWN_COPY_STILL_PENDING");

      const unsure = await waiting("unsure", moderate);
      await pass(unsure);
      const tookDown = await waiting("taken-down");
      assert((await review.decide({ publicNumber: tookDown, versionNumber: 1, decision: "take_down",
        reason: "The owner's own check", at: AT })).outcome === "decided", "ADMIT_TAKE_DOWN_WRONG");
      await pass(tookDown);
      const ineligible = await account("admittee-ineligible");
      const saveOff = await waiting("saving-off", () => undefined, ineligible);
      await pass(saveOff);
      await service.setFindingsSave(ineligible.subject, false);
      for (const [label, number] of [["UNSURE", unsure], ["TAKEN_DOWN", tookDown], ["SAVING_OFF", saveOff]] as const) {
        assert((await admit(number)).outcome === "not_admissible", `ADMITTED_${label}`);
        assert(!(await pendingNumbers()).includes(number), `PENDING_ADMISSION_${label}`);
        assert((await pages.listShown({ publicNumbers: [number], limit: 1 })).length === 0, `SHOWN_${label}`);
      }

      // Another research's opposite finding shown on the same topic meanwhile.
      const contested = await waiting("contested");
      await pass(contested);
      const rivalVersion = await save(rival.accountKey, "admit-rival", "admit-rival", null, topic("contested"));
      const rivalCopy = await publisher.publish(await copy(rival.accountKey, rivalVersion));
      assert(rivalCopy.outcome === "published" && rivalCopy.state === "shown", "ADMIT_RIVAL_NOT_SHOWN");
      assert((await admit(contested, { compared: [], conflictCheck: "read", conflictFindings: [], overrideBy: null,
        overrideConflicts: [] })).outcome === "comparison_stale", "ADMITTED_AGAINST_ANOTHER_SET");
      // Not read, against another set: stale too (Codex's fourth review); against the set now, it waits.
      assert((await admit(contested, { compared: [], conflictCheck: "not_read", conflictFindings: [], overrideBy: null,
        overrideConflicts: [] })).outcome === "comparison_stale", "UNREAD_ADMISSION_AGAINST_ANOTHER_SET");
      assert((await admit(contested, { ...(await read(contested)), conflictCheck: "not_read" })).outcome === "waiting",
        "ADMITTED_WITHOUT_A_COMPARISON");
      assert((await pendingNumbers()).includes(contested), "WAITING_COPY_NOT_PENDING_ADMISSION");
      const conflicted = await admit(contested, { ...(await read(contested)),
        conflictFindings: [`f1:${rivalCopy.publicNumber}/1:f1`] });
      assert(conflicted.outcome === "held" && conflicted.holdReasons.join() === "important_conflict",
        `ADMITTED_OVER_AN_IMPORTANT_CONFLICT_${conflicted.outcome}`);
      const contestedRow = (await review.inspect(contested))[0]!;
      assert(contestedRow.state === "held" && contestedRow.conflictsWith.join() === rivalCopy.publicNumber,
        "CONFLICT_HOLD_NOT_RECORDED");
      assert(!(await pendingNumbers()).includes(contested), "CONFLICTED_COPY_STILL_PENDING");
    }
    checks.push("a_copy_held_only_for_the_privacy_reading_shows_by_itself_once_it_passes_after_fresh_checks");

    // Codex's review, finding 2: a copy whose claim names a living person shows only on the owner's own decision, with
    // his typed reason and who decided, made once; show and accept refuse it, and nothing forces it up.
    const named = await account("named");
    const n1 = await save(named.accountKey, "named", "named-1", null, (value) => { value.names_living_people = true; });
    const namedCopy = await publisher.publish(await copy(named.accountKey, n1));
    assert(namedCopy.outcome === "published" && namedCopy.state === "held", "NAMED_NOT_HELD");
    for (const decision of ["show", "accept"] as const) {
      assert((await review.decide({ publicNumber: namedCopy.publicNumber, versionNumber: 1, decision, reason: "fine",
        at: AT })).outcome === "not_decidable", `NAMED_${decision.toUpperCase()}N_ORDINARILY`);
    }
    await expectError(() => forceShown(namedCopy.publicNumber), /check constraint/u, "NAMED_FORCED_SHOWN");
    await expectError(() => reviewPool.query(`SELECT * FROM ${SCHEMA}.decide_research_dossier_living_person($1, 1,
      'A public figure in office', 'auth0|synthetic-owner', '{}'::text[], 'read', '{}'::text[], NULL, '{}'::text[], now())`,
    [namedCopy.publicNumber]),
    /RESEARCH_DOSSIER_REVIEW_INPUT_INVALID/u, "NAMED_DECIDER_NOT_A_DIGEST");
    const namedDecision = { publicNumber: namedCopy.publicNumber, versionNumber: 1, reason: "A public figure in office",
      decidedBy: `reviewer:${"0123456789abcdef"}`, at: AT };
    const decidedNamed = await review.decideLivingPerson(namedDecision);
    assert(decidedNamed.outcome === "decided" && decidedNamed.state === "shown", "NAMED_DECISION_WRONG");
    const namedRow = (await review.inspect(namedCopy.publicNumber))[0]!;
    assert(namedRow.namesLivingPerson && namedRow.livingPersonDecision?.by === "reviewer:0123456789abcdef" &&
      namedRow.livingPersonDecision.reason === "A public figure in office", "NAMED_DECISION_NOT_RECORDED");
    assert((await review.decideLivingPerson(namedDecision)).outcome === "not_decidable", "NAMED_DECIDED_TWICE");
    await expectError(() => admin.query(`UPDATE ${SCHEMA}.research_dossier_public_versions SET living_person_reason = 'x'
      WHERE public_number = $1`, [namedCopy.publicNumber]), /RESEARCH_DOSSIER_PUBLIC_VERSION_IMMUTABLE/u,
    "NAMED_DECISION_CHANGED");
    assert((await pages.listShown({ publicNumbers: [namedCopy.publicNumber], limit: 1 })).length === 1, "NAMED_NOT_SHOWN");
    checks.push("a_named_living_person_shows_only_on_the_owners_recorded_decision");

    // Codex's re-review, P0 (his probe: living_people_undeclared, then the ordinary show): "didn't say" is not "no". A
    // copy whose AI did not say is refused by show and accept, and nothing forces it up; only the owner's own statement,
    // recorded once with who and when, resolves it: "names no living person" lets the ordinary show work, "names a
    // living person" leaves only the separate decision with a typed reason.
    const silent = await account("silent");
    const silentVersion = await save(silent.accountKey, "silent", "silent-1", null,
      (value) => { delete value.names_living_people; });
    const silentCopy = await publisher.publish(await copy(silent.accountKey, silentVersion));
    assert(silentCopy.outcome === "published" && silentCopy.state === "held" &&
      silentCopy.holdReasons.join() === "living_people_undeclared", "UNDECLARED_NOT_HELD");
    for (const decision of ["show", "accept"] as const) {
      assert((await review.decide({ publicNumber: silentCopy.publicNumber, versionNumber: 1, decision, reason: null,
        at: AT })).outcome === "not_decidable", `UNDECLARED_${decision.toUpperCase()}N_ORDINARILY`);
    }
    await expectError(() => forceShown(silentCopy.publicNumber), /check constraint/u,
    "UNDECLARED_FORCED_SHOWN");
    assert((await review.decideLivingPerson({ publicNumber: silentCopy.publicNumber, versionNumber: 1,
      reason: "A public figure", decidedBy: "reviewer:0123456789abcdef", at: AT })).outcome === "not_decidable",
    "UNDECLARED_DECIDED_AS_NAMING");
    const statement = { publicNumber: silentCopy.publicNumber, versionNumber: 1,
      statement: "names_no_living_person" as const, statedBy: "reviewer:00112233445566ff", at: AT };
    assert((await review.stateLivingPerson(statement)).outcome === "stated", "UNDECLARED_STATEMENT_NOT_RECORDED");
    const statedRow = (await review.inspect(silentCopy.publicNumber))[0]!;
    assert(statedRow.namesLivingPerson === null && statedRow.livingPersonStatement?.statement === "names_no_living_person" &&
      statedRow.livingPersonStatement.by === "reviewer:00112233445566ff", "UNDECLARED_STATEMENT_WRONG");
    assert((await review.stateLivingPerson({ ...statement, statement: "names_a_living_person" })).outcome ===
      "not_decidable", "UNDECLARED_STATED_TWICE");
    await expectError(() => admin.query(`UPDATE ${SCHEMA}.research_dossier_public_versions
      SET living_person_statement = 'names_a_living_person' WHERE public_number = $1`, [silentCopy.publicNumber]),
    /RESEARCH_DOSSIER_PUBLIC_VERSION_IMMUTABLE/u, "UNDECLARED_STATEMENT_CHANGED");
    assert((await review.decide({ publicNumber: silentCopy.publicNumber, versionNumber: 1, decision: "show", reason: null,
      at: AT })).outcome === "decided", "STATED_NONE_NOT_SHOWN");
    const silentTwo = await save(silent.accountKey, "silent-two", "silent-two-1", null,
      (value) => { delete value.names_living_people; });
    const silentNamed = await publisher.publish(await copy(silent.accountKey, silentTwo));
    assert(silentNamed.outcome === "published" && silentNamed.state === "held", "UNDECLARED_TWO_NOT_HELD");
    assert((await review.stateLivingPerson({ ...statement, publicNumber: silentNamed.publicNumber,
      statement: "names_a_living_person" })).outcome === "stated", "NAMING_STATEMENT_NOT_RECORDED");
    assert((await review.decide({ publicNumber: silentNamed.publicNumber, versionNumber: 1, decision: "show", reason: null,
      at: AT })).outcome === "not_decidable", "STATED_NAMING_SHOWN_ORDINARILY");
    assert((await review.decideLivingPerson({ publicNumber: silentNamed.publicNumber, versionNumber: 1,
      reason: "A public figure in office", decidedBy: "reviewer:0123456789abcdef", at: AT })).outcome === "decided",
    "STATED_NAMING_NOT_DECIDED");
    assert((await review.stateLivingPerson({ ...statement, publicNumber: namedCopy.publicNumber })).outcome ===
      "not_decidable", "DECLARED_COPY_TOOK_A_STATEMENT");
    checks.push("an_undeclared_living_person_shows_only_after_the_owners_recorded_statement");

    // Codex's review, finding 3: the candidates are every shown copy on the topic, a linked topic or under another name,
    // with no cap of 200: the server pages through them all.
    const crowd = await account("crowd");
    const crowded = (value: Record<string, any>) => {
      value.topic = { key: "crowded-topic", name: "Crowded topic", other_names: [], related: [] };
      // A form of its own: a shared form makes another topic's copies candidates too.
      value.forms = ["crowded-form"];
    };
    for (let index = 0; index < 203; index += 1) {
      const version = await save(crowd.accountKey, `crowd-${index}`, `crowd-${index}`, null, crowded);
      const shown = await publisher.publish(await copy(crowd.accountKey, version));
      assert(shown.outcome === "published" && shown.state === "shown", `CROWD_${index}_NOT_SHOWN`);
    }
    const aliased = await save(crowd.accountKey, "crowd-alias", "crowd-alias", null, (value) => {
      value.topic = { key: "alias-topic", name: "Another name", other_names: ["Crowded Topic"], related: [] };
      value.forms = ["alias-form"]; });
    assert((await publisher.publish(await copy(crowd.accountKey, aliased))).outcome === "published", "ALIAS_NOT_SHOWN");
    const linked = await save(crowd.accountKey, "crowd-linked", "crowd-linked", null, (value) => {
      value.topic = { key: "linked-topic", name: "Linked", other_names: [], related: ["crowded-topic"] };
      value.forms = ["linked-form"]; });
    assert((await publisher.publish(await copy(crowd.accountKey, linked))).outcome === "published", "LINKED_NOT_SHOWN");
    const apart = await save(crowd.accountKey, "crowd-apart", "crowd-apart", null, (value) => {
      value.topic = { key: "apart-topic", name: "Apart", other_names: [], related: [] }; value.forms = ["apart-form"]; });
    assert((await publisher.publish(await copy(crowd.accountKey, apart))).outcome === "published", "APART_NOT_SHOWN");
    const newcomer = await save(crowd.accountKey, "crowd-new", "crowd-new", null, crowded);
    const firstPage = await publisher.conflictCandidates(crowd.accountKey, newcomer, null, 200);
    const everyCandidate = await candidatesOf(crowd.accountKey, newcomer);
    assert(firstPage.length === 200 && everyCandidate.length === 205 &&
      new Set(everyCandidate.map(conflictCandidateId)).size === 205, `CANDIDATES_CAPPED_${everyCandidate.length}`);
    assert(everyCandidate.every(({ topicKey }) => topicKey !== "apart-topic"), "UNRELATED_TOPIC_A_CANDIDATE");
    checks.push("conflict_candidates_are_every_shown_copy_on_linked_topics_and_names_without_a_cap");

    // Codex's review, finding 4: admission is serialized per topic and checked against the set compared. A check made
    // before another copy was shown is refused as stale; a publication holding the topic's lock makes the next one wait,
    // which then finds its comparison stale; a check the reader could not make holds the copy.
    const racer = await account("racer");
    const late = await save(racer.accountKey, "racer-late", "racer-late", null, crowded);
    const lateCheck = await copy(racer.accountKey, late);
    const meanwhile = await save(racer.accountKey, "racer-meanwhile", "racer-meanwhile", null, crowded);
    assert((await publisher.publish(await copy(racer.accountKey, meanwhile))).outcome === "published", "MEANWHILE_NOT_SHOWN");
    assert((await publisher.publish(lateCheck)).outcome === "comparison_stale", "STALE_COMPARISON_ACCEPTED");
    const blocker = await save(racer.accountKey, "racer-blocker", "racer-blocker", null, crowded);
    const blockerCheck = await copy(racer.accountKey, blocker);
    const waiting = await save(racer.accountKey, "racer-waiting", "racer-waiting", null, crowded);
    const waitingCheck = await copy(racer.accountKey, waiting);
    const holder = await access.connect();
    let settled = false;
    let waited: Awaited<ReturnType<typeof publisher.publish>> | undefined;
    try {
      await holder.query("BEGIN");
      const held = await holder.query<{ outcome: string }>(`SELECT outcome FROM ${SCHEMA}.publish_research_dossier_version(
        $1, $2::uuid, $3::jsonb, $4::text[], 'read', '{}'::text[], $5::timestamptz)`,
      [racer.accountKey, blocker, JSON.stringify(blockerCheck.payload), [...blockerCheck.compared], AT.toISOString()]);
      assert(held.rows[0]?.outcome === "published", "BLOCKER_NOT_PUBLISHED");
      const pending = publisher.publish(waitingCheck).then((result) => { settled = true; waited = result; });
      await new Promise((resolve) => setTimeout(resolve, 600));
      assert(!settled, "SECOND_ADMISSION_DID_NOT_WAIT_FOR_THE_TOPIC");
      await holder.query("COMMIT");
      await pending;
    } finally {
      holder.release();
    }
    assert(waited?.outcome === "comparison_stale", "WAITING_ADMISSION_NOT_STALE");
    const notRead = await publisher.publish({ ...(await copy(racer.accountKey, waiting)), compared: [],
      conflictCheck: "not_read" });
    assert(notRead.outcome === "published" && notRead.state === "held" &&
      notRead.holdReasons.join() === "conflict_check_pending", "UNREAD_CHECK_NOT_HELD");
    const conflicting = await save(racer.accountKey, "racer-conflict", "racer-conflict", null, crowded);
    const conflictCheck = await copy(racer.accountKey, conflicting);
    const importantConflict = await publisher.publish({ ...conflictCheck,
      conflictFindings: [`f1:${conflictCheck.compared[0]}:f1`] });
    assert(importantConflict.outcome === "published" && importantConflict.holdReasons.join() === "important_conflict",
      "IMPORTANT_CONFLICT_NOT_HELD");
    checks.push("admission_is_serialized_per_topic_and_rechecks_the_comparison_set");

    // Codex's re-review, P0 (his race: a review's show committed while an automatic publication waited, and both copies
    // showed though the publication's comparison held neither). A review's show now holds the topic's locks: the
    // publication waits for it, then finds its comparison stale and compares again. The other way round, each review
    // transition that changes what is shown (show, accept, hold, take down, the living-person decision, a revised mark)
    // waits while a publication holds the topic.
    const reviewer = await account("review-race");
    const raced = (value: Record<string, any>) => {
      value.topic = { key: "review-race-topic", name: "Review race", other_names: [], related: [] };
      value.forms = ["review-race-form"];
    };
    const heldForReview = await save(reviewer.accountKey, "race-held", "race-held", null,
      (value) => { raced(value); moderate(value); });
    const reviewHeld = await publisher.publish(await copy(reviewer.accountKey, heldForReview));
    assert(reviewHeld.outcome === "published" && reviewHeld.state === "held", "RACE_HELD_NOT_HELD");
    const automatic = await save(reviewer.accountKey, "race-automatic", "race-automatic", null, raced);
    const automaticCheck = await copy(reviewer.accountKey, automatic);
    assert(automaticCheck.compared.length === 0, "RACE_TOPIC_NOT_EMPTY");
    const reviewing = await reviewPool.connect();
    let admitted: Awaited<ReturnType<typeof publisher.publish>> | undefined;
    let admittedSettled = false;
    try {
      await reviewing.query("BEGIN");
      const shownByReview = await reviewing.query<{ outcome: string; state: string }>(`SELECT outcome, state
        FROM ${SCHEMA}.decide_research_dossier_publication($1, 1, 'show', NULL, '{}'::text[], 'read', '{}'::text[], NULL,
          '{}'::text[], $2::timestamptz)`,
      [reviewHeld.publicNumber, AT.toISOString()]);
      assert(shownByReview.rows[0]?.outcome === "decided" && shownByReview.rows[0].state === "shown",
        "RACE_REVIEW_SHOW_WRONG");
      const waiting = publisher.publish(automaticCheck).then((result) => { admittedSettled = true; admitted = result; });
      await new Promise((resolve) => setTimeout(resolve, 600));
      assert(!admittedSettled, "PUBLICATION_DID_NOT_WAIT_FOR_THE_REVIEWS_SHOW");
      await reviewing.query("COMMIT");
      await waiting;
    } finally {
      reviewing.release();
    }
    assert(admitted?.outcome === "comparison_stale", `PUBLICATION_ADMITTED_BESIDE_THE_REVIEWS_SHOW_${admitted?.outcome}`);
    const recompared = await publisher.publish(await copy(reviewer.accountKey, automatic));
    assert(recompared.outcome === "published" &&
      (await candidatesOf(reviewer.accountKey, automatic)).some(({ publicNumber }) => publicNumber === reviewHeld.publicNumber),
    "RECOMPARISON_WITHOUT_THE_REVIEWED_COPY");
    // Each transition that changes what is shown waits while a publication holds the topic's locks.
    const shownCopy = async (label: string, change: (value: Record<string, any>) => void = () => undefined) => {
      const version = await save(reviewer.accountKey, label, label, null, (value) => { raced(value); change(value); });
      const result = await publisher.publish(await copy(reviewer.accountKey, version));
      assert(result.outcome === "published", `RACE_${label.toUpperCase()}_NOT_PUBLISHED`);
      return result.publicNumber;
    };
    const transitions: Array<[string, () => Promise<unknown>]> = [];
    const toShow = await shownCopy("race-to-show", moderate);
    transitions.push(["show", () => review.decide({ publicNumber: toShow, versionNumber: 1, decision: "show", reason: null,
      at: AT })]);
    const toAccept = await shownCopy("race-to-accept", moderate);
    transitions.push(["accept", () => review.decide({ publicNumber: toAccept, versionNumber: 1, decision: "accept",
      reason: null, at: AT })]);
    const toHold = await shownCopy("race-to-hold");
    transitions.push(["hold", () => review.decide({ publicNumber: toHold, versionNumber: 1, decision: "hold",
      reason: "A misread figure", at: AT })]);
    const toTakeDown = await shownCopy("race-to-take-down");
    transitions.push(["take_down", () => review.decide({ publicNumber: toTakeDown, versionNumber: 1, decision: "take_down",
      reason: "A misread figure", at: AT })]);
    const toName = await shownCopy("race-to-name", (value) => { value.names_living_people = true; });
    transitions.push(["living_person", () => review.decideLivingPerson({ publicNumber: toName, versionNumber: 1,
      reason: "A public figure in office", decidedBy: "reviewer:0123456789abcdef", at: AT })]);
    const toRevise = await shownCopy("race-to-revise");
    transitions.push(["revise", () => review.reviseImportance({ publicNumber: toRevise, versionNumber: 1, findingId: "f1",
      importance: "decision_changing", reason: "It changes a decision", revisedBy: "reviewer:fedcba9876543210", at: AT })]);
    for (const [name, transition] of transitions) {
      const blocking = await save(reviewer.accountKey, `race-blocking-${name}`, `race-blocking-${name}`, null, raced);
      const blockingCheck = await copy(reviewer.accountKey, blocking);
      const holding = await access.connect();
      let settled = false;
      try {
        await holding.query("BEGIN");
        const held = await holding.query<{ outcome: string }>(`SELECT outcome FROM ${SCHEMA}.publish_research_dossier_version(
          $1, $2::uuid, $3::jsonb, $4::text[], 'read', '{}'::text[], $5::timestamptz)`,
        [reviewer.accountKey, blocking, JSON.stringify(blockingCheck.payload), [...blockingCheck.compared], AT.toISOString()]);
        assert(held.rows[0]?.outcome === "published", `RACE_BLOCKER_${name.toUpperCase()}_NOT_PUBLISHED`);
        const waiting = transition().then(() => { settled = true; });
        await new Promise((resolve) => setTimeout(resolve, 300));
        assert(!settled, `REVIEW_${name.toUpperCase()}_DID_NOT_WAIT_FOR_THE_TOPIC`);
        await holding.query("COMMIT");
        await waiting;
      } finally {
        holding.release();
      }
    }
    checks.push("every_review_transition_that_changes_what_is_shown_takes_the_topic_locks");

    // Codex's third review, P1 (his reversed probe): a copy held while nothing showed on its topic, then an opposite one
    // shown at once; the owner's show put up both though neither had been compared with the other. His own call, a show
    // with no comparison, is now refused as stale; compared with the shown dossier, an important conflict shows nothing;
    // the owner's override shows it and is recorded with who and when; the reader's view keeps the pairs, and the pages
    // list the disagreement on the topic and on both dossiers' pages.
    {
      const late = await account("third-review-late");
      const configure = (value: Record<string, any>) => {
        value.topic = { key: "third-review-late", name: "Late review", other_names: [], related: [] };
        value.forms = ["third-review-form"];
      };
      const heldVersion = await save(late.accountKey, "third-held", "third-held", null, (value) => {
        configure(value); moderate(value); value.findings[0].claim = "The treatment increases mortality."; });
      const heldInput = await copy(late.accountKey, heldVersion);
      const heldCopy = await publisher.publish(heldInput);
      assert(heldCopy.outcome === "published" && heldCopy.state === "held" && heldInput.compared.length === 0,
        "PROBE_HELD_WRONG");
      const autoVersion = await save(late.accountKey, "third-auto", "third-auto", null, (value) => {
        configure(value); value.findings[0].claim = "The treatment reduces mortality."; });
      const autoInput = await copy(late.accountKey, autoVersion);
      const autoCopy = await publisher.publish(autoInput);
      assert(autoCopy.outcome === "published" && autoCopy.state === "shown" && autoInput.compared.length === 0,
        "PROBE_AUTOMATIC_NOT_SHOWN");
      const showHeld = { publicNumber: heldCopy.publicNumber, versionNumber: 1, decision: "show" as const, reason: null,
        at: AT };
      assert((await plainDecide(showHeld)).outcome === "comparison_stale", "PROBE_SHOWN_WITHOUT_A_COMPARISON");
      const candidates = (await review.showCandidates(heldCopy.publicNumber, 1, null, 200)).map(conflictCandidateId);
      assert(candidates.join() === `${autoCopy.publicNumber}/1`, `PROBE_CANDIDATES_WRONG_${candidates.join()}`);
      const conflict: ResearchDossierShowCheck = { compared: candidates, conflictCheck: "read",
        conflictFindings: [`f1:${autoCopy.publicNumber}/1:f1`], overrideBy: null, overrideConflicts: [] };
      const found = await review.decide({ ...showHeld, check: conflict });
      assert(found.outcome === "conflict_found" && found.state === "held", `PROBE_CONFLICT_SHOWN_${found.outcome}`);
      assert((await review.decideLivingPerson({ publicNumber: heldCopy.publicNumber, versionNumber: 1, reason: "x",
        decidedBy: "reviewer:0011223344556677", check: conflict, at: AT })).outcome === "not_decidable",
      "PROBE_LIVING_PERSON_PATH_OPEN");
      assert((await pages.listShown({ topicKeys: ["third-review-late"], limit: 10 })).length === 1,
        "PROBE_BOTH_SHOWN_WITHOUT_AN_OVERRIDE");
      // The same comparison without the automatic copy is stale; one that could not be made needs the override too.
      assert((await review.decide({ ...showHeld, check: { ...conflict, compared: [], conflictFindings: [] } })).outcome ===
        "comparison_stale", "PROBE_PARTIAL_COMPARISON_ACCEPTED");
      assert((await review.decide({ ...showHeld, check: { compared: candidates, conflictCheck: "not_read",
        conflictFindings: [], overrideBy: null, overrideConflicts: [] } })).outcome === "conflict_not_checked",
      "PROBE_UNREAD_CHECK_SHOWN");
      const overrideBy = "reviewer:0011223344556677";
      const overridden = await review.decide({ ...showHeld, check: { ...conflict, overrideBy,
        overrideConflicts: [autoCopy.publicNumber] } });
      assert(overridden.outcome === "decided" && overridden.state === "shown", `PROBE_OVERRIDE_NOT_SHOWN_${overridden.outcome}`);
      const row = (await review.inspect(heldCopy.publicNumber))[0]!;
      assert(row.conflictOverride?.by === overrideBy && row.conflictOverride.at === AT.toISOString() &&
        row.conflictsWith.join() === autoCopy.publicNumber && row.conflictFindings.join() === conflict.conflictFindings[0],
      "PROBE_OVERRIDE_NOT_RECORDED");
      const events = await admin.query<{ event: string; reason: string | null }>(`SELECT event, reason
        FROM ${SCHEMA}.research_dossier_public_events WHERE public_number = $1 ORDER BY event_id`, [heldCopy.publicNumber]);
      assert(events.rows.some(({ event, reason }) => event === "conflict_overridden" &&
        reason === `${overrideBy} over ${autoCopy.publicNumber}`), "PROBE_OVERRIDE_EVENT_MISSING");
      const shownNow = await pages.listShown({ topicKeys: ["third-review-late"], limit: 10 });
      assert(shownNow.length === 2 && shownNow.find(({ publicNumber }) => publicNumber === heldCopy.publicNumber)
        ?.conflictFindings.join() === conflict.conflictFindings[0], "PROBE_READER_MISSES_THE_PAIR");
      assert((await pages.listShown({ conflictsWith: [autoCopy.publicNumber], limit: 10 })).map(({ publicNumber }) =>
        publicNumber).join() === heldCopy.publicNumber, "PROBE_REVERSE_LOOKUP_WRONG");
      const topicModel = await loadDossierTopic(pages, "third-review-late");
      assert(topicModel?.disagreements.some(({ found, left, right }) => found === "check" &&
        left.claim === "The treatment increases mortality." && right.claim === "The treatment reduces mortality.") === true,
      "PROBE_TOPIC_PAGE_MISSES_THE_DISAGREEMENT");
      for (const number of [heldCopy.publicNumber, autoCopy.publicNumber]) {
        assert((await loadDossierPage(pages, number))?.disagreements.some(({ found }) => found === "check") === true,
          `PROBE_DOSSIER_PAGE_${number}_MISSES_THE_DISAGREEMENT`);
      }
      await expectError(() => admin.query(`UPDATE ${SCHEMA}.research_dossier_public_versions
        SET conflict_findings = '{nonsense}' WHERE public_number = $1`, [heldCopy.publicNumber]), /./u,
      "PROBE_PAIRS_REWRITTEN");
    }
    checks.push("an_owners_show_is_compared_first_and_shows_a_conflict_only_on_a_recorded_override");

    // Codex's fourth review, P1 (his probe): an override prepared while the comparison could not be made named the one
    // shown candidate; the show waited behind another publication on the topic and then showed with two candidates
    // current. The admission gate checks the set for a comparison not read too: the show is refused as stale, with the
    // set it has now, and the owner's review, comparing again, presents both shown dossiers.
    {
      const prober = await account("fourth-review-unread");
      const topicOf = (value: Record<string, any>) => {
        value.topic = { key: "fourth-review-unread", name: "Fourth review unread", other_names: [], related: [] };
        value.forms = ["fourth-review-unread-form"];
      };
      const heldVersion = await save(prober.accountKey, "fourth-unread-held", "fourth-unread-held", null,
        (value) => { topicOf(value); moderate(value); });
      const held = await publisher.publish(await copy(prober.accountKey, heldVersion));
      const firstVersion = await save(prober.accountKey, "fourth-unread-first", "fourth-unread-first", null, topicOf);
      const first = await publisher.publish(await copy(prober.accountKey, firstVersion));
      assert(held.outcome === "published" && held.state === "held" && first.outcome === "published" &&
        first.state === "shown", "UNREAD_PROBE_SETUP_WRONG");
      const prepared: ResearchDossierShowCheck = { compared: [`${first.publicNumber}/1`], conflictCheck: "not_read",
        conflictFindings: [], overrideBy: "reviewer:0011223344556677", overrideConflicts: [first.publicNumber] };
      const secondVersion = await save(prober.accountKey, "fourth-unread-second", "fourth-unread-second", null, topicOf);
      const secondCheck = await copy(prober.accountKey, secondVersion);
      const holding = await access.connect();
      let decided: Awaited<ReturnType<typeof plainDecide>> | undefined;
      let settled = false;
      let second = "";
      try {
        await holding.query("BEGIN");
        const written = await holding.query<{ public_number: string; state: string }>(`SELECT public_number, state
          FROM ${SCHEMA}.publish_research_dossier_version($1, $2::uuid, $3::jsonb, $4::text[], 'read', '{}'::text[],
          $5::timestamptz)`, [prober.accountKey, secondVersion, JSON.stringify(secondCheck.payload),
          [...secondCheck.compared], AT.toISOString()]);
        assert(written.rows[0]?.state === "shown", "UNREAD_PROBE_SECOND_NOT_SHOWN");
        second = written.rows[0].public_number;
        const waiting = plainDecide({ publicNumber: held.publicNumber, versionNumber: 1, decision: "show", reason: null,
          check: prepared, at: AT }).then((result) => { settled = true; decided = result; });
        await new Promise((resolve) => setTimeout(resolve, 300));
        assert(!settled, "UNREAD_PROBE_SHOW_DID_NOT_WAIT");
        await holding.query("COMMIT");
        await waiting;
      } finally {
        holding.release();
      }
      const now = [`${first.publicNumber}/1`, `${second}/1`].sort();
      assert(decided?.outcome === "comparison_stale" && decided.compared.join() === now.join(),
        `UNREAD_OVERRIDE_SHOWN_FOR_ANOTHER_SET_${decided?.outcome}`);
      assert((await review.inspect(held.publicNumber))[0]!.state === "held", "UNREAD_PROBE_COPY_SHOWN");
      const ownerReview = new AtlasDossierReview({ store: review, now: () => AT });
      const answer = await ownerReview.run({ action: "show_dossier", dossier: held.publicNumber,
        reviewer: "auth0|synthetic-owner", dossierOverrideConflicts: [first.publicNumber] });
      assert(!answer.ok && answer.text.includes(`(${first.publicNumber} and ${second})`) &&
        answer.text.includes(`but not ${second}.`), `UNREAD_PROBE_SET_NOT_PRESENTED_${answer.text}`);
      assert((await pages.listShown({ topicKeys: ["fourth-review-unread"], limit: 10 })).length === 2,
        "UNREAD_PROBE_PAGES_WRONG");
    }
    checks.push("an_unread_comparison_made_for_another_set_is_refused_and_the_set_now_presented");

    // Codex's fourth review, P1: the cut at 50 came before the override's scope was worked out, so with 51 important
    // conflicts an override naming 50 showed the copy and the fifty-first was on no page. The gate works out the scope
    // from the whole comparison: with 50 named or all 51, the copy stays held, and the owner is told why.
    {
      const crowd = await account("fourth-review-crowd");
      const topicOf = (value: Record<string, any>) => {
        value.topic = { key: "fourth-review-crowd", name: "Fourth review crowd", other_names: [], related: [] };
        value.forms = ["fourth-review-crowd-form"];
      };
      const heldVersion = await save(crowd.accountKey, "fourth-crowd-held", "fourth-crowd-held", null,
        (value) => { topicOf(value); moderate(value); });
      const held = await publisher.publish(await copy(crowd.accountKey, heldVersion));
      assert(held.outcome === "published" && held.state === "held", "CROWD_HELD_WRONG");
      const shown: string[] = [];
      for (let place = 0; place < 51; place += 1) {
        const version = await save(crowd.accountKey, `fourth-crowd-${place}`, `fourth-crowd-${place}`, null, topicOf);
        const result = await publisher.publish(await copy(crowd.accountKey, version));
        assert(result.outcome === "published" && result.state === "shown", `CROWD_${place}_NOT_SHOWN`);
        shown.push(result.publicNumber);
      }
      const opposed: DossierConflictReader = async (request) => ({ status: "read",
        conflicts: request.shown.map(({ dossier }) => ({ finding: "f1", dossier, theirs: "f1" })) });
      const ownerReview = new AtlasDossierReview({ store: review, now: () => AT, conflictReader: opposed });
      for (const named of [shown.slice(0, 50), shown]) {
        const answer = await ownerReview.run({ action: "show_dossier", dossier: held.publicNumber,
          reviewer: "auth0|synthetic-owner", dossierOverrideConflicts: named });
        assert(!answer.ok && answer.text.includes("That is 51 shown dossiers, more than the 50 an override can cover " +
          "and the pages can list, so it stays held; no override can show it."), `CROWD_${named.length}_NOT_REFUSED`);
      }
      const candidates = (await review.showCandidates(held.publicNumber, 1, null, 200)).map(conflictCandidateId);
      const everyPair = candidates.map((candidate) => `f1:${candidate}:f1`);
      const overLimit = await plainDecide({ publicNumber: held.publicNumber, versionNumber: 1, decision: "show",
        reason: null, at: AT, check: { compared: candidates, conflictCheck: "read", conflictFindings: everyPair,
          overrideBy: "reviewer:0011223344556677", overrideConflicts: shown } });
      assert(overLimit.outcome === "conflicts_over_limit" && overLimit.required.length === 51,
        `CROWD_STORE_ADMITTED_${overLimit.outcome}`);
      assert((await review.inspect(held.publicNumber))[0]!.state === "held", "CROWD_COPY_SHOWN");
    }
    checks.push("fifty_one_important_conflicts_keep_the_copy_held_whatever_the_override_names");

    // Codex's fifth review, P2 (his three probes): what the gate kept is the one source of the store, the pages and the
    // owner's words. An automatic publication keeps its pairs, and its page lists them; a pair the reader repeats 51
    // times is one pair in the store, on the page and in the words; a pair is important when either finding is, so the
    // words never call this copy's background finding important.
    {
      const fifth = await account("fifth-review");
      const topicOf = (key: string, weight: "context" | null) => (value: Record<string, any>) => {
        value.topic = { key, name: `Fifth review ${key}`, other_names: [], related: [] };
        value.forms = [`${key}-form`];
        if (weight !== null) for (const finding of value.findings) finding.importance = weight;
      };
      const background = topicOf("fifth-review-pairs", "context");
      const baseVersion = await save(fifth.accountKey, "fifth-base", "fifth-base", null, background);
      const base = await publisher.publish(await copy(fifth.accountKey, baseVersion));
      assert(base.outcome === "published" && base.state === "shown", "FIFTH_BASE_NOT_SHOWN");
      const pair = `f1:${base.publicNumber}/1:f1`;
      const laterVersion = await save(fifth.accountKey, "fifth-later", "fifth-later", null, background);
      const later = await publisher.publish(await copy(fifth.accountKey, laterVersion,
        { conflictFindings: Array.from({ length: 51 }, () => pair) }));
      assert(later.outcome === "published" && later.state === "shown", "FIFTH_AUTOMATIC_NOT_SHOWN");
      const automatic = (await review.inspect(later.publicNumber))[0]!;
      assert(stableJson(automatic.conflictFindings) === stableJson([pair]) &&
        stableJson(automatic.conflictsWith) === stableJson([base.publicNumber]), "FIFTH_AUTOMATIC_PAIR_NOT_KEPT");
      assert((await loadDossierPage(pages, later.publicNumber))!.disagreements
        .filter(({ found }) => found === "check").length === 1, "FIFTH_AUTOMATIC_PAIR_NOT_ON_PAGE");

      const heldVersion = await save(fifth.accountKey, "fifth-held", "fifth-held", null,
        (value) => { background(value); moderate(value); });
      const held = await publisher.publish(await copy(fifth.accountKey, heldVersion));
      assert(held.outcome === "published" && held.state === "held", "FIFTH_HELD_WRONG");
      const repeated: DossierConflictReader = async () => ({ status: "read", conflicts: Array.from({ length: 51 },
        () => ({ finding: "f1", dossier: base.publicNumber, theirs: "f1" })) });
      const answer = await new AtlasDossierReview({ store: review, now: () => AT, conflictReader: repeated }).run({
        action: "show_dossier", dossier: held.publicNumber, reviewer: "auth0|synthetic-owner" });
      assert(answer.ok && answer.text === `${held.publicNumber} version 1 is now shown, at /atlas/dossiers/${
        held.publicNumber}. AskRigor's conflict check read a background finding of it and one of ${base.publicNumber} ` +
        "as contradicting; the pages list the pair.", "FIFTH_REPEATED_PAIR_NOT_COUNTED_ONCE");
      assert(stableJson((await review.inspect(held.publicNumber))[0]!.conflictFindings) === stableJson([pair]),
        "FIFTH_REPEATED_PAIR_NOT_KEPT_ONCE");
      assert((await loadDossierPage(pages, held.publicNumber))!.disagreements
        .filter(({ found }) => found === "check").length === 1, "FIFTH_REPEATED_PAIR_NOT_ON_PAGE_ONCE");

      const markedVersion = await save(fifth.accountKey, "fifth-marked", "fifth-marked", null,
        topicOf("fifth-review-weight", null));
      const marked = await publisher.publish(await copy(fifth.accountKey, markedVersion));
      assert(marked.outcome === "published" && marked.state === "shown", "FIFTH_MARKED_NOT_SHOWN");
      const lightVersion = await save(fifth.accountKey, "fifth-light", "fifth-light", null,
        (value) => { topicOf("fifth-review-weight", "context")(value); moderate(value); });
      const light = await publisher.publish(await copy(fifth.accountKey, lightVersion));
      assert(light.outcome === "published" && light.state === "held", "FIFTH_LIGHT_WRONG");
      const opposite: DossierConflictReader = async () => ({ status: "read",
        conflicts: [{ finding: "f1", dossier: marked.publicNumber, theirs: "f1" }] });
      const weighed = await new AtlasDossierReview({ store: review, now: () => AT, conflictReader: opposite }).run({
        action: "show_dossier", dossier: light.publicNumber, reviewer: "auth0|synthetic-owner" });
      assert(!weighed.ok && !weighed.text.includes("an important finding of it") && weighed.text.startsWith(
        `${light.publicNumber} version 1 was not shown: AskRigor's conflict check read a finding of it and one of ${
          marked.publicNumber} as contradicting, a pair with at least one important finding: its finding f1, `),
      "FIFTH_IMPORTANCE_OVERCLAIMED");
      // Held automatically for a background finding against an important one, it keeps that pair too.
      const heavyPair = `f1:${marked.publicNumber}/1:f1`;
      const heldAutomaticVersion = await save(fifth.accountKey, "fifth-held-automatic", "fifth-held-automatic", null,
        topicOf("fifth-review-weight", "context"));
      const heldAutomatic = await publisher.publish(await copy(fifth.accountKey, heldAutomaticVersion,
        { conflictFindings: [heavyPair] }));
      assert(heldAutomatic.outcome === "published" && heldAutomatic.state === "held" &&
        heldAutomatic.holdReasons.join() === "important_conflict" &&
        stableJson((await review.inspect(heldAutomatic.publicNumber))[0]!.conflictFindings) === stableJson([heavyPair]),
      "FIFTH_HELD_AUTOMATIC_PAIR_NOT_KEPT");
    }
    checks.push("automatic_publication_keeps_its_pairs_counted_once_and_worded_by_either_finding");

    // Codex's sixth review, P2 (his two probes): the server's response sorted and cut the partners on its own. It names
    // what the publisher returns, which is what storage kept: among 50 background partners and one important partner
    // numbered last, the important one; and on a replay whose reader finds nothing, the stored partners still.
    {
      const sixth = await account("sixth-review");
      const topicOf = (weight: "context" | null) => (value: Record<string, any>) => {
        value.topic = { key: "sixth-review-crowd", name: "Sixth review crowd", other_names: [], related: [] };
        value.forms = ["sixth-review-crowd-form"];
        if (weight !== null) for (const finding of value.findings) finding.importance = weight;
      };
      const partners: string[] = [];
      for (let place = 0; place < 51; place += 1) {
        const version = await save(sixth.accountKey, `sixth-${place}`, `sixth-${place}`, null,
          topicOf(place < 50 ? "context" : null));
        const result = await publisher.publish(await copy(sixth.accountKey, version));
        assert(result.outcome === "published" && result.state === "shown", `SIXTH_${place}_NOT_SHOWN`);
        partners.push(result.publicNumber);
      }
      const important = partners.at(-1)!;
      const versionId = await save(sixth.accountKey, "sixth-new", "sixth-new", null, topicOf("context"));
      // As the server's save calls it; the dossier's private number is not read by the publication.
      const publishWith = (conflictReader: DossierConflictReader) => publishResearchDossier({ publisher,
        accountKey: sixth.accountKey, noticeVersion: RESEARCH_USE_NOTICE_VERSION,
        noticeCovering: [RESEARCH_USE_NOTICE_VERSION], versionId, dossierNumber: "ARD-0000",
        stored: savedPayloads.get(versionId)!, conflictReader, at: AT });
      const opposed: DossierConflictReader = async (request) => ({ status: "read",
        conflicts: request.shown.map(({ dossier }) => ({ finding: "f1", dossier, theirs: "f1" })) });
      const published = await publishWith(opposed);
      assert(published.status === "held" && published.public_id !== undefined, `SIXTH_NOT_HELD_${published.status}`);
      const kept = (await review.inspect(published.public_id))[0]!.conflictsWith;
      assert(kept.length === 50 && kept.includes(important) &&
        stableJson(published.conflicts_with) === stableJson(kept), "SIXTH_RESPONSE_NOT_WHAT_STORAGE_KEPT");
      const replayed = await publishWith(async () => ({ status: "read", conflicts: [] }));
      assert(stableJson(replayed) === stableJson(published), "SIXTH_REPLAY_LOST_THE_STORED_PARTNERS");
    }
    checks.push("the_publication_response_names_what_storage_kept_also_on_a_replay");

    // Codex's fourth review: a copy becomes shown only through the admission gate. Each way of making one shown is sent
    // through a stale set and through an incomplete override (for the automatic ones, which take none, no override); each
    // ends refused or held, and nothing new shows. A statement that shows a copy without the gate is refused itself.
    {
      const owner = await account("fourth-review-ways");
      const others = await account("fourth-review-ways-others");
      const topicOf = (value: Record<string, any>) => {
        value.topic = { key: "fourth-review-ways", name: "Fourth review ways", other_names: [], related: [] };
        value.forms = ["fourth-review-ways-form"];
      };
      const publishOn = async (who: { accountKey: string }, label: string,
        change: (value: Record<string, any>) => void = () => undefined) => {
        const version = await save(who.accountKey, label, label, null, (value) => { topicOf(value); change(value); });
        const result = await publisher.publish(await copy(who.accountKey, version));
        assert(result.outcome === "published", `WAYS_${label.toUpperCase()}_NOT_PUBLISHED`);
        return { version, publicNumber: result.publicNumber, state: result.state };
      };
      const x = await publishOn(others, "ways-x");
      const y = await publishOn(others, "ways-y");
      const toShow = await publishOn(owner, "ways-show", moderate);
      const toAccept = await publishOn(owner, "ways-accept", moderate);
      const toName = await publishOn(owner, "ways-name", (value) => { value.names_living_people = true; });
      const toAdmit = await publishOn(owner, "ways-admit", (value) => { delete value.stamp.privacy_reading; });
      const toRevise = await publishOn(owner, "ways-revise");
      assert(x.state === "shown" && y.state === "shown" && toShow.state === "held" && toAccept.state === "held" &&
        toName.state === "held" && toAdmit.state === "held" && toRevise.state === "shown", "WAYS_SETUP_WRONG");
      const sha = (await review.inspect(toAdmit.publicNumber))[0]!.payloadSha256!;
      assert((await review.recordPrivacyReading({ publicNumber: toAdmit.publicNumber, versionNumber: 1, contentSha256: sha,
        reading: { status: "pass" }, at: AT })).outcome === "recorded", "WAYS_ADMIT_PASS_NOT_RECORDED");
      const automatic = await save(owner.accountKey, "ways-automatic", "ways-automatic", null, topicOf);
      const current = async (publicNumber: string, withOwn: boolean) =>
        (await review.showCandidates(publicNumber, 1, null, 200))
          .filter((candidate) => withOwn || candidate.publicNumber !== publicNumber).map(conflictCandidateId);
      const stale = (): ResearchDossierShowCheck => ({ compared: [], conflictCheck: "read", conflictFindings: [],
        overrideBy: null, overrideConflicts: [] });
      const incomplete = (compared: string[], override: boolean): ResearchDossierShowCheck => ({ compared,
        conflictCheck: "read", conflictFindings: [`f1:${x.publicNumber}/1:f1`, `f1:${y.publicNumber}/1:f1`],
        overrideBy: override ? "reviewer:0011223344556677" : null, overrideConflicts: override ? [x.publicNumber] : [] });
      const ways: Array<[string, (check: ResearchDossierShowCheck) => Promise<string>, () => Promise<ResearchDossierShowCheck>]> = [
        ["show", async (check) => (await plainDecide({ publicNumber: toShow.publicNumber, versionNumber: 1,
          decision: "show", reason: null, check, at: AT })).outcome,
        async () => incomplete(await current(toShow.publicNumber, false), true)],
        ["accept", async (check) => (await plainDecide({ publicNumber: toAccept.publicNumber, versionNumber: 1,
          decision: "accept", reason: null, check, at: AT })).outcome,
        async () => incomplete(await current(toAccept.publicNumber, false), true)],
        ["living_person", async (check) => (await plainDecideLivingPerson({ publicNumber: toName.publicNumber,
          versionNumber: 1, reason: "A public figure in office", decidedBy: "reviewer:0123456789abcdef", check, at: AT }))
          .outcome, async () => incomplete(await current(toName.publicNumber, false), true)],
        ["revise", async (check) => (await review.reviseImportance({ publicNumber: toRevise.publicNumber,
          versionNumber: 1, findingId: "f2", importance: "important", reason: "A reviewed mark",
          revisedBy: "reviewer:fedcba9876543210", check, at: AT })).outcome,
        async () => incomplete(await current(toRevise.publicNumber, false), true)],
        ["admission_after_privacy", async (check) => (await review.admitAfterPrivacy({
          publicNumber: toAdmit.publicNumber, versionNumber: 1, check, at: AT })).outcome,
        async () => incomplete(await current(toAdmit.publicNumber, true), false)],
        ["automatic_publication", async (check) => {
          const result = await publisher.publish({ ...(await copy(owner.accountKey, automatic)),
            compared: check.compared, conflictCheck: check.conflictCheck, conflictFindings: check.conflictFindings });
          return result.outcome === "published" ? `${result.outcome}:${result.state}:${result.holdReasons.join()}`
            : result.outcome;
        }, async () => incomplete((await candidatesOf(owner.accountKey, automatic)).map(conflictCandidateId), false)],
      ];
      const ends: Record<string, [string, string]> = {
        show: ["comparison_stale", "conflict_found"], accept: ["comparison_stale", "conflict_found"],
        living_person: ["comparison_stale", "conflict_found"], revise: ["comparison_stale", "conflict_found"],
        admission_after_privacy: ["comparison_stale", "held"],
        automatic_publication: ["comparison_stale", "published:held:important_conflict"],
      };
      const before = (await pages.listShown({ topicKeys: ["fourth-review-ways"], limit: 50 }))
        .map(({ publicNumber, versionNumber }) => `${publicNumber}/${versionNumber}`).sort().join();
      for (const [way, attempt, incompleteCheck] of ways) {
        const staleEnd = await attempt(stale());
        const incompleteEnd = await attempt(await incompleteCheck());
        assert(staleEnd === ends[way]![0] && incompleteEnd === ends[way]![1],
          `WAY_${way.toUpperCase()}_ENDED_${staleEnd}_${incompleteEnd}`);
      }
      const after = (await pages.listShown({ topicKeys: ["fourth-review-ways"], limit: 50 }))
        .map(({ publicNumber, versionNumber }) => `${publicNumber}/${versionNumber}`).sort().join();
      assert(before === after, `WAYS_SHOWED_A_COPY_${before}_${after}`);
      // No statement shows a copy but on the gate's admission of exactly its content.
      await expectError(() => admin.query(`UPDATE ${SCHEMA}.research_dossier_public_versions SET state = 'shown',
        hold_reasons = '{}' WHERE public_number = $1 AND version_number = 1`, [toShow.publicNumber]),
      /RESEARCH_DOSSIER_SHOW_NOT_ADMITTED/u, "WAYS_SHOWN_WITHOUT_THE_GATE");
    }
    checks.push("every_way_of_making_a_copy_shown_ends_refused_or_held_on_a_stale_set_or_an_incomplete_override");

    // Codex's review, finding 7: an importance mark changes only by a new, reviewed version: the old one is kept as it
    // was, the new one records who revised it and why, and a dossier's later copy is numbered after it.
    const marked = await account("marked");
    const m1 = await save(marked.accountKey, "marked", "marked-1", null, (value) => {
      value.topic = { key: "marked-topic", name: "Marked", other_names: [], related: [] }; value.forms = ["marked-form"]; });
    const markedCopy = await publisher.publish(await copy(marked.accountKey, m1));
    assert(markedCopy.outcome === "published" && markedCopy.state === "shown", "MARKED_NOT_SHOWN");
    const revision = { publicNumber: markedCopy.publicNumber, versionNumber: 1, findingId: "f1",
      importance: "decision_changing" as const, reason: "It changes what people with diabetes decide",
      revisedBy: "reviewer:fedcba9876543210", at: AT };
    const revisedCopy = await review.reviseImportance(revision);
    assert(revisedCopy.outcome === "revised" && revisedCopy.versionNumber === 2 && revisedCopy.previous === "important",
      "REVISION_WRONG");
    const markedRows = await review.inspect(markedCopy.publicNumber);
    const importanceOf = (payload: Record<string, unknown> | null) =>
      (payload?.findings as Array<{ id: string; importance: string }>).find(({ id }) => id === "f1")!.importance;
    assert(markedRows[0]!.versionNumber === 2 && markedRows[0]!.state === "shown" &&
      importanceOf(markedRows[0]!.payload) === "decision_changing" && markedRows[0]!.revision?.of === 1 &&
      markedRows[0]!.revision.by === "reviewer:fedcba9876543210" && markedRows[1]!.state === "superseded" &&
      importanceOf(markedRows[1]!.payload) === "important", "REVISION_NOT_A_NEW_VERSION");
    assert((await review.reviseImportance({ ...revision, versionNumber: 2 })).outcome === "not_revisable",
      "SAME_MARK_REVISED_AGAIN");
    assert((await review.reviseImportance({ ...revision, versionNumber: 1, importance: "context" })).outcome ===
      "not_revisable", "OLDER_COPY_REVISED");
    const markedHistory = await pages.history([markedCopy.publicNumber]);
    assert(markedHistory.map(({ versionNumber, revised }) => `${versionNumber}:${revised}`).join() === "2:true,1:false",
      "REVISION_HISTORY_WRONG");
    await expectError(() => admin.query(`UPDATE ${SCHEMA}.research_dossier_public_versions SET revision_reason = 'x'
      WHERE public_number = $1 AND version_number = 2`, [markedCopy.publicNumber]),
    /RESEARCH_DOSSIER_PUBLIC_VERSION_IMMUTABLE/u, "REVISION_EDITED_IN_PLACE");
    const m2 = await save(marked.accountKey, "marked", "marked-2", m1, (value) => {
      value.topic = { key: "marked-topic", name: "Marked", other_names: [], related: [] }; value.forms = ["marked-form"]; });
    const markedNext = await publisher.publish(await copy(marked.accountKey, m2));
    assert(markedNext.outcome === "published" && (await review.inspect(markedCopy.publicNumber))[0]!.versionNumber === 3,
      "LATER_COPY_NOT_NUMBERED_AFTER_THE_REVISION");
    checks.push("an_importance_mark_changes_only_by_a_new_reviewed_version");

    // Codex's review, findings 8 and 9: past the newest 500 shown copies an older dossier's page and topic are still
    // read by their own number and key, a topic comes a page at a time, the topics list reads a view of every topic, and
    // the number the pages cache under moves with every change, a revocation's trigger included.
    const filler = await account("filler");
    for (let index = 0; index < 300; index += 1) {
      // Labels whose order is not their keys': capitals and small letters, a letter beyond ASCII, and ties.
      const label = `${["Zulu", "alpha", "Ébène", "Alpha", "zulu"][index % 5]} ${Math.floor(index / 10)}`;
      const version = await save(filler.accountKey, `filler-${index}`, `filler-${index}`, null, (value) => {
        value.topic = { key: `filler-${index}`, name: label, other_names: [], related: [] };
        value.forms = [`filler-form-${index}`]; });
      assert((await publisher.publish(await copy(filler.accountKey, version))).outcome === "published", `FILLER_${index}`);
    }
    const shownCount = (await admin.query<{ shown: string }>(
      `SELECT count(*)::text AS shown FROM ${SCHEMA}.research_dossier_public_pages`)).rows[0]!.shown;
    assert(Number(shownCount) > 500, `NOT_PAST_500_${shownCount}`);
    assert((await loadDossierPage(pages, derived.publicNumber))?.shown.copy.publicNumber === derived.publicNumber,
      "OLDER_DOSSIER_PAGE_NOT_FOUND");
    const crowdedPage = await loadDossierTopic(pages, "crowded-topic", async () => undefined, 11);
    assert(crowdedPage !== undefined && crowdedPage.page === 11 && crowdedPage.dossiers.length > 0,
      "LATER_TOPIC_PAGE_NOT_FOUND");
    // Codex's re-review, P1: the topics list comes a page at a time, never whole; his third review, P2: in the order of
    // the labels, the key breaking ties, after the last label and key, with the card topics placed by their own labels.
    // The database's order and the server's agree exactly, capitals, letters beyond ASCII and ties included.
    const cards = [{ key: "filler-7", label: "Card filler", count: 3 }, { key: "card-only", label: "Card only", count: 1 }];
    const topicList: Array<{ key: string; label: string; count: number }> = [];
    for (let after: { label: string; key: string } | undefined; ;) {
      const index = await loadDossierTopicIndex(pages, cards, after);
      assert(index.topics.length <= DOSSIER_TOPIC_INDEX_PER_PAGE, "TOPIC_INDEX_PAGE_TOO_LONG");
      topicList.push(...index.topics);
      if (!index.more) break;
      after = index.topics.at(-1)!;
    }
    const keys = topicList.map(({ key }) => key);
    const dossierTopics = Number((await admin.query<{ topics: string }>(
      `SELECT count(*)::text AS topics FROM ${SCHEMA}.research_dossier_public_topics`)).rows[0]!.topics);
    assert(keys.includes("synthetic-topic") && keys.includes("filler-299") && keys.length === dossierTopics + 1 &&
      new Set(keys).size === keys.length &&
      topicList.every((topic, place) => place === 0 || publicDossierTopicOrder(topicList[place - 1]!, topic) < 0),
    `TOPIC_LIST_INCOMPLETE_${keys.length}_${dossierTopics}`);
    const cardFiller = topicList.find(({ key }) => key === "filler-7");
    assert(cardFiller?.label === "Card filler" && cardFiller.count === 5, "CARD_TOPIC_NOT_MERGED");
    const sqlOrder = (await readerPool.query<{ topic_key: string; name: string }>(`SELECT topic_key, name
      FROM ${SCHEMA}.research_dossier_public_topics
      ORDER BY translate(name, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') COLLATE "C",
        topic_key COLLATE "C"`)).rows.map(({ topic_key: key, name: label }) => ({ key, label }));
    assert(sqlOrder.map(({ key }) => key).join() ===
      [...sqlOrder].sort(publicDossierTopicOrder).map(({ key }) => key).join(), "TOPIC_ORDER_DIFFERS_FROM_THE_SERVERS");
    const beforeRevocation = await pages.generation();
    const watched = await account("watched");
    const w1 = await save(watched.accountKey, "watched", "watched-1", null, (value) => {
      value.topic = { key: "watched-topic", name: "Watched", other_names: [], related: [] }; value.forms = ["watched-form"]; });
    await publisher.publish(await copy(watched.accountKey, w1));
    const afterPublish = await pages.generation();
    assert(afterPublish !== beforeRevocation, "GENERATION_STILL_AFTER_PUBLISH");
    await service.revoke(watched.subject);
    assert(await pages.generation() !== afterPublish, "GENERATION_STILL_AFTER_REVOCATION");
    checks.push("pages_read_by_number_and_topic_past_500_and_their_cache_number_moves_with_revocation");

    // Saving switched off refuses, under the account lock the private append uses.
    const fourth = await account("fourth");
    const f1 = await save(fourth.accountKey, "four", "four-1");
    await service.setFindingsSave(fourth.subject, false);
    assert((await publisher.publish(await copy(fourth.accountKey, f1))).outcome === "account_refused",
      "PUBLISHED_WITH_SAVING_OFF");
    checks.push("saving_off_publishes_nothing");

    // Codex's re-review, P2 (his probe: a shown copy the pages then left out, answering 404): the database repeats the
    // pages' last check at admission. It reads every text as the pages do, without format characters and whatever its
    // case: text for text the same answer as rowPassesPageGuard, every format character in a card's reference included.
    const formatCharacters = Array.from({ length: 0x110000 }, (_, code) => code)
      .filter((code) => (code < 0xD800 || code > 0xDFFF) && /\p{Cf}/u.test(String.fromCodePoint(code)))
      .map((code) => String.fromCodePoint(code));
    const refusedTexts = ["See you\u200Btube.com for the trial.", "As card ARF-\u200B1234 says.", "On YOUTU.BE too.",
      "On youtube-nocoo\u212Aie.com too.", "arf-0001", ...formatCharacters.map((mark) => `ARF-${mark}1234`),
      ...formatCharacters.map((mark) => `you${mark}tube.com`)];
    const passingTexts = ["A YouTube video was not used.", "ARF-123 is not a card.", "youtube dot com", "Kelvin \u212A.",
      "ARF-١٢٣٤ in other digits", "Myo-inositol 2 g a day", "café, naïve, 東京"];
    const parity = await admin.query<{ text: string; passes: boolean }>(`SELECT text,
        ${SCHEMA}.research_dossier_public_passes_page_guard(jsonb_build_object('findings',
          jsonb_build_array(jsonb_build_object('claim', text)))) AS passes
      FROM unnest($1::text[]) AS text`, [[...refusedTexts, ...passingTexts]]);
    for (const { text, passes } of parity.rows) {
      assert(passes === rowPassesPageGuard({ claim: text }) && passes === passingTexts.includes(text),
        `PAGE_GUARD_PARITY_${JSON.stringify(text)}`);
    }
    const guarded = await account("guarded");
    for (const [index, claim] of refusedTexts.slice(0, 5).entries()) {
      const version = await save(guarded.accountKey, `guarded-${index}`, `guarded-${index}`, null, (value) => {
        value.topic = { key: "guarded-topic", name: "Guarded", other_names: [], related: [] };
        value.forms = ["guarded-form"];
        value.findings[0].claim = claim;
      });
      const refusedCopy = await publisher.publish(await copy(guarded.accountKey, version));
      assert(refusedCopy.outcome === "payload_refused", `PAGE_GUARD_NOT_REPEATED_${index}_${refusedCopy.outcome}`);
    }
    assert((await pages.listShown({ topicKeys: ["guarded-topic"], limit: 10 })).length === 0, "GUARDED_COPY_SHOWN");
    checks.push("admission_repeats_the_pages_last_check");

    // Malformed input is refused whole; a copy's content never changes and nothing is deleted.
    await expectError(() => access.query(`SELECT * FROM ${SCHEMA}.publish_research_dossier_version($1, $2::uuid,
      '{}'::jsonb, '{}'::text[], 'read', ARRAY['f1:D-1001'], now())`, [first.accountKey,
      deterministicUuid("publication-acceptance:none")]),
    /RESEARCH_DOSSIER_PUBLISH_INPUT_INVALID/u, "MALFORMED_CONFLICT_PAIR_ACCEPTED");
    await expectError(() => access.query(`SELECT * FROM ${SCHEMA}.publish_research_dossier_version($1, $2::uuid,
      '{}'::jsonb, '{}'::text[], 'not_read', ARRAY['f1:D-1001/1:f1'], now())`, [first.accountKey,
      deterministicUuid("publication-acceptance:none")]),
    /RESEARCH_DOSSIER_PUBLISH_INPUT_INVALID/u, "CONFLICTS_WITHOUT_A_READING_ACCEPTED");
    await expectError(() => admin.query(`UPDATE ${SCHEMA}.research_dossier_public_versions SET public_payload = '{}'::jsonb
      WHERE erased_at IS NULL`), /RESEARCH_DOSSIER_PUBLIC_VERSION_IMMUTABLE/u, "PAYLOAD_CHANGED");
    await expectError(() => admin.query(`DELETE FROM ${SCHEMA}.research_dossier_public_versions`),
      /RESEARCH_DOSSIER_PUBLIC_VERSION_IMMUTABLE/u, "COPY_DELETED");
    await expectError(() => admin.query(`DELETE FROM ${SCHEMA}.research_dossier_public_events`),
      /APPEND_ONLY_TABLE/u, "EVENT_DELETED");
    checks.push("input_refused_whole_and_copies_immutable_and_never_deleted");
    return checks;
  } finally {
    await Promise.allSettled([admin.end(), access.end(), reviewPool.end(), readerPool.end(), accountStore.close(),
      review.close(), eraser.close(), pages.close()]);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]!).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${JSON.stringify({ status: "FAIL", error: error instanceof Error ? error.message : String(error) })}\n`);
    process.exitCode = 1;
  });
}
