import type { ResearchContributorAccessService } from "@askrigor/evidence-repository";
import { devAccountKeysFromEnv, keepFailedSearchesDefaultFromEnv } from "./config.js";
import { isDevAccount } from "./research-contributor-access-tool.js";

export async function keepFailedSearches(
  service: Pick<ResearchContributorAccessService, "failedSearchPreference">,
  accountKey: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean | undefined> {
  const preference = await service.failedSearchPreference(accountKey);
  if (preference === null) return undefined;
  return preference.enabled ?? (isDevAccount(accountKey, devAccountKeysFromEnv(env.ASKRIGOR_DEV_ACCOUNT_KEYS ?? "")) ||
    keepFailedSearchesDefaultFromEnv(env.ASKRIGOR_KEEP_FAILED_SEARCHES_DEFAULT ?? ""));
}
