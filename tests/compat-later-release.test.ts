import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  ATLAS_PUBLICATION_HOLD_REASONS,
  InMemoryAtlasPublicationStore,
  LATER_RELEASE_MIGRATION_DIGESTS,
  PostgresAtlasPublicationStore,
  PostgresEvidenceRepository,
  migrationReplayPlan,
} from "@askrigor/evidence-repository";

import { AtlasPublicationReview } from "../apps/research-mcp/src/atlas/publication-review.js";

// Codex's third review of 17 Nov 2026, finding 3 (P1): the build that comes first, and that a rollback goes back to. It
// changes no behaviour and only lets this server keep working once the full release has updated the database: its
// migrate takes either digest of 0021 and, on a database a later release migrated, runs none of its migrations again,
// so the widened constraints and functions stay; it reads all six hold reasons; and its pages read the stored routes
// (atlas-pages.test.ts).

const OLD_0021 = "f52a42ebd1a31f2adcef2ee267ab1a611e24d26afe44a3d9b04e2e7198d08443";
const NEW_0021 = "95b5d194c5f67e38e9be6d9cb7fcb5469672045ff5a7f22799f387303cd61b15";
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

/** This build's migrations as migrate lists them, with their files' digests. */
async function knownMigrations(): Promise<Array<{ migrationId: string; sha256: string }>> {
  const repository = await readFile(new URL("../packages/evidence-repository/src/postgres.ts", import.meta.url), "utf8");
  const migrate = repository.slice(repository.indexOf("async migrate()"), repository.indexOf("].map(async (migrationId)"));
  const ids = [...migrate.matchAll(/"(\d{4}_[a-z0-9_]+)"/gu)].map(([, id]) => id!);
  return Promise.all(ids.map(async (migrationId) => ({ migrationId, sha256: sha(await readFile(
    new URL(`../packages/evidence-repository/migrations/${migrationId}.sql`, import.meta.url), "utf8")) })));
}

describe("the compatibility build's migrate on a database a later release migrated", () => {
  it("takes either exact digest of 0021, and on a later release's database runs nothing again", async () => {
    const known = await knownMigrations();
    expect(known.find(({ migrationId }) => migrationId === "0021_atlas_publications")!.sha256).toBe(OLD_0021);
    expect(LATER_RELEASE_MIGRATION_DIGESTS).toEqual({ "0021_atlas_publications": [NEW_0021] });
    const recorded = (changes: Record<string, string | null> = {}) => {
      const rows = new Map(known.map(({ migrationId, sha256 }) => [migrationId, sha256]));
      for (const [id, digest] of Object.entries(changes)) {
        if (digest === null) rows.delete(id);
        else rows.set(id, digest);
      }
      return rows;
    };
    // A fresh database, and one this build or an earlier one migrated: every migration runs, as before.
    expect(migrationReplayPlan(known, undefined)).toBe("replay");
    expect(migrationReplayPlan(known, new Map())).toBe("replay");
    expect(migrationReplayPlan(known, recorded())).toBe("replay");
    expect(migrationReplayPlan(known, recorded({ "0038_research_proposal_idempotency_index": null }))).toBe("replay");
    // The full release's database: 0021's later digest and 0041, or either alone, keeps what that release made.
    expect(migrationReplayPlan(known, recorded({ "0021_atlas_publications": NEW_0021,
      "0041_atlas_show_saved_findings": "c".repeat(64) }))).toBe("keep_later_release");
    expect(migrationReplayPlan(known, recorded({ "0021_atlas_publications": NEW_0021 }))).toBe("keep_later_release");
    expect(migrationReplayPlan(known, recorded({ "0041_atlas_show_saved_findings": "c".repeat(64) })))
      .toBe("keep_later_release");
    // Any other digest still stops it, and so does a later database that lacks one of this build's migrations.
    expect(() => migrationReplayPlan(known, recorded({ "0021_atlas_publications": "d".repeat(64) })))
      .toThrow("MIGRATION_SHA256_MISMATCH migration=0021_atlas_publications");
    expect(() => migrationReplayPlan(known, recorded({ "0021_atlas_publications": "d".repeat(64),
      "0041_atlas_show_saved_findings": "c".repeat(64) }))).toThrow("MIGRATION_SHA256_MISMATCH migration=0021_atlas_publications");
    expect(() => migrationReplayPlan(known, recorded({ "0030_atlas_challenges": NEW_0021,
      "0041_atlas_show_saved_findings": "c".repeat(64) }))).toThrow("MIGRATION_SHA256_MISMATCH migration=0030_atlas_challenges");
    expect(() => migrationReplayPlan(known, recorded({ "0038_research_proposal_idempotency_index": null,
      "0041_atlas_show_saved_findings": "c".repeat(64) }))).toThrow(
      "MIGRATION_NOT_RECORDED migration=0038_research_proposal_idempotency_index");
  });

  it("checks the recorded digests in one transaction and runs no migration's SQL on a later release's database", async () => {
    const known = await knownMigrations();
    const run = async (later: boolean) => {
      const calls: string[] = [];
      const repository = new PostgresEvidenceRepository({ connectionString: "postgres://admin@127.0.0.1/askrigor" });
      const client = {
        query: async (sql: string) => {
          calls.push(sql);
          if (sql.startsWith("SELECT to_regclass")) return { rows: [{ name: "living_evidence.schema_migrations" }], rowCount: 1 };
          if (sql.startsWith("SELECT migration_id, migration_sha256 FROM living_evidence.schema_migrations")) {
            const rows = known.map(({ migrationId, sha256 }) => ({ migration_id: migrationId,
              migration_sha256: later && migrationId === "0021_atlas_publications" ? NEW_0021 : sha256 }));
            return { rows: later ? [...rows, { migration_id: "0041_atlas_show_saved_findings", migration_sha256: "c".repeat(64) }]
              : rows, rowCount: rows.length };
          }
          if (sql.startsWith("SELECT migration_sha256 FROM schema_migrations")) {
            return { rows: [{ migration_sha256: "never-read" }], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        },
        release: () => undefined,
      };
      (repository as unknown as { pool: { connect: () => Promise<typeof client> } }).pool = { connect: async () => client };
      const outcome = await repository.migrate().then(() => "", (error: Error) => error.message);
      return { calls, outcome };
    };
    const later = await run(true);
    expect(later.outcome).toBe("");
    expect(later.calls).toEqual([
      "BEGIN",
      "SELECT to_regclass($1) AS name",
      "SELECT migration_id, migration_sha256 FROM living_evidence.schema_migrations",
      "COMMIT",
    ]);
    // On its own database it runs every migration again, as before, and stops at the first digest it doesn't take.
    const own = await run(false);
    expect(own.calls.filter((sql) => sql.includes("CREATE TABLE IF NOT EXISTS schema_migrations"))).toHaveLength(1);
    expect(own.outcome).toBe("MIGRATION_SHA256_MISMATCH migration=0001_living_evidence");
  });
});

describe("the compatibility build's six hold reasons", () => {
  it("reads and lists a finding a later release held because it may name a living person", async () => {
    expect(ATLAS_PUBLICATION_HOLD_REASONS).toEqual(["email_address", "phone_number", "messaging_handle", "card_reference",
      "youtube_link", "living_person_review"]);
    // Through the review role's inspect, as the full release's 0021 stores them, all six at once.
    const store = new PostgresAtlasPublicationStore({ connectionString: "postgres://review@127.0.0.1/askrigor" });
    (store as unknown as { pool: { query: unknown } }).pool = {
      query: async () => ({ rows: [{ publication_number: "P-1001", card_number: 42, card_sha256: "a".repeat(64),
        finding_number: 1, published_json: null, state: "held", atlas_number: null,
        held_because: [...ATLAS_PUBLICATION_HOLD_REASONS], withdrawn_because: null, owner_reason: null,
        published_at: new Date("2026-11-17T09:00:00Z"), state_changed_at: new Date("2026-11-17T09:00:00Z"),
        card_forgotten_at: null, texts_erased_at: null }] }),
    };
    expect((await store.inspect({}))[0]!.heldBecause).toEqual([...ATLAS_PUBLICATION_HOLD_REASONS]);
    // And the owner's list says why, in his words.
    const publications = new InMemoryAtlasPublicationStore();
    const review = new AtlasPublicationReview({ publications, now: () => new Date("2026-11-17T09:00:00Z"),
      inbox: { openCards: async () => [] } } as unknown as ConstructorParameters<typeof AtlasPublicationReview>[0]);
    const view = (await store.inspect({}))[0]!;
    (publications as unknown as { rows: unknown[] }).rows.push({ ...view, heldBecause: ["living_person_review"],
      published: null });
    const listed = await review.run({ action: "list_publications" });
    expect(listed.text).toContain("P-1001 (ARF-0042 finding 1), held for the owner: it holds a claim that may name a " +
      "living person (its published fields are erased)");
  });
});
