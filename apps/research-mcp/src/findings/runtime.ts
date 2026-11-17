import {
  PostgresAtlasModerationStore,
  PostgresAtlasPlacementStore,
  PostgresAtlasReportReviewStore,
  PostgresAtlasGlanceStore,
  PostgresAtlasPublicationStore,
  PostgresAtlasReader,
  PostgresAtlasReviewStore,
  PostgresResearchDossierEraser,
} from "@askrigor/evidence-repository";
import { getProtocolManifest } from "@askrigor/protocol";

import {
  announcingModerationStore,
  announcingPlacementStore,
  announcingReportReviewStore,
  announcingGlanceStore,
  announcingPublicationStore,
  announcingReviewStore,
} from "../atlas/change-signal.js";
import { AtlasCardPublisher } from "../atlas/publication.js";
import {
  askrigorBuildCommitFromEnv,
  atlasReviewEnabledFromEnv,
  atlasLivingPersonUnknownFromEnv,
  atlasShowSavedFindingsFromEnv,
  crossrefConfigFromEnv,
  findingsLibraryEnabledFromEnv,
  livingEvidenceReuseConfigFromEnv,
  ncbiConfigFromEnv,
  researchContributionReviewConfigFromEnv,
  SERVICE_VERSION,
} from "../config.js";
import {
  GitHubInstallationTokenProvider,
  LESSON_REPOSITORY_NAME,
  LESSON_REPOSITORY_OWNER,
  parseGitHubRepository,
  type GitHubRepository,
} from "../lessons/github-app.js";
import { createLessonAttemptLimiter } from "../lessons/rate-limit.js";
import { githubAppCredentialsFromEnv } from "../lessons/runtime.js";
import { researchReceiptSecretFromEnv } from "../research-receipts.js";
import { AtlasReview } from "./atlas-review.js";
import type { FindingsSaveResult } from "./contracts.js";
import { GitHubFindingsReview } from "./github-findings-review.js";
import { GitHubFindingsQueue } from "./github-findings.js";
import { heldYouTubeFindingsStoresFromEnv } from "./held-youtube-findings.js";
import {
  FindingsSaveService,
  type FindingsSaveContext,
  type ProtocolIdentity,
  type UnsavedCardInput,
  type UnsavedCardResult,
} from "./service.js";
import { atlasSourceTitleLookup } from "./source-checks.js";

const CONFIGURATION_ERROR = "Findings library configuration unavailable";

/** The private review queue, next to the lesson queue under the same owner. */
export const DEFAULT_FINDINGS_REPOSITORY: Readonly<GitHubRepository> = Object.freeze({
  owner: LESSON_REPOSITORY_OWNER,
  name: "AskRigor-findings",
});

let cachedService: FindingsSaveService | undefined;

/**
 * Saves the findings card finalize_research checked for a free contributor
 * account. The GitHub App and the receipt secret are the ones the lesson queue
 * and finalize_research use; an unconfigured library answers "unavailable" and
 * never throws.
 */
export async function saveResearchFindings(raw: unknown, context: FindingsSaveContext): Promise<FindingsSaveResult> {
  // Closed until the owner opens it (ASKRIGOR_FINDINGS_LIBRARY=enabled).
  if (!findingsLibraryEnabledFromEnv()) {
    return { status: "queue_unavailable", retryable: false, reason_code: "library_closed" };
  }
  let service: FindingsSaveService;
  try {
    cachedService ??= createFindingsServiceFromEnv();
    service = cachedService;
  } catch {
    return { status: "queue_unavailable", retryable: false, reason_code: "queue_not_configured" };
  }
  return await service.save(raw, context);
}

/** Keeps a private copy of a card that wasn't saved, for a second look; an unconfigured library keeps none. */
export async function keepUnsavedFindingsCard(input: UnsavedCardInput): Promise<UnsavedCardResult> {
  if (!findingsLibraryEnabledFromEnv()) return { status: "not_kept", reason: "library_closed" };
  try {
    cachedService ??= createFindingsServiceFromEnv();
  } catch {
    return { status: "not_kept", reason: "queue_not_configured" };
  }
  return await cachedService.keepUnsaved(input);
}

/**
 * ASKRIGOR_FINDINGS_REPOSITORY may name another repository ("owner/name"). The
 * lesson queue's App installation serves it, so it has the same owner, and it
 * is never the lesson queue itself.
 */
export function findingsRepositoryFromEnv(env: NodeJS.ProcessEnv = process.env): GitHubRepository {
  const configured = env.ASKRIGOR_FINDINGS_REPOSITORY?.trim();
  if (configured === undefined || configured === "") return { ...DEFAULT_FINDINGS_REPOSITORY };
  const repository = parseGitHubRepository(configured);
  if (
    repository === undefined ||
    repository.owner !== LESSON_REPOSITORY_OWNER ||
    repository.name.toLowerCase() === LESSON_REPOSITORY_NAME.toLowerCase()
  ) {
    throw new Error(CONFIGURATION_ERROR);
  }
  return repository;
}

function createFindingsServiceFromEnv(): FindingsSaveService {
  try {
    const { appId, installationId, privateKeyBase64 } = githubAppCredentialsFromEnv();
    const repository = findingsRepositoryFromEnv();
    const now = () => new Date();
    // Decision 171, section 4B: a free contributor's card is published in the Atlas as soon as it is saved, while the
    // owner's Atlas actions are open to moderate it.
    const publications = createAtlasPublicationStoreFromEnv();
    const tokenProvider = new GitHubInstallationTokenProvider({
      appId,
      installationId,
      privateKeyBase64,
      repository,
      fetch,
      now,
    });
    return new FindingsSaveService({
      receiptSecret: () => researchReceiptSecretFromEnv(),
      // The lesson queue's limits, in a bucket of its own.
      limiter: createLessonAttemptLimiter({ now }),
      unsavedLimiter: createLessonAttemptLimiter({ now }),
      queue: new GitHubFindingsQueue({ tokenProvider, fetch, repository }),
      protocols: protocolIdentities,
      version: SERVICE_VERSION,
      build: askrigorBuildCommitFromEnv(),
      now,
      // Each publication it writes drops the Atlas pages' cache in this process (decision 171, section 4C); its sources'
      // titles come from their public records, through the provider settings the connector's own tools use.
      ...(publications === undefined ? {} : {
        publisher: new AtlasCardPublisher({
          store: announcingPublicationStore(publications),
          now,
          sourceTitles: atlasSourceTitleLookup({ crossref: crossrefConfigFromEnv(), pubmed: ncbiConfigFromEnv(), now }),
          // The owner, 17 Nov 2026: what passed the checks shows on the pages at once, while the setting is on.
          showOnPages: atlasShowSavedFindingsFromEnv(),
          livingPersonUnknown: atlasLivingPersonUnknownFromEnv(),
        }),
      }),
      // Owner answer 173: the findings a saved card leaves out are held for the owner's review, through the
      // research-access role.
      held: heldYouTubeFindingsStoresFromEnv().access,
    });
  } catch {
    throw new Error(CONFIGURATION_ERROR);
  }
}

/**
 * The Atlas publications (decision 171, section 4B), through the review role's functions in the research review
 * database: only while the owner's Atlas actions are open (ASKRIGOR_ATLAS_REVIEW=enabled), so nothing is published that
 * the owner cannot unpublish or set aside. Undefined, with nothing connected, otherwise.
 */
export function createAtlasPublicationStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): PostgresAtlasPublicationStore | undefined {
  if (!atlasReviewEnabledFromEnv(env.ASKRIGOR_ATLAS_REVIEW)) return undefined;
  try {
    const review = researchContributionReviewConfigFromEnv(env);
    if (review === undefined) return undefined;
    return new PostgresAtlasPublicationStore({
      connectionString: review.connectionString,
      schema: review.schema,
      ssl: review.ssl,
    });
  } catch {
    return undefined;
  }
}

/** Whether the living-person hold can run: missing lists what it lacks, or is null when the database couldn't say. */
export type AtlasHoldReadiness = { ready: true } | { ready: false; missing: string[] | null };

/**
 * Codex's fourth review of 17 Nov 2026: whether the server may serve. While saves publish in the Atlas (its review
 * store is configured), the database enforces the hold for a finding that may name a living person, so every function
 * the hold relies on must be there and the review role must be able to run it (ATLAS_LIVING_PERSON_HOLD_FUNCTIONS). A
 * database that can't be asked is not ready either. Ready when saves publish nothing in the Atlas.
 */
export async function atlasHoldReadiness(
  env: NodeJS.ProcessEnv = process.env,
  createStore: (env: NodeJS.ProcessEnv) => Pick<PostgresAtlasPublicationStore, "livingPersonHoldMissing" | "close"> |
    undefined = createAtlasPublicationStoreFromEnv,
): Promise<AtlasHoldReadiness> {
  const store = createStore(env);
  if (store === undefined) return { ready: true };
  try {
    const missing = await store.livingPersonHoldMissing();
    return missing.length === 0 ? { ready: true } : { ready: false, missing };
  } catch {
    return { ready: false, missing: null };
  } finally {
    await store.close().catch(() => undefined);
  }
}

/** What the server says when the hold isn't ready, and it doesn't start. */
export function atlasHoldReadinessText(readiness: Extract<AtlasHoldReadiness, { ready: false }>): string {
  return readiness.missing === null
    ? "AskRigor did not start: it couldn't ask the research review database whether the Atlas's living-person hold " +
      "can run."
    : "AskRigor did not start: the Atlas's living-person hold needs these PostgreSQL functions, which are missing or " +
      `which the review role can't run: ${readiness.missing.join("; ")}. Run the one-shot admin migrate, re-run ` +
      "provision-research-review-role, then start it again.";
}

/**
 * The owner's findings actions for the Atlas, from the environment (Atlas phase 2 design, section 3): decisions and
 * intents through the review role's functions (the research review database), the canonical Atlas through the public
 * runtime's read-only reader, and the cards through the findings library's GitHub App; the held YouTube findings
 * through the review role too (owner answer 173). Undefined, with nothing connected, when any of the first three is not
 * configured; the tool then answers that the review is not configured.
 */
export function createAtlasReviewFromEnv(env: NodeJS.ProcessEnv = process.env): AtlasReview | undefined {
  try {
    const review = researchContributionReviewConfigFromEnv(env);
    const reader = livingEvidenceReuseConfigFromEnv(env);
    if (review === undefined || reader === undefined) return undefined;
    const { appId, installationId, privateKeyBase64 } = githubAppCredentialsFromEnv();
    const repository = findingsRepositoryFromEnv(env);
    const now = () => new Date();
    // Every decision, intent and publication write the owner's actions make drops the Atlas pages' cache in this
    // process (decision 171, section 4C).
    return new AtlasReview({
      store: announcingReviewStore(new PostgresAtlasReviewStore({
        connectionString: review.connectionString,
        schema: review.schema,
        ssl: review.ssl,
      })),
      // Decision 171: the publications, in the same database through the same role's functions.
      publications: announcingPublicationStore(new PostgresAtlasPublicationStore({
        connectionString: review.connectionString,
        schema: review.schema,
        ssl: review.ssl,
      })),
      // Decision 171, section 4E: the comments' moderation and the home page's picks, through the same role's functions.
      participation: announcingModerationStore(new PostgresAtlasModerationStore({
        connectionString: review.connectionString,
        schema: review.schema,
        ssl: review.ssl,
      })),
      // Owner answer 229a: where items sit under Health, through the same role's two placement functions.
      placements: announcingPlacementStore(new PostgresAtlasPlacementStore({
        connectionString: review.connectionString,
        schema: review.schema,
        ssl: review.ssl,
      })),
      // Owner answer 229a: people's reports, through the same role's two report functions.
      reports: announcingReportReviewStore(new PostgresAtlasReportReviewStore({
        connectionString: review.connectionString,
        schema: review.schema,
        ssl: review.ssl,
      })),
      // The owner, 3 Nov: a problem's rows at a glance, through the same role's three glance functions.
      glance: announcingGlanceStore(new PostgresAtlasGlanceStore({
        connectionString: review.connectionString,
        schema: review.schema,
        ssl: review.ssl,
      })),
      reader: new PostgresAtlasReader({
        connectionString: reader.connectionString,
        schema: reader.schema,
        ssl: reader.ssl,
        connectionTimeoutMillis: reader.connectionTimeoutMillis,
        queryTimeoutMillis: reader.queryTimeoutMillis,
        statementTimeoutMillis: reader.statementTimeoutMillis,
      }),
      inbox: new GitHubFindingsReview({
        tokenProvider: new GitHubInstallationTokenProvider({
          appId,
          installationId,
          privateKeyBase64,
          repository,
          fetch,
          now,
        }),
        fetch,
        repository,
      }),
      version: SERVICE_VERSION,
      build: askrigorBuildCommitFromEnv(env.ASKRIGOR_BUILD_COMMIT),
      protocols: protocolIdentities,
      now,
      // Owner answer 173: the held YouTube findings, through the review role: listed on the card view, deleted early,
      // moved out of cards stored before, and deleted with a forgotten card.
      held: heldYouTubeFindingsStoresFromEnv(env).review,
      // AskRigor#477 stage 1: forget_card erases the research thread's dossiers, through the same review role.
      dossiers: new PostgresResearchDossierEraser({
        connectionString: review.connectionString,
        schema: review.schema,
        ssl: review.ssl,
      }),
      // publish_cards looks a card's sources up for their titles and years, with the call's provider settings.
      sourceTitles: (providers) => atlasSourceTitleLookup({ ...providers, now }),
    });
  } catch {
    return undefined;
  }
}

async function protocolIdentities(): Promise<readonly ProtocolIdentity[]> {
  return await Promise.all((["hrp", "universal"] as const).map(async (protocol) => {
    const { name, version, sha256 } = await getProtocolManifest(protocol);
    return { name, version, sha256 };
  }));
}
