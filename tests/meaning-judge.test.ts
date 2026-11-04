import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";

import {
  createMeaningJudge,
  keyFromSecretFile,
  MEANING_JUDGE_OUTPUT_SCHEMA,
  MEANING_JUDGE_RUBRIC,
  meaningJudgeBundle,
  type MeaningJudgeBundle,
  type MeaningJudgeClient,
  type MeaningJudgeSource,
} from "../apps/research-mcp/src/meaning-judge.js";

// Owner answer 221 (2 November 2026): the meaning judge, a Claude API call during the final check for the owner's dev
// accounts only. Hermetic: every client here is a fake, so no test reaches the network or spends anything.

const KEY = `sk-ant-synthetic-${"k".repeat(40)}`;
const WORKSPACE = "wrkspc_01SyntheticWorkspace00";
const ENV = {
  ASKRIGOR_MEANING_JUDGE: "on",
  ASKRIGOR_MEANING_JUDGE_KEY_FILE: "/run/secrets/meaning-judge-key",
  ASKRIGOR_MEANING_JUDGE_WORKSPACE_ID: WORKSPACE,
};

const SOURCE: MeaningJudgeSource = {
  answer: "Supervised exercise eased hip pain more than usual care. People commenting on exercise videos reported relief.",
  commentsRead: true,
  card: {
    question: "Does supervised exercise help adults with hip osteoarthritis?",
    topic: { label: "Hip osteoarthritis" },
    findings: [{
      claim: "Supervised exercise eased hip pain more than usual care in trials.",
      applies_to: "Adults with hip osteoarthritis",
      answer_quote: "Supervised exercise eased hip pain more than usual care.",
      sources: ["10.1002/art.41142"],
      why_not_usual: "Quick answers call exercise a stopgap.",
      what_would_change_it: "A large trial finding no benefit.",
      kind: "effect",
      subject: "Supervised exercise therapy",
    }, {
      claim: "Commenters reported relief after months of exercise.",
      applies_to: "People commenting on exercise videos",
      answer_quote: "People commenting on exercise videos reported relief.",
      sources: ["10.1002/art.41142"],
      why_not_usual: "Quick answers skip what people report.",
      what_would_change_it: "Reports of no change.",
    }],
  },
  comparison: [
    { number: 1, claim: "Exercise helps a little.", outcome: "qualified", answer_quote: "Supervised exercise eased hip pain more than usual care.", sources: ["10.1002/art.41142"] },
    { number: 3, claim: "Most people need a replacement.", outcome: "corrected", answer_quote: "No trial found that.", sources: [], researchResult: "not_found" },
  ],
  keySources: [{ id: "10.1002/art.41142", answer_marker: "2020 review" }],
  limits: ["Comments on this video were only partly accessible.", "In an unblinded test, the person knows what they took."],
};

function message(overrides: Partial<Anthropic.Message> & { text?: string } = {}): Anthropic.Message {
  const { text, ...rest } = overrides;
  return {
    id: "msg_synthetic",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text: text ?? JSON.stringify({ youtube_comments: [], comparison: [], limits: [], standalone: [] }), citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    stop_details: null,
    usage: {
      input_tokens: 4_000, output_tokens: 700, cache_creation_input_tokens: 0, cache_read_input_tokens: 3_000,
      cache_creation: null, inference_geo: null, output_tokens_details: { thinking_tokens: 150 }, server_tool_use: null,
      service_tier: "standard",
    },
    ...rest,
  } as unknown as Anthropic.Message;
}

/** A fake SDK client: it records each request and answers with the next reply. */
function fakeClient(...replies: Array<Anthropic.Message | Error | "hang">) {
  const requests: Array<{ body: Anthropic.MessageCreateParamsNonStreaming; options: unknown }> = [];
  const settings: unknown[] = [];
  const client: MeaningJudgeClient = {
    messages: {
      create: (body, options) => {
        requests.push({ body, options });
        const reply = replies.length > 1 ? replies.shift()! : replies[0]!;
        if (reply === "hang") return new Promise<Anthropic.Message>(() => undefined);
        return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
      },
    },
  };
  return { requests, settings, factory: (value: unknown) => { settings.push(value); return client; } };
}

function judge(fake: ReturnType<typeof fakeClient>, env: Record<string, string> = {}, now = () => Date.parse("2026-11-02T12:00:00Z")) {
  const log = vi.fn();
  return {
    log,
    judge: createMeaningJudge({
      env: { ...ENV, ...env },
      readFile: () => `${KEY}\n`,
      client: fake.factory as never,
      now,
      log,
    }),
  };
}

const bundle = (): MeaningJudgeBundle => meaningJudgeBundle(SOURCE)!;

describe("the meaning judge's settings (owner answer 221)", () => {
  it("is off unless switched on with a readable key file, a known model and valid settings", async () => {
    const fake = fakeClient(message());
    const offs: Array<[Record<string, string | undefined>, string | undefined]> = [
      [{ ASKRIGOR_MEANING_JUDGE: undefined }, undefined],
      [{ ASKRIGOR_MEANING_JUDGE: "yes" }, undefined],
      [{ ASKRIGOR_MEANING_JUDGE_KEY_FILE: "" }, "key_file_not_set"],
      [{ ASKRIGOR_MEANING_JUDGE_MODEL: "claude-unknown-1" }, "settings_invalid"],
      [{ ASKRIGOR_MEANING_JUDGE_EFFORT: "max" }, "settings_invalid"],
      [{ ASKRIGOR_MEANING_JUDGE_DAILY_CAP_USD: "-1" }, "settings_invalid"],
      [{ ASKRIGOR_MEANING_JUDGE_TIMEOUT_SECONDS: "0" }, "settings_invalid"],
      [{ ASKRIGOR_MEANING_JUDGE_WORKSPACE_ID: "not-a-workspace" }, "settings_invalid"],
    ];
    for (const [change, logged] of offs) {
      const log = vi.fn();
      const env = { ...ENV, ...change } as Record<string, string | undefined>;
      for (const [name, value] of Object.entries(change)) if (value === undefined) delete env[name];
      const off = createMeaningJudge({ env: env as NodeJS.ProcessEnv, readFile: () => KEY, client: fake.factory as never, log });
      expect(off.enabled).toBe(false);
      expect(await off.judge(bundle())).toEqual({ judgment: { status: "skipped", reason: "off" }, cached: false, costUsd: 0, milliseconds: 0 });
      expect(log.mock.calls.flat()).toEqual(logged === undefined ? [] : [logged]);
    }
    // A key file that cannot be read, or holds no key, leaves it off; the key itself is never logged.
    for (const readFile of [() => { throw new Error(`ENOENT ${KEY}`); }, () => "no key here at all"]) {
      const log = vi.fn();
      expect(createMeaningJudge({ env: ENV, readFile, client: fake.factory as never, log }).enabled).toBe(false);
      expect(log.mock.calls.flat()).toEqual(["key_file_unreadable"]);
    }
    expect(fake.requests).toEqual([]);
  });

  it("reads the key from a mounted secret file: its one sk-ant- token, or the file's only token", () => {
    expect(keyFromSecretFile(`${KEY}\n`)).toBe(KEY);
    expect(keyFromSecretFile(`# Claude key\n${KEY}\n`)).toBe(KEY);
    expect(keyFromSecretFile("  plainsyntheticapikey0123456789  ")).toBe("plainsyntheticapikey0123456789");
    for (const text of ["", "two tokens", "short", `${KEY}"quoted"`]) expect(keyFromSecretFile(text)).toBeUndefined();
  });

  it("builds the client with the key, the workspace and the timeout, and defaults to Opus 5.5 at low effort", async () => {
    const fake = fakeClient(message());
    const { judge: configured } = judge(fake);
    expect(configured.enabled).toBe(true);
    expect(fake.settings).toEqual([{ apiKey: KEY, workspaceId: WORKSPACE, timeoutMs: 60_000 }]);
    await configured.judge(bundle());
    const [{ body, options }] = fake.requests;
    expect(body).toEqual({
      model: "claude-opus-5-5",
      max_tokens: 16_000,
      output_config: { effort: "low", format: { type: "json_schema", schema: MEANING_JUDGE_OUTPUT_SCHEMA } },
      system: [{ type: "text", text: MEANING_JUDGE_RUBRIC, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: JSON.stringify(bundle()) }],
    });
    // Thinking is always on with this model: no thinking or temperature setting is sent, and no retries.
    expect(body).not.toHaveProperty("thinking");
    expect(body).not.toHaveProperty("temperature");
    expect(options).toMatchObject({ timeout: 60_000, maxRetries: 0 });
    // The stable instructions come first, so the prompt cache can serve them; the check's bundle follows.
    expect(JSON.stringify(body.system)).not.toContain(SOURCE.answer);
    const medium = fakeClient(message());
    await judge(medium, { ASKRIGOR_MEANING_JUDGE_EFFORT: "medium", ASKRIGOR_MEANING_JUDGE_MODEL: "claude-sonnet-5-5" }).judge.judge(bundle());
    expect(medium.requests[0]!.body).toMatchObject({ model: "claude-sonnet-5-5", output_config: { effort: "medium" } });
  });
});

describe("what the meaning judge reads", () => {
  it("numbers each item by its place in the check's own lists, with the comparison's places as given", () => {
    const read = bundle();
    expect(read.comments_read).toBe(true);
    expect(read.card).toMatchObject({ question: SOURCE.card!.question, topic: "Hip osteoarthritis" });
    expect(read.card!.findings.map(({ number }) => number)).toEqual([1, 2]);
    expect(read.card!.findings[0]).toMatchObject({ kind: "effect", subject: "Supervised exercise therapy" });
    expect(read.card!.findings[1]).not.toHaveProperty("kind");
    expect(read.comparison).toEqual([
      { number: 1, claim: "Exercise helps a little.", outcome: "qualified", answer_quote: SOURCE.comparison![0]!.answer_quote,
        sources: ["10.1002/art.41142"], research_result: null },
      { number: 3, claim: "Most people need a replacement.", outcome: "corrected", answer_quote: "No trial found that.",
        sources: [], research_result: "not_found" },
    ]);
    expect(read.key_sources).toEqual([{ id: "10.1002/art.41142", label: "2020 review" }]);
    expect(read.limits).toEqual([{ number: 1, text: SOURCE.limits[0] }, { number: 2, text: SOURCE.limits[1] }]);
    // A not_checked entry is not the judge's question, and a check with nothing to judge makes no call.
    expect(meaningJudgeBundle({ ...SOURCE, comparison: [{ claim: "x", outcome: "not_checked" }] })!.comparison).toEqual([]);
    expect(meaningJudgeBundle({ ...SOURCE, card: undefined, comparison: [], limits: [] })).toBeUndefined();
    expect(meaningJudgeBundle({ ...SOURCE, card: undefined })!.card).toBeNull();
  });
});

describe("the meaning judge's call", () => {
  const reply = (value: unknown) => message({ text: JSON.stringify(value) });

  it("reads a structured reply: each item it judges, once, by a number the bundle has", async () => {
    const fake = fakeClient(reply({
      youtube_comments: [
        { finding: 1, rests_on_youtube_comments: false, why: "Trials only." },
        { finding: 2, rests_on_youtube_comments: true, why: "Commenters'\u0000 reports.\n" },
        { finding: 2, rests_on_youtube_comments: false, why: "A second judgment of the same finding is ignored." },
        { finding: 9, rests_on_youtube_comments: true, why: "No such finding." },
      ],
      comparison: [{ item: 1, backed: true, why: "" }, { item: 3, backed: false, why: "Nothing named examined it." },
        { item: 2, backed: false, why: "Not an item." }],
      limits: [{ limit: 1, applies: true, why: "" }, { limit: 2, applies: false, why: `No self-test; ${KEY}` }],
      standalone: [{ finding: 1, stands_alone: true, why: "" }, { finding: 2, stands_alone: false, why: "x".repeat(300) }],
    }));
    const call = await judge(fake).judge.judge(bundle());
    expect(call).toMatchObject({ cached: false, judgment: { status: "ran" } });
    expect(call.judgment).toEqual({
      status: "ran",
      youtube: [{ finding: 1, rests: false, why: "Trials only." }, { finding: 2, rests: true, why: "Commenters' reports." }],
      comparison: [{ item: 1, backed: true, why: "" }, { item: 3, backed: false, why: "Nothing named examined it." }],
      // Only a limit judged not to apply is kept; a reason holding key material is dropped, never the judgment.
      limits: [{ limit: 2, why: "" }],
      standalone: [{ finding: 1, standsAlone: true, why: "" }, { finding: 2, standsAlone: false, why: `${"x".repeat(199)}…` }],
    });
    // Its cost from the reply's usage: 4,000 input, 700 output and 3,000 cached tokens at Opus 5.5's prices.
    expect(call.costUsd).toBeCloseTo((4_000 * 4 + 700 * 20 + 3_000 * 0.2) / 1e6, 10);
    expect(call.usage).toEqual({ input: 4_000, output: 700, cacheWrite: 0, cacheRead: 3_000, thinking: 150 });
  });

  it("ignores YouTube judgments when the research read no comments", async () => {
    const fake = fakeClient(reply({ youtube_comments: [{ finding: 2, rests_on_youtube_comments: true, why: "x" }],
      comparison: [], limits: [], standalone: [] }));
    const call = await judge(fake).judge.judge(meaningJudgeBundle({ ...SOURCE, commentsRead: false })!);
    expect(call.judgment).toMatchObject({ status: "ran", youtube: [] });
  });

  it("checks a refusal before the content, and treats an incomplete or unreadable reply as not run", async () => {
    const cases: Array<[Anthropic.Message, string]> = [
      [message({ stop_reason: "refusal", text: JSON.stringify({ youtube_comments: [], comparison: [], limits: [], standalone: [] }) }), "refusal"],
      [message({ stop_reason: "max_tokens", text: "{\"youtube_comments\": [" }), "unreadable"],
      [message({ text: "not json" }), "unreadable"],
      [message({ text: JSON.stringify({ youtube_comments: [] }) }), "unreadable"],
      [message({ content: [] }), "unreadable"],
    ];
    for (const [reply, reason] of cases) {
      const { judge: configured, log } = judge(fakeClient(reply));
      const call = await configured.judge(bundle());
      expect(call.judgment).toEqual({ status: "skipped", reason });
      // The tokens it used still count against the day's cap.
      expect(call.costUsd).toBeGreaterThan(0);
      expect(log.mock.calls.flat()).toEqual([reason]);
    }
  });

  it("answers a failed call or a timeout as not run, never with the error's text", async () => {
    const failed = judge(fakeClient(new Error(`401 invalid key ${KEY}`)));
    expect((await failed.judge.judge(bundle())).judgment).toEqual({ status: "skipped", reason: "error" });
    expect(JSON.stringify(failed.log.mock.calls)).not.toContain(KEY);
    vi.useFakeTimers();
    try {
      const slow = judge(fakeClient("hang"), { ASKRIGOR_MEANING_JUDGE_TIMEOUT_SECONDS: "5" }, () => Date.now());
      const pending = slow.judge.judge(bundle());
      await vi.advanceTimersByTimeAsync(5_001);
      expect((await pending).judgment).toEqual({ status: "skipped", reason: "timeout" });
    } finally {
      vi.useRealTimers();
    }
  });

  // Owner answer 221: "a hard cap of $3 a day". The default was USD 10 until the build after #394.
  it("stops at USD 3 a day unless the server's settings give another cap", async () => {
    // Each reply costs 500,000 * 4 / 1e6 = USD 2.
    const costly = message({ usage: { ...message().usage, input_tokens: 500_000, output_tokens: 0, cache_read_input_tokens: 0 } });
    const fake = fakeClient(costly);
    const { judge: configured } = judge(fake);
    for (const answer of ["First answer.", "Second answer."]) {
      expect((await configured.judge(meaningJudgeBundle({ ...SOURCE, answer })!)).judgment.status).toBe("ran");
    }
    expect((await configured.judge(meaningJudgeBundle({ ...SOURCE, answer: "Third answer." })!)).judgment)
      .toEqual({ status: "skipped", reason: "daily_budget" });
    expect(fake.requests).toHaveLength(2);
    const { judge: raised } = judge(fakeClient(costly), { ASKRIGOR_MEANING_JUDGE_DAILY_CAP_USD: "5" });
    for (const answer of ["First answer.", "Second answer.", "Third answer."]) {
      expect((await raised.judge(meaningJudgeBundle({ ...SOURCE, answer })!)).judgment.status).toBe("ran");
    }
  });

  it("reuses a judgment for an hour, and stops at the daily cap until the next UTC day", async () => {
    let now = Date.parse("2026-11-02T12:00:00Z");
    // Each reply costs (4,000 * 4 + 700 * 20 + 3,000 * 0.2) / 1e6 = USD 0.0306.
    const fake = fakeClient(message());
    const { judge: configured } = judge(fake, { ASKRIGOR_MEANING_JUDGE_DAILY_CAP_USD: "0.05" }, () => now);
    const first = await configured.judge(bundle());
    const again = await configured.judge(bundle());
    expect(fake.requests).toHaveLength(1);
    expect(again).toEqual({ ...first, cached: true, costUsd: 0, milliseconds: 0 });
    // Another check is judged anew; a third finds the cap reached.
    await configured.judge(meaningJudgeBundle({ ...SOURCE, answer: "Another answer." })!);
    expect(fake.requests).toHaveLength(2);
    expect((await configured.judge(meaningJudgeBundle({ ...SOURCE, answer: "A third answer." })!)).judgment)
      .toEqual({ status: "skipped", reason: "daily_budget" });
    expect(fake.requests).toHaveLength(2);
    now = Date.parse("2026-11-03T00:00:01Z");
    expect((await configured.judge(meaningJudgeBundle({ ...SOURCE, answer: "A third answer." })!)).judgment.status).toBe("ran");
    expect(fake.requests).toHaveLength(3);
  });
});
