import {
  PostgresAtlasModerationStore,
  PostgresAtlasPublicationStore,
  PostgresAtlasReader,
  PostgresAtlasReviewStore,
} from "@askrigor/evidence-repository";
import { getProtocolManifest } from "@askrigor/protocol";

import {
  announcingModerationStore,
  announcingPublicationStore,
  announcingReviewStore,
} from "../atlas/change-signal.js";
import { AtlasCardPublisher } from "../atlas/publication.js";
import {
  askrigorBuildCommitFromEnv,
  atlasReviewEnabledFromEnv,
  findingsLibraryEnabledFromEnv,
  livingEvidenceReuseConfigFromEnv,
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
import {
  FindingsSaveService,
  type FindingsSaveContext,
  type ProtocolIdentity,
} from "./service.js";

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
      queue: new GitHubFindingsQueue({ tokenProvider, fetch, repository }),
      protocols: protocolIdentities,
      version: SERVICE_VERSION,
      build: askrigorBuildCommitFromEnv(),
      now,
      // Each publication it writes drops the Atlas pages' cache in this process (decision 171, section 4C).
      ...(publications === undefined ? {} : {
        publisher: new AtlasCardPublisher({ store: announcingPublicationStore(publications), now }),
      }),
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

/**
 * The owner's findings actions for the Atlas, from the environment (Atlas phase 2 design, section 3): decisions and
 * intents through the review role's functions (the research review database), the canonical Atlas through the public
 * runtime's read-only reader, and the cards through the findings library's GitHub App. Undefined, with nothing
 * connected, when any of them is not configured; the tool then answers that the review is not configured.
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
