import {
  PostgresAtlasNewsStore,
  type AtlasNewsReviewStore,
  type AtlasNewsStagingStore,
  type PostgresAtlasStoreOptions,
} from "@askrigor/evidence-repository";

import { atlasNewsModeFromEnv, researchContributionReviewConfigFromEnv, type AtlasNewsMode } from "../config.js";
import type { PaperStatusLookup } from "./day.js";

/** How long a news store waits for a database connection. */
export const NEWS_CONNECTION_TIMEOUT_MS = 5_000;

/** Atlas news, stage 1 (plan 2026-11-21-atlas-news-stage1.md): ASKRIGOR_ATLAS_NEWS and its stores. */
export interface AtlasNewsOptions {
  mode: AtlasNewsMode;
  /** The research-access role's staging, inside finalize_research. */
  staging?: AtlasNewsStagingStore;
  /** The review role's day call, withdrawals and reads, for the owner's news actions. */
  review?: AtlasNewsReviewStore;
  paperStatus?: PaperStatusLookup;
  now?: () => Date;
}

/**
 * Atlas news from the environment: undefined unless ASKRIGOR_ATLAS_NEWS is "shadow". Staging goes through the
 * research-access connection, as the research dossiers are written; the owner's news actions through the review
 * connection, as the Atlas publications are. A connection that isn't configured leaves its part off, and says so.
 */
export function atlasNewsFromEnv(
  access: Pick<PostgresAtlasStoreOptions, "connectionString" | "schema" | "ssl"> | undefined,
  env: NodeJS.ProcessEnv = process.env,
): AtlasNewsOptions | undefined {
  const mode = atlasNewsModeFromEnv(env.ASKRIGOR_ATLAS_NEWS);
  if (mode === "off") return undefined;
  let review: ReturnType<typeof researchContributionReviewConfigFromEnv> | undefined;
  try {
    review = researchContributionReviewConfigFromEnv(env);
  } catch {
    review = undefined;
  }
  return {
    mode,
    // A connection that can't be made in 5 seconds fails the call's news part, never the call: the roles' own 5-second
    // statement limit bounds each function once connected.
    ...(access === undefined ? {} : { staging: new PostgresAtlasNewsStore({ connectionString: access.connectionString,
      ...(access.schema === undefined ? {} : { schema: access.schema }), ssl: access.ssl,
      connectionTimeoutMillis: NEWS_CONNECTION_TIMEOUT_MS }) }),
    ...(review === undefined ? {} : { review: new PostgresAtlasNewsStore({ connectionString: review.connectionString,
      schema: review.schema, ssl: review.ssl, connectionTimeoutMillis: NEWS_CONNECTION_TIMEOUT_MS }) }),
  };
}
