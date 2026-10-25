import {
  PostgresHeldYouTubeFindingsStore,
  type HeldYouTubeFindingsStore,
} from "@askrigor/evidence-repository";

import { researchContributionReviewConfigFromEnv, researchContributorAccessConfigFromEnv } from "../config.js";

/**
 * The research server's held YouTube findings (owner answer 173, 25 Oct): the findings drawn from YouTube comments that
 * a saved findings card leaves out, or of a card whose findings all rest on them, which is not saved as a card, held in
 * the living-evidence database for the owner's review. They are kept until deleted (the owner's rule, 25 Oct: "don't
 * delete the summaries unless YT tells us to do that"): nothing here deletes one by its age. The save path holds them
 * through the research-access role; the owner's review tool reads them, deletes a card's or a save's, deletes them all
 * at once when YouTube asks, and moves the findings of cards stored before, through the review role.
 */

// A held store never holds a request for longer than this.
const HELD_STORE_TIMEOUT_MILLISECONDS = 5_000;

export interface HeldYouTubeFindingsStores {
  /** Through the research-access role: holds at a save. */
  access?: HeldYouTubeFindingsStore;
  /** Through the review role: holds moved findings, reads and deletes. */
  review?: HeldYouTubeFindingsStore;
}

let processStores: HeldYouTubeFindingsStores | undefined;

/**
 * The held stores for the roles the environment configures, made once per process for process.env, so the save path
 * and the review tool share their pools; a role that is not configured, or whose configuration does not read, has none.
 */
export function heldYouTubeFindingsStoresFromEnv(env: NodeJS.ProcessEnv = process.env): HeldYouTubeFindingsStores {
  if (env === process.env && processStores !== undefined) return processStores;
  const stores: HeldYouTubeFindingsStores = {
    ...storeFor(() => researchContributorAccessConfigFromEnv(env), "access"),
    ...storeFor(() => researchContributionReviewConfigFromEnv(env), "review"),
  };
  if (env === process.env) processStores = stores;
  return stores;
}

function storeFor(
  config: () => { connectionString: string; schema: string; ssl: boolean | { rejectUnauthorized: boolean } } | undefined,
  role: keyof HeldYouTubeFindingsStores,
): HeldYouTubeFindingsStores {
  try {
    const read = config();
    if (read === undefined) return {};
    return {
      [role]: new PostgresHeldYouTubeFindingsStore({
        connectionString: read.connectionString,
        schema: read.schema,
        ssl: read.ssl,
        connectionTimeoutMillis: HELD_STORE_TIMEOUT_MILLISECONDS,
        queryTimeoutMillis: HELD_STORE_TIMEOUT_MILLISECONDS,
        statementTimeoutMillis: HELD_STORE_TIMEOUT_MILLISECONDS,
      }),
    };
  } catch {
    return {};
  }
}
