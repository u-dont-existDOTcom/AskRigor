import type { ActionRoute } from "../actions/types.js";
import { createLessonActionRoute } from "./action-route.js";
import {
  createLessonIncidentActionRoute,
} from "./incident-action-route.js";
import {
  createFileLessonIncidentVault,
  lessonIncidentVaultConfigFromEnv,
} from "./file-incident-vault.js";
import {
  GitHubInstallationTokenProvider,
  LESSON_REPOSITORY_FULL_NAME,
} from "./github-app.js";
import { GitHubLessonQueue } from "./github-lessons.js";
import { createLocalLessonGeneralizer } from "./local-generalizer.js";
import { createLessonAttemptLimiter } from "./rate-limit.js";
import { LessonSubmissionService } from "./service.js";

const CONFIGURATION_ERROR = "Lesson runtime configuration unavailable";

let cachedRuntime: LessonSubmissionService | undefined;

const lazyRuntime = {
  async submit(raw: unknown) {
    return await getOrCreateLessonRuntime().submit(raw);
  },
};

const lazyIncidentVault = {
  capture(raw: unknown) {
    const config = lessonIncidentVaultConfigFromEnv();
    if (config === undefined) throw new Error("Lesson incident vault unavailable");
    return createFileLessonIncidentVault(config).capture(raw);
  },
};

const defaultActionRoutes = Object.freeze([
  createLessonIncidentActionRoute(lazyIncidentVault),
  createLessonActionRoute(lazyRuntime),
] satisfies readonly ActionRoute[]);

/** Constructs a production lesson service from the exact reviewed environment. */
export function createLessonRuntimeFromEnv(): LessonSubmissionService {
  try {
    const actionsEnabled = requiredEnvironment("ASKRIGOR_ACTIONS_ENABLED");
    if (actionsEnabled !== "true") throw new Error(CONFIGURATION_ERROR);

    requiredSecret("ASKRIGOR_ACTIONS_API_KEY");
    const appId = positiveDecimalEnvironment("ASKRIGOR_GITHUB_APP_ID");
    const installationId = positiveDecimalEnvironment("ASKRIGOR_GITHUB_INSTALLATION_ID");
    const privateKeyBase64 = requiredSecret("ASKRIGOR_GITHUB_PRIVATE_KEY_BASE64");
    if (requiredEnvironment("ASKRIGOR_LESSONS_REPOSITORY") !== LESSON_REPOSITORY_FULL_NAME) {
      throw new Error(CONFIGURATION_ERROR);
    }

    const now = () => new Date();
    // The ChatGPT Action request already contains the generalized lesson shown
    // to and authorized by the user. Production validates it locally rather
    // than paying for a second model/API pass.
    const anonymizer = createLocalLessonGeneralizer();
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
