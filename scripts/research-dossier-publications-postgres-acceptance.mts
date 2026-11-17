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
  deterministicUuid,
  stableJson,
  type ResearchDossierPublishInput,
} from "../packages/evidence-repository/src/index.js";
import { publicDossierOf } from "../apps/research-mcp/src/findings/dossier-publication.js";

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
  const eraser = new PostgresResearchDossierEraser({ connectionString: reviewUrl, schema: SCHEMA });
  const pages = new PostgresPublicDossierPageSource({ connectionString: readerUrl, schema: SCHEMA });
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
      "research_dossier_public_versions", "research_dossier_public_events"]) {
      for (const [pool, role] of [[access, "ACCESS"], [reviewPool, "REVIEW"], [readerPool, "READER"]] as const) {
        await expectDenied(() => pool.query(`SELECT * FROM ${SCHEMA}.${table}`), `${role}_READS_${table.toUpperCase()}`);
      }
    }
    for (const view of ["research_dossier_public_pages", "research_dossier_public_history"]) {
      await readerPool.query(`SELECT * FROM ${SCHEMA}.${view}`);
      await expectDenied(() => access.query(`SELECT * FROM ${SCHEMA}.${view}`), `ACCESS_READS_${view.toUpperCase()}`);
      await expectDenied(() => reviewPool.query(`SELECT * FROM ${SCHEMA}.${view}`), `REVIEW_READS_${view.toUpperCase()}`);
    }
    const executes = async (role: string, signature: string) => (await admin.query<{ allowed: boolean }>(
      "SELECT has_function_privilege($1, $2, 'EXECUTE') AS allowed", [role, `${SCHEMA}.${signature}`])).rows[0]!.allowed;
    const grants: Record<string, string> = {
      "publish_research_dossier_version(text, uuid, jsonb, text[], boolean, timestamptz)": "askrigor_research_access",
      "research_dossier_topic_publications(text)": "askrigor_research_access",
      "list_research_dossier_publications(text, integer)": "askrigor_research_review",
      "inspect_research_dossier_publication(text)": "askrigor_research_review",
      "decide_research_dossier_publication(text, integer, text, text, timestamptz)": "askrigor_research_review",
      "decide_research_dossier_living_person(text, integer, text, text, timestamptz)": "askrigor_research_review",
      "research_dossier_public_follow_private()": "none",
      "research_dossier_public_on_revocation()": "none",
      "research_dossier_public_version_guard()": "none",
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
            kind: "helps", applies_to: "Adults with a metabolic syndrome", form: "myo-inositol", rests_on: ["r1"],
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
    // The copy the server sends: the saved record's public part as publicDossierOf makes it, and the conflict check.
    const copy = (accountKey: string, versionId: string,
      conflict: { conflictsWith?: string[]; importantConflict?: boolean } = {}): ResearchDossierPublishInput => ({
      accountKey, versionId, payload: publicDossierOf(savedPayloads.get(versionId)!) as unknown as Record<string, unknown>,
      conflictsWith: conflict.conflictsWith ?? [], importantConflict: conflict.importantConflict ?? false, at: AT });
    const moderate = (value: Record<string, any>) => { value.value.confidence = "moderate"; };

    // No notice covers public dossiers until v7's release adds it: an active v6 account publishes nothing.
    const first = await account("first");
    const v1 = await save(first.accountKey, "one", "one-1");
    assert((await publisher.publish(copy(first.accountKey, v1))).outcome === "account_refused",
      "PUBLISHED_WITHOUT_A_COVERING_NOTICE");
    assert((await pages.listShown({ limit: 10 })).length === 0, "PAGE_SHOWS_WITHOUT_A_COVERING_NOTICE");
    checks.push("nothing_published_while_no_notice_covers_public_dossiers");

    // Here only, v6 stands in for the notice v7 that the release would add.
    await admin.query(`INSERT INTO ${SCHEMA}.research_dossier_public_notices (notice_version, added_at) VALUES ($1, $2)`,
      [RESEARCH_USE_NOTICE_VERSION, AT]);
    const published = await publisher.publish(copy(first.accountKey, v1));
    assert(published.outcome === "published" && published.state === "shown" && /^D-1\d{3,}$/u.test(published.publicNumber),
      "FIRST_PUBLISH_WRONG");
    const replay = await publisher.publish(copy(first.accountKey, v1));
    assert(replay.outcome === "replayed" && replay.publicNumber === published.publicNumber, "PUBLISH_REPLAY_WRONG");
    const shown = await pages.listShown({ topicKeys: ["synthetic-topic"], limit: 10 });
    assert(shown.length === 1 && shown[0]!.publicNumber === published.publicNumber && !shown[0]!.accepted &&
      !Object.hasOwn(shown[0]!, "origin"), "READER_VIEW_WRONG");
    const readerColumns = await readerPool.query(`SELECT * FROM ${SCHEMA}.research_dossier_public_pages LIMIT 1`);
    assert(readerColumns.fields.every(({ name }) => !/origin|account|dossier_number|privacy|hold/u.test(name)),
      "READER_VIEW_EXPOSES_PRIVATE_COLUMNS");
    assert((await publisher.topicCopies("synthetic-topic")).length === 1, "TOPIC_COPIES_WRONG");
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
    const honest = copy(deriving.accountKey, d1);
    const tampered = await publisher.publish({ ...honest, payload: { ...honest.payload,
      question: "A question the record never held" } });
    assert(tampered.outcome === "payload_refused", "TAMPERED_PAYLOAD_ACCEPTED");
    const unsized = await save(deriving.accountKey, "deriving-unsized", "deriving-unsized", null, (value) => {
      value.results[1].comparator = "baseline"; });
    assert((await publisher.publish(copy(deriving.accountKey, unsized))).outcome === "payload_refused",
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
    const held = await publisher.publish(copy(first.accountKey, v2));
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
    assert((await publisher.publish(copy(first.accountKey, v3))).outcome === "version_refused",
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
    const secondCopy = await publisher.publish(copy(second.accountKey, s1));
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
    const leavingCopy = await publisher.publish(copy(leaving.accountKey, l1));
    assert(leavingCopy.outcome === "published", "LEAVING_PUBLISH_WRONG");
    assert((await review.decide({ publicNumber: leavingCopy.publicNumber, versionNumber: 1, decision: "accept",
      reason: null, at: AT })).outcome === "decided", "LEAVING_ACCEPT_WRONG");
    const l2 = await save(leaving.accountKey, "leaving", "leaving-2", l1, moderate);
    await publisher.publish(copy(leaving.accountKey, l2));
    const b1 = await save(leaving.accountKey, "leaving-b", "leaving-b-1");
    const reviewedCopy = await publisher.publish(copy(leaving.accountKey, b1));
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
    const thirdCopy = await publisher.publish(copy(third.accountKey, t1));
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
    const pending = await publisher.publish(copy(unread.accountKey, u1));
    assert(pending.outcome === "published" && pending.state === "held" &&
      pending.holdReasons.join() === "privacy_reading_pending", "PRIVACY_PENDING_NOT_HELD");
    for (const decision of ["show", "accept"] as const) {
      assert((await review.decide({ publicNumber: pending.publicNumber, versionNumber: 1, decision, reason: null,
        at: AT })).outcome === "not_decidable", `PRIVACY_PENDING_${decision.toUpperCase()}N`);
    }
    await expectError(() => admin.query(`UPDATE ${SCHEMA}.research_dossier_public_versions SET state = 'shown',
      hold_reasons = '{}' WHERE public_number = $1`, [pending.publicNumber]), /check constraint/u,
    "PRIVACY_PENDING_FORCED_SHOWN");
    assert((await pages.listShown({ publicNumbers: [pending.publicNumber], limit: 1 })).length === 0,
      "PRIVACY_PENDING_ON_A_PAGE");
    checks.push("nothing_shows_without_a_privacy_reading_that_passed_the_saved_content");

    // Codex's review, finding 2: a copy whose claim names a living person shows only on the owner's own decision, with
    // his typed reason and who decided, made once; show and accept refuse it, and nothing forces it up.
    const named = await account("named");
    const n1 = await save(named.accountKey, "named", "named-1", null, (value) => { value.names_living_people = true; });
    const namedCopy = await publisher.publish(copy(named.accountKey, n1));
    assert(namedCopy.outcome === "published" && namedCopy.state === "held", "NAMED_NOT_HELD");
    for (const decision of ["show", "accept"] as const) {
      assert((await review.decide({ publicNumber: namedCopy.publicNumber, versionNumber: 1, decision, reason: "fine",
        at: AT })).outcome === "not_decidable", `NAMED_${decision.toUpperCase()}N_ORDINARILY`);
    }
    await expectError(() => admin.query(`UPDATE ${SCHEMA}.research_dossier_public_versions SET state = 'shown',
      hold_reasons = '{}' WHERE public_number = $1`, [namedCopy.publicNumber]), /check constraint/u, "NAMED_FORCED_SHOWN");
    await expectError(() => reviewPool.query(`SELECT * FROM ${SCHEMA}.decide_research_dossier_living_person($1, 1,
      'A public figure in office', 'auth0|synthetic-owner', now())`, [namedCopy.publicNumber]),
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

    // Saving switched off refuses, under the account lock the private append uses.
    const fourth = await account("fourth");
    const f1 = await save(fourth.accountKey, "four", "four-1");
    await service.setFindingsSave(fourth.subject, false);
    assert((await publisher.publish(copy(fourth.accountKey, f1))).outcome === "account_refused",
      "PUBLISHED_WITH_SAVING_OFF");
    checks.push("saving_off_publishes_nothing");

    // Malformed input is refused whole; a copy's content never changes and nothing is deleted.
    await expectError(() => access.query(`SELECT * FROM ${SCHEMA}.publish_research_dossier_version($1, $2::uuid,
      '{}'::jsonb, '{}'::text[], true, now())`, [first.accountKey, deterministicUuid("publication-acceptance:none")]),
    /RESEARCH_DOSSIER_PUBLISH_INPUT_INVALID/u, "IMPORTANT_CONFLICT_WITHOUT_A_DOSSIER_ACCEPTED");
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
