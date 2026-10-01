/**
 * NCBI E-utilities accept 3 requests per second per site without an API key
 * and 10 with one. A research run can issue several PubMed calls at once, so
 * request starts are spaced to queue a burst instead of failing with HTTP 429.
 */
export const NCBI_MIN_REQUEST_INTERVAL_MS = {
  withApiKey: 110,
  withoutApiKey: 350
} as const;

export interface RequestPacer {
  acquire(): Promise<void>;
}

export interface RequestPacerOptions {
  intervalMs: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

/** Spaces successive `acquire` resolutions at least `intervalMs` apart. */
export function createRequestPacer(options: RequestPacerOptions): RequestPacer {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ??
    ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  let nextSlotMs = 0;

  return {
    async acquire() {
      const currentMs = now();
      const startMs = Math.max(currentMs, nextSlotMs);
      nextSlotMs = startMs + options.intervalMs;
      if (startMs > currentMs) {
        await sleep(startMs - currentMs);
      }
    }
  };
}

const pacers = new Map<number, RequestPacer>();

/** Waits for this process's next NCBI request slot. Unit tests run unpaced. */
export async function waitForNcbiRequestSlot(hasApiKey: boolean): Promise<void> {
  if (process.env.NODE_ENV === "test") {
    return;
  }
  const intervalMs = hasApiKey
    ? NCBI_MIN_REQUEST_INTERVAL_MS.withApiKey
    : NCBI_MIN_REQUEST_INTERVAL_MS.withoutApiKey;
  let pacer = pacers.get(intervalMs);
  if (pacer === undefined) {
    pacer = createRequestPacer({ intervalMs });
    pacers.set(intervalMs, pacer);
  }
  await pacer.acquire();
}
