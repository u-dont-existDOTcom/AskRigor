import {
  PostgresHeldYouTubeFindingsStore,
  type HeldYouTubeFindingsStore,
} from "@askrigor/evidence-repository";

import { researchContributionReviewConfigFromEnv, researchContributorAccessConfigFromEnv } from "../config.js";

/**
 * The research server's held YouTube findings (owner answer 173, 25 Oct): the findings drawn from YouTube comments that
 * a saved findings card leaves out, or of a card whose findings all rest on them, which is not saved as a card, held in
 * the living-evidence database for 30 days, for the owner's review, and then deleted (YouTube Developer Policies
 * III.E.4; no refreshing). The save path holds them through the research-access
 * role; the owner's review tool reads them, deletes a card's early and moves the findings of cards stored before
 * through the review role; and this process purges them at start and then every hour, through each.
 */

/** How often the research server purges held findings whose 30 days have ended. */
export const HELD_YOUTUBE_FINDINGS_PURGE_INTERVAL_MILLISECONDS = 60 * 60 * 1_000;
// A held store never holds a request or a purge for longer than this.
const HELD_STORE_TIMEOUT_MILLISECONDS = 5_000;

export interface HeldYouTubeFindingsStores {
  /** Through the research-access role: holds at a save, and purges. */
  access?: HeldYouTubeFindingsStore;
  /** Through the review role: holds moved findings, reads, deletes early, and purges. */
  review?: HeldYouTubeFindingsStore;
}

let processStores: HeldYouTubeFindingsStores | undefined;

/**
 * The held stores for the roles the environment configures, made once per process for process.env, so the save path,
 * the review tool and the purge share their pools; a role that is not configured, or whose configuration does not
 * read, has none.
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

export interface HeldYouTubeFindingsPurge {
  /** Stops the hourly purge. */
  stop(): void;
  /** Resolves once the purge running now, if any, has ended; for tests. */
  settled(): Promise<void>;
}

/**
 * Deletes held findings on day 30: a purge at once, at server start, and then every hour, from the research server
 * process itself (no other service), through each given store. Every read leaves out expired rows anyway, so nothing
 * older than 30 days is returned between purges. A purge that fails is tried again the next hour; it is not logged,
 * since in routine operation the application emits only its startup line. The timer does not keep the process alive.
 */
export function startHeldYouTubeFindingsPurge(
  stores: ReadonlyArray<Pick<HeldYouTubeFindingsStore, "purgeExpired"> | undefined>,
  options: {
    intervalMilliseconds?: number;
    setInterval?: (callback: () => void, milliseconds: number) => { unref?: () => unknown };
    clearInterval?: (timer: never) => void;
  } = {},
): HeldYouTubeFindingsPurge {
  const purging = [...new Set(stores.filter((store) => store !== undefined))];
  if (purging.length === 0) return { stop: () => undefined, settled: async () => undefined };
  let running: Promise<void> | undefined;
  const purge = () => {
    if (running !== undefined) return;
    running = (async () => {
      for (const store of purging) {
        try {
          await store.purgeExpired();
        } catch {
          // Tried again at the next hour; reads leave out expired rows meanwhile.
        }
      }
    })().finally(() => {
      running = undefined;
    });
  };
  purge();
  const timer = (options.setInterval ?? setInterval)(purge,
    options.intervalMilliseconds ?? HELD_YOUTUBE_FINDINGS_PURGE_INTERVAL_MILLISECONDS);
  timer.unref?.();
  return {
    stop: () => (options.clearInterval ?? clearInterval)(timer as never),
    settled: async () => {
      await running;
    },
  };
}
