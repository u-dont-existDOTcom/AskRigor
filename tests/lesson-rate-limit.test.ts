import { describe, expect, it } from "vitest";
import {
  createLessonAttemptLimiter,
  type LessonAttemptLimiter,
} from "../apps/research-mcp/src/lessons/rate-limit.js";

function clock(iso: string) {
  let value = new Date(iso);
  return {
    now: () => value,
    set(next: string) {
      value = new Date(next);
    },
  };
}

function consumeAllowed(limiter: LessonAttemptLimiter, count: number): void {
  for (let index = 0; index < count; index += 1) {
    expect(limiter.consume()).toEqual({ allowed: true });
  }
}

describe("endpoint-global lesson attempt limiter", () => {
  it("accepts exactly twenty attempts in one UTC-aligned hour", () => {
    const time = clock("2026-08-13T10:15:00.000Z");
    const limiter = createLessonAttemptLimiter({ now: time.now });

    consumeAllowed(limiter, 20);

    expect(limiter.consume()).toEqual({ allowed: false, retryAfterSeconds: 2_700 });
    expect(limiter.lastBlockingReason()).toBe("hourly_limit");
  });

  it("rolls the hourly counter over at the exact UTC hour boundary", () => {
    const time = clock("2026-08-13T10:59:59.999Z");
    const limiter = createLessonAttemptLimiter({ now: time.now });
    consumeAllowed(limiter, 20);
    expect(limiter.consume()).toEqual({ allowed: false, retryAfterSeconds: 1 });

    time.set("2026-08-13T11:00:00.000Z");

    expect(limiter.consume()).toEqual({ allowed: true });
  });

  it("accepts exactly one hundred attempts in one UTC day across hourly windows", () => {
    const time = clock("2026-08-13T00:00:00.000Z");
    const limiter = createLessonAttemptLimiter({ now: time.now });
    for (let hour = 0; hour < 5; hour += 1) {
      time.set(`2026-08-13T${String(hour).padStart(2, "0")}:00:00.000Z`);
      consumeAllowed(limiter, 20);
    }
    time.set("2026-08-13T05:00:00.000Z");

    expect(limiter.consume()).toEqual({ allowed: false, retryAfterSeconds: 68_400 });
    expect(limiter.lastBlockingReason()).toBe("daily_limit");
  });

  it("uses the earliest reset when both fixed windows block", () => {
    const time = clock("2026-08-13T00:00:00.000Z");
    const limiter = createLessonAttemptLimiter({ now: time.now });
    for (let hour = 0; hour < 5; hour += 1) {
      time.set(`2026-08-13T${String(hour).padStart(2, "0")}:30:00.000Z`);
      consumeAllowed(limiter, 20);
    }

    expect(limiter.consume()).toEqual({ allowed: false, retryAfterSeconds: 1_800 });
    expect(limiter.lastBlockingReason()).toBe("hourly_limit");
  });

  it("rolls both counters over at the exact UTC day boundary", () => {
    const time = clock("2026-08-13T19:00:00.000Z");
    const limiter = createLessonAttemptLimiter({ now: time.now });
    for (let hour = 19; hour < 24; hour += 1) {
      time.set(`2026-08-13T${String(hour).padStart(2, "0")}:00:00.000Z`);
      consumeAllowed(limiter, 20);
    }
    time.set("2026-08-13T23:59:59.999Z");
    expect(limiter.consume()).toEqual({ allowed: false, retryAfterSeconds: 1 });

    time.set("2026-08-14T00:00:00.000Z");

    expect(limiter.consume()).toEqual({ allowed: true });
  });

  it("fails closed on a backward clock without rolling counters backward", () => {
    const time = clock("2026-08-13T10:30:00.000Z");
    const limiter = createLessonAttemptLimiter({ now: time.now });
    expect(limiter.consume()).toEqual({ allowed: true });

    time.set("2026-08-13T10:29:59.000Z");
    expect(limiter.consume()).toEqual({ allowed: false, retryAfterSeconds: 1_801 });
    expect(limiter.lastBlockingReason()).toBe("hourly_limit");

    time.set("2026-08-13T10:30:01.000Z");
    expect(limiter.consume()).toEqual({ allowed: true });
  });

  it("fails closed for an invalid or throwing clock", () => {
    const invalid = createLessonAttemptLimiter({ now: () => new Date(Number.NaN) });
    const throwing = createLessonAttemptLimiter({ now: () => { throw new Error("private clock detail"); } });

    expect(invalid.consume()).toEqual({ allowed: false, retryAfterSeconds: 3_600 });
    expect(throwing.consume()).toEqual({ allowed: false, retryAfterSeconds: 3_600 });
    expect(invalid.lastBlockingReason()).toBe("hourly_limit");
    expect(throwing.lastBlockingReason()).toBe("hourly_limit");
  });
});
