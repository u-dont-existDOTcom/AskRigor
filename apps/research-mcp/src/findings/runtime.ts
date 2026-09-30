import { getProtocolManifest } from "@askrigor/protocol";

import { askrigorBuildCommitFromEnv, SERVICE_VERSION } from "../config.js";
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
import type { FindingsSaveResult } from "./contracts.js";
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
 * Saves one findings card from the connector. The GitHub App and the
 * receipt secret are the ones the lesson queue and finalize_research use; an
 * unconfigured library answers "unavailable" and never throws.
 */
export async function saveResearchFindings(raw: unknown, context: FindingsSaveContext): Promise<FindingsSaveResult> {
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
    });
  } catch {
    throw new Error(CONFIGURATION_ERROR);
  }
}

async function protocolIdentities(): Promise<readonly ProtocolIdentity[]> {
  return await Promise.all((["hrp", "universal"] as const).map(async (protocol) => {
    const { name, version, sha256 } = await getProtocolManifest(protocol);
    return { name, version, sha256 };
  }));
}
