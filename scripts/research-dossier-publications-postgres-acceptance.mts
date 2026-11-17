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
      "publish_research_dossier_version(text, uuid, text, text[], jsonb, text, text, text[], text[], jsonb, boolean, timestamptz)":
        "askrigor_research_access",
      "research_dossier_topic_publications(text)": "askrigor_research_access",
      "list_research_dossier_publications(text, integer)": "askrigor_research_review",
      "inspect_research_dossier_publication(text)": "askrigor_research_review",
      "decide_research_dossier_publication(text, integer, text, text, timestamptz)": "askrigor_research_review",
      "research_dossier_public_follow_private()": "none",
      "research_dossier_public_version_guard()": "none",
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
    const save = async (accountKey: string, dossierLabel: string, label: string, expected: string | null = null) => {
      const payload = { schema: "askrigor.research-dossier.v1", question: `Synthetic question ${label}` };
      const appended = await dossiers.append({
        accountKey, dossierKey: hex(`dossier:${dossierLabel}`), threadKey: hex(`thread:${dossierLabel}`),
        requestKey: hex(`request:${label}`), inputSha256: hex(`input:${label}`), payload, payloadSha256: digest(payload),
        cardNumber: null, identifiers: [{ scheme: "pmid", value: "11111111" }], expectedPreviousVersionId: expected,
        versionId: deterministicUuid(`publication-acceptance:version:${sequence++}`), at: AT,
      });
      assert(appended.outcome === "inserted", `DOSSIER_APPEND_${label}`);
      return appended.versionId;
    };
    const copy = (accountKey: string, versionId: string, label: string,
      state: "shown" | "held" = "shown", reasons: ResearchDossierPublishInput["holdReasons"] = []): ResearchDossierPublishInput => {
      const payload = { schema: "askrigor.public-dossier.v1", question: `Synthetic public question ${label}`,
        topic: { key: "synthetic-topic" } };
      return { accountKey, versionId, topicKey: "synthetic-topic", relatedTopicKeys: ["other-topic"], payload,
        payloadSha256: digest(payload), state, holdReasons: reasons, conflictsWith: [],
        origin: { surface: "/mcp", run: "chat", readings: "askrigor" }, privacyRead: true, at: AT };
    };

    // No notice covers public dossiers until v7's release adds it: an active v6 account publishes nothing.
    const first = await account("first");
    const v1 = await save(first.accountKey, "one", "one-1");
    assert((await publisher.publish(copy(first.accountKey, v1, "one-1"))).outcome === "account_refused",
      "PUBLISHED_WITHOUT_A_COVERING_NOTICE");
    assert((await pages.listShown({ limit: 10 })).length === 0, "PAGE_SHOWS_WITHOUT_A_COVERING_NOTICE");
    checks.push("nothing_published_while_no_notice_covers_public_dossiers");

    // Here only, v6 stands in for the notice v7 that the release would add.
    await admin.query(`INSERT INTO ${SCHEMA}.research_dossier_public_notices (notice_version, added_at) VALUES ($1, $2)`,
      [RESEARCH_USE_NOTICE_VERSION, AT]);
    const published = await publisher.publish(copy(first.accountKey, v1, "one-1"));
    assert(published.outcome === "published" && published.state === "shown" && /^D-1\d{3,}$/u.test(published.publicNumber),
      "FIRST_PUBLISH_WRONG");
    const replay = await publisher.publish(copy(first.accountKey, v1, "one-1"));
    assert(replay.outcome === "replayed" && replay.publicNumber === published.publicNumber, "PUBLISH_REPLAY_WRONG");
    const shown = await pages.listShown({ topicKeys: ["synthetic-topic"], limit: 10 });
    assert(shown.length === 1 && shown[0]!.publicNumber === published.publicNumber && !shown[0]!.accepted &&
      !Object.hasOwn(shown[0]!, "origin"), "READER_VIEW_WRONG");
    const readerColumns = await readerPool.query(`SELECT * FROM ${SCHEMA}.research_dossier_public_pages LIMIT 1`);
    assert(readerColumns.fields.every(({ name }) => !/origin|account|dossier_number|privacy|hold/u.test(name)),
      "READER_VIEW_EXPOSES_PRIVATE_COLUMNS");
    assert((await publisher.topicCopies("synthetic-topic")).length === 1, "TOPIC_COPIES_WRONG");
    checks.push("a_covered_account_publishes_once_and_the_reader_sees_only_public_columns");

    // A held newer version leaves the shown one on the pages; the check shows it, which supersedes the older.
    const v2 = await save(first.accountKey, "one", "one-2", v1);
    const held = await publisher.publish(copy(first.accountKey, v2, "one-2", "held", ["not_high_confidence"]));
    assert(held.outcome === "published" && held.state === "held", "HELD_PUBLISH_WRONG");
    assert((await pages.listShown({ limit: 10 }))[0]?.versionNumber === 1, "HELD_VERSION_REPLACED_SHOWN");
    const queue = await review.list("held", 10);
    assert(queue.length === 1 && queue[0]!.holdReasons.join() === "not_high_confidence" &&
      queue[0]!.origin.surface === "/mcp", "HELD_QUEUE_WRONG");
    const showDecision = await review.decide({ publicNumber: published.publicNumber, versionNumber: 2, decision: "show",
      reason: null, at: AT });
    assert(showDecision.outcome === "decided" && showDecision.state === "shown", "SHOW_DECISION_WRONG");
    const afterShow = await pages.listShown({ limit: 10 });
    assert(afterShow.length === 1 && afterShow[0]!.versionNumber === 2, "SHOWN_NOT_SUPERSEDED");
    const history = await pages.history([published.publicNumber]);
    assert(history.map(({ versionNumber, state }) => `${versionNumber}:${state}`).join() === "2:shown,1:superseded",
      "HISTORY_WRONG");
    checks.push("held_copy_waits_and_shown_one_stays_until_the_check_shows_its_successor");

    // Only the newest version publishes; a decision on an older copy that would show it is refused.
    const v3 = await save(first.accountKey, "one", "one-3", v2);
    await save(first.accountKey, "one", "one-4", v3);
    assert((await publisher.publish(copy(first.accountKey, v3, "one-3"))).outcome === "version_refused",
      "OLDER_VERSION_PUBLISHED");
    assert((await review.decide({ publicNumber: published.publicNumber, versionNumber: 1, decision: "show", reason: null,
      at: AT })).outcome === "not_decidable", "OLDER_COPY_SHOWN");
    checks.push("only_the_newest_version_publishes_or_shows");

    // Accepting marks it checked; an accepted copy can't be sent back for the check; taking down needs no newest rule.
    const accepted = await review.decide({ publicNumber: published.publicNumber, versionNumber: 2, decision: "accept",
      reason: "synthetic acceptance", at: AT });
    assert(accepted.outcome === "decided" && accepted.accepted, "ACCEPT_WRONG");
    assert((await pages.listShown({ limit: 10 }))[0]?.accepted === true, "ACCEPTED_NOT_ON_PAGE");
    assert((await review.decide({ publicNumber: published.publicNumber, versionNumber: 2, decision: "hold",
      reason: "synthetic", at: AT })).outcome === "not_decidable", "ACCEPTED_COPY_HELD");
    checks.push("acceptance_marks_checked_and_cannot_be_held_back");

    // Revocation (the 0037 trigger withdraws the pending private version) takes its unaccepted copy off the pages.
    const second = await account("second");
    const s1 = await save(second.accountKey, "two", "two-1");
    const secondCopy = await publisher.publish(copy(second.accountKey, s1, "two-1"));
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

    // Erasure (forget_card's, by the thread): an unaccepted copy is erased with its private version; an accepted one
    // stays, written without the person, and keeps nothing of where its research ran.
    const third = await account("third");
    const t1 = await save(third.accountKey, "three", "three-1");
    const thirdCopy = await publisher.publish(copy(third.accountKey, t1, "three-1"));
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
    const u1 = await save(unread.accountKey, "unread", "unread-1");
    const unreadCopy = copy(unread.accountKey, u1, "unread-1");
    await expectError(() => access.query(`SELECT * FROM ${SCHEMA}.publish_research_dossier_version($1, $2::uuid, $3,
      $4::text[], $5::jsonb, $6, 'shown', '{}'::text[], '{}'::text[], $7::jsonb, false, $8::timestamptz)`,
    [unread.accountKey, u1, unreadCopy.topicKey, [...unreadCopy.relatedTopicKeys], JSON.stringify(unreadCopy.payload),
      unreadCopy.payloadSha256, JSON.stringify(unreadCopy.origin), AT.toISOString()]),
    /RESEARCH_DOSSIER_PUBLISH_INPUT_INVALID/u, "SHOWN_WITHOUT_PRIVACY_READING");
    const pending = await publisher.publish({ ...copy(unread.accountKey, u1, "unread-1", "held", ["privacy_reading_pending"]),
      privacyRead: false });
    assert(pending.outcome === "published" && pending.state === "held", "PRIVACY_PENDING_NOT_HELD");
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

    // Saving switched off refuses, under the account lock the private append uses.
    const fourth = await account("fourth");
    const f1 = await save(fourth.accountKey, "four", "four-1");
    await service.setFindingsSave(fourth.subject, false);
    assert((await publisher.publish(copy(fourth.accountKey, f1, "four-1"))).outcome === "account_refused",
      "PUBLISHED_WITH_SAVING_OFF");
    checks.push("saving_off_publishes_nothing");

    // Malformed input is refused whole; a copy's content never changes and nothing is deleted.
    await expectError(() => access.query(`SELECT * FROM ${SCHEMA}.publish_research_dossier_version($1, $2::uuid, 'synthetic-topic',
      '{}'::text[], '{}'::jsonb, $3, 'held', '{}'::text[], '{}'::text[], '{}'::jsonb, false, now())`,
    [first.accountKey, deterministicUuid("publication-acceptance:none"), "a".repeat(64)]),
    /RESEARCH_DOSSIER_PUBLISH_INPUT_INVALID/u, "HELD_WITHOUT_REASON_ACCEPTED");
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
