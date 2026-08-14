export type LessonLimitReasonCode = "hourly_limit" | "daily_limit";

export type LessonAttemptLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export interface LessonAttemptLimiter {
  consume(): LessonAttemptLimitDecision;
  lastBlockingReason(): LessonLimitReasonCode;
}

export interface LessonAttemptLimiterOptions {
  now: () => Date;
}

const HOUR_MILLISECONDS = 60 * 60 * 1_000;
const DAY_MILLISECONDS = 24 * HOUR_MILLISECONDS;
const HOURLY_ATTEMPT_LIMIT = 20;
const DAILY_ATTEMPT_LIMIT = 100;
const CLOCK_FAILURE_RETRY_SECONDS = 3_600;

class FixedWindowLessonAttemptLimiter implements LessonAttemptLimiter {
  private hourStartMilliseconds?: number;
  private dayStartMilliseconds?: number;
  private lastObservedMilliseconds?: number;
  private hourlyAttempts = 0;
  private dailyAttempts = 0;
  private blockingReason: LessonLimitReasonCode = "hourly_limit";

  constructor(private readonly options: LessonAttemptLimiterOptions) {}

  consume(): LessonAttemptLimitDecision {
    const nowMilliseconds = this.readClock();
    if (nowMilliseconds === undefined) return this.clockFailure();

    if (
      this.lastObservedMilliseconds !== undefined &&
      nowMilliseconds < this.lastObservedMilliseconds
    ) {
      this.blockingReason = "hourly_limit";
      return {
        allowed: false,
        retryAfterSeconds: secondsUntil(
          fixedWindowStart(this.lastObservedMilliseconds, HOUR_MILLISECONDS) + HOUR_MILLISECONDS,
          nowMilliseconds,
        ),
      };
    }

    const hourStartMilliseconds = fixedWindowStart(nowMilliseconds, HOUR_MILLISECONDS);
    const dayStartMilliseconds = fixedWindowStart(nowMilliseconds, DAY_MILLISECONDS);
    if (this.hourStartMilliseconds === undefined || hourStartMilliseconds > this.hourStartMilliseconds) {
      this.hourStartMilliseconds = hourStartMilliseconds;
      this.hourlyAttempts = 0;
    }
    if (this.dayStartMilliseconds === undefined || dayStartMilliseconds > this.dayStartMilliseconds) {
      this.dayStartMilliseconds = dayStartMilliseconds;
      this.dailyAttempts = 0;
    }
    this.lastObservedMilliseconds = nowMilliseconds;

    const blockedWindows: Array<{
      reason: LessonLimitReasonCode;
      retryAfterSeconds: number;
    }> = [];
    if (this.hourlyAttempts >= HOURLY_ATTEMPT_LIMIT) {
      blockedWindows.push({
        reason: "hourly_limit",
        retryAfterSeconds: secondsUntil(hourStartMilliseconds + HOUR_MILLISECONDS, nowMilliseconds),
      });
    }
    if (this.dailyAttempts >= DAILY_ATTEMPT_LIMIT) {
      blockedWindows.push({
        reason: "daily_limit",
        retryAfterSeconds: secondsUntil(dayStartMilliseconds + DAY_MILLISECONDS, nowMilliseconds),
      });
    }
    if (blockedWindows.length > 0) {
      const earliest = blockedWindows.reduce((selected, candidate) =>
        candidate.retryAfterSeconds < selected.retryAfterSeconds ? candidate : selected
      );
      this.blockingReason = earliest.reason;
      return { allowed: false, retryAfterSeconds: earliest.retryAfterSeconds };
    }

    this.hourlyAttempts += 1;
    this.dailyAttempts += 1;
    return { allowed: true };
  }

  lastBlockingReason(): LessonLimitReasonCode {
    return this.blockingReason;
  }

  private readClock(): number | undefined {
    try {
      const value = this.options.now();
      const milliseconds = value instanceof Date ? value.getTime() : Number.NaN;
      return Number.isFinite(milliseconds) ? milliseconds : undefined;
    } catch {
      return undefined;
    }
  }

  private clockFailure(): LessonAttemptLimitDecision {
    this.blockingReason = "hourly_limit";
    return { allowed: false, retryAfterSeconds: CLOCK_FAILURE_RETRY_SECONDS };
  }
}

export function createLessonAttemptLimiter(
  options: LessonAttemptLimiterOptions,
): LessonAttemptLimiter {
  return new FixedWindowLessonAttemptLimiter(options);
}

function fixedWindowStart(milliseconds: number, windowMilliseconds: number): number {
  return Math.floor(milliseconds / windowMilliseconds) * windowMilliseconds;
}

function secondsUntil(resetMilliseconds: number, nowMilliseconds: number): number {
  return Math.max(1, Math.ceil((resetMilliseconds - nowMilliseconds) / 1_000));
}
