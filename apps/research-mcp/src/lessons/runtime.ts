import { lstatSync } from "node:fs";
import { dirname, isAbsolute, normalize } from "node:path";

import type { ActionRoute } from "../actions/types.js";
import {
  createSharedFileAiBudget,
  MONTHLY_AI_BUDGET_NANO_USD,
} from "./ai-budget.js";
import { createLessonActionRoute } from "./action-route.js";
import {
  GitHubInstallationTokenProvider,
  LESSON_REPOSITORY_FULL_NAME,
} from "./github-app.js";
import { GitHubLessonQueue } from "./github-lessons.js";
import { createOpenAiLessonAnonymizer } from "./openai-anonymizer.js";
import { createLessonAttemptLimiter } from "./rate-limit.js";
import { LessonSubmissionService } from "./service.js";

const CONFIGURATION_ERROR = "Lesson runtime configuration unavailable";

let cachedRuntime: LessonSubmissionService | undefined;

const lazyRuntime = {
  async submit(raw: unknown) {
    return await getOrCreateLessonRuntime().submit(raw);
  },
};

const defaultActionRoutes = Object.freeze([
  createLessonActionRoute(lazyRuntime),
] satisfies readonly ActionRoute[]);

/** Constructs a production lesson service from the exact reviewed environment. */
export function createLessonRuntimeFromEnv(): LessonSubmissionService {
  try {
    const actionsEnabled = requiredEnvironment("ASKRIGOR_ACTIONS_ENABLED");
    if (actionsEnabled !== "true") throw new Error(CONFIGURATION_ERROR);

    requiredSecret("ASKRIGOR_ACTIONS_API_KEY");
    const openAiApiKey = requiredSecret("OPENAI_API_KEY");
    const ledgerPath = requiredEnvironment("ASKRIGOR_AI_BUDGET_LEDGER");
    if (!isAbsolute(ledgerPath) || normalize(ledgerPath) !== ledgerPath) {
      throw new Error(CONFIGURATION_ERROR);
    }
    assertSafeLedgerParent(dirname(ledgerPath));

    const budgetUsd = requiredEnvironment("ASKRIGOR_AI_MONTHLY_BUDGET_USD");
    if (budgetUsd !== "50" && budgetUsd !== "50.00") {
      throw new Error(CONFIGURATION_ERROR);
    }

    const appId = positiveDecimalEnvironment("ASKRIGOR_GITHUB_APP_ID");
    const installationId = positiveDecimalEnvironment("ASKRIGOR_GITHUB_INSTALLATION_ID");
    const privateKeyBase64 = requiredSecret("ASKRIGOR_GITHUB_PRIVATE_KEY_BASE64");
    if (requiredEnvironment("ASKRIGOR_LESSONS_REPOSITORY") !== LESSON_REPOSITORY_FULL_NAME) {
      throw new Error(CONFIGURATION_ERROR);
    }

    const now = () => new Date();
    const budget = createSharedFileAiBudget({
      ledgerPath,
      monthlyLimitNanoUsd: MONTHLY_AI_BUDGET_NANO_USD,
      expectedUid: process.getuid?.(),
      now,
    });
    const anonymizer = createOpenAiLessonAnonymizer({
      apiKey: openAiApiKey,
      budget,
      fetch,
    });
    const tokenProvider = new GitHubInstallationTokenProvider({
      appId,
      installationId,
      privateKeyBase64,
      fetch,
      now,
    });
    const queue = new GitHubLessonQueue({ tokenProvider, fetch, now });
    const limiter = createLessonAttemptLimiter({ now });
    return new LessonSubmissionService({ limiter, anonymizer, queue });
  } catch {
    throw new Error(CONFIGURATION_ERROR);
  }
}

/** Returns the shared registry without constructing or validating its runtime. */
export function createDefaultActionRoutes(): readonly ActionRoute[] {
  return defaultActionRoutes;
}

function getOrCreateLessonRuntime(): LessonSubmissionService {
  if (cachedRuntime) return cachedRuntime;
  const runtime = createLessonRuntimeFromEnv();
  cachedRuntime = runtime;
  return runtime;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(CONFIGURATION_ERROR);
  return value;
}

function requiredSecret(name: string): string {
  const value = requiredEnvironment(name);
  if (value.trim().length === 0) throw new Error(CONFIGURATION_ERROR);
  return value;
}

function positiveDecimalEnvironment(name: string): string {
  const value = requiredEnvironment(name);
  if (!/^[1-9][0-9]*$/u.test(value)) throw new Error(CONFIGURATION_ERROR);
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) throw new Error(CONFIGURATION_ERROR);
  return value;
}

function assertSafeLedgerParent(parentDirectory: string): void {
  const expectedUid = process.getuid?.();
  if (!Number.isSafeInteger(expectedUid) || expectedUid! < 0) {
    throw new Error(CONFIGURATION_ERROR);
  }
  const stat = lstatSync(parentDirectory);
  if (
    stat.isSymbolicLink() ||
    !stat.isDirectory() ||
    stat.uid !== expectedUid ||
    (stat.mode & 0o022) !== 0
  ) {
    throw new Error(CONFIGURATION_ERROR);
  }
}
