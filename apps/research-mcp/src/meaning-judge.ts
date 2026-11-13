import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { significanceMentions } from "./significance-language-lint.js";

/**
 * The meaning judge (owner answer 221, 2 November 2026): one Claude API call made during the final check, for the
 * owner's dev accounts only, once the check passes. The check's exact comparisons cannot judge meaning; the judge does,
 * in six jobs: whether a findings card's finding rests on YouTube comments, whether each change the plain-answer
 * comparison reports is backed by what it names, whether each limit applies to this answer, whether each finding
 * makes sense on its own to a reader of the public Atlas, and whether each source line's quotes back its claim (owner
 * answer 237a). Jobs 2 to 5 return notes for the AI only; job 1 holds the
 * findings it flags, the safe direction, as a declared one is held (owner answer 219b). It never blocks an answer: a
 * failure, timeout, refusal or reached cap leaves the check as it was, with one note saying the judge did not run.
 *
 * It is off unless ASKRIGOR_MEANING_JUDGE is `on`, with the key read from the file ASKRIGOR_MEANING_JUDGE_KEY_FILE
 * names (a read-only mounted secret, never the runtime environment). Funded by the owner's monthly Claude API credits
 * under governance/chat-work-authority-policy.json's OWNER_ANSWER_221, with its own daily cap beneath that ceiling.
 * AskRigor stores nothing it sends or receives here.
 */

export const MEANING_JUDGE_RUBRIC_VERSION = "2026-11-13.1";

// Stable instructions first, so the API's prompt cache can serve them across checks; the bundle follows them.
export const MEANING_JUDGE_RUBRIC = `You are the meaning judge of AskRigor, a health-research service. An AI researched a person's question with
AskRigor's tools and wrote an answer. AskRigor's final check has already compared the AI's declarations with its
signed receipts exactly, and the check passed. Exact comparisons cannot judge meaning; you do, in the six jobs below.
Your judgments reach the AI as notes, and for job 1 they also keep a finding private. Do not judge whether the answer
is right, do not redo the research, and judge each item only from what you are given. The answer and the declarations
may be in any language.

You receive one JSON object:
- answer: the checked answer, exactly as the person will see it.
- comments_read: true when AskRigor's receipts show that this research read YouTube comments.
- card: the findings card AskRigor may publish in its public Atlas, or null. It has question (the question in general
  terms), topic, and findings, each with its number, claim, applies_to (whom or what it holds for), answer_quote (the
  answer's sentence stating it), sources (DOI, PMID or PMCID of studies, or 11-character YouTube video IDs),
  why_not_usual, what_would_change_it, and kind, subject and direction when given.
- comparison: the AI's comparison of the answer with a quick plain answer written before the research. Each item has
  its number, the plain answer's claim, the outcome (confirmed, corrected or qualified), answer_quote (the answer's
  sentence stating what the research found), sources (what the AI says backs it) and research_result: not_found when
  AskRigor's check accepted the sentence as a search that found nothing, correction when it accepted it as a correction
  the research found, otherwise null.
- key_sources: the studies the answer cites, each identifier with the label the answer shows for it.
- limits: AskRigor's material limits for this answer, each with its number. Many are fixed sentences that a rule
  attaches whenever a declaration matches the rule, so a few may not fit this answer.
- significance_mentions: each appearance of significant, significantly, significance, or nonsignificant in the answer, with its number and nearby sentence context; an appearance is not inherently an error.
- source_lines: each key claim's line, with its number: source, claim (as the answer states it), sentence and conclusion
  (quotes the AI says are the paper's) and against (the strongest thing against the claim, in the AI's words).

Job 1, youtube_comments. Only when comments_read is true and the card has findings; otherwise return []. For each
finding, say whether it rests, in whole or in part, on YouTube comments: on what commenters or viewers reported,
experienced, recommended or claimed. Read the answer: where it reports what commenters said, a finding that repeats,
summarizes or leans on that rests on comments, even when its sources list only studies and even when it calls them
"informal reports", "anecdotes", "people's experiences" or "community reports". A finding resting only on studies,
trials, reviews, guidelines, labels, other forums or the video's own content does not. AskRigor never publishes a
finding that rests on YouTube comments, so when you are unsure, answer true.

Job 2, comparison. Return [] when there is no item. AskRigor's note credits each item to the work its sources name,
such as "from a full-text audit of 1 study". For each item, say whether what it names backs the point its sentence
states about the plain answer's claim. Each kind of source backs only its own kind of point: a study's DOI, PMID or
PMCID backs only what that study examined, as the answer describes it; an 11-character YouTube video ID backs only
what that video's commenters reported, and what such reports can and cannot show, since its comments were read; a
forum link backs only what people there reported, and what such reports can and cannot show. Not backed: a source
that did not examine the sentence's point, such as arithmetic, a definition, guidance, a label, a forum report, or a
limit of AskRigor's own access (a video it could not watch, a text it could not read) credited to a study or to
comments. When one of several sources examined the point, the item is backed. research_result not_found means
AskRigor accepted the sentence as a search that found nothing, and correction that it accepted it as a correction the
research found: that result backs an item naming no source, but a source an item names must still have examined its
point. Judge only whether what it names backs its point, not whether the outcome label fits or whether the sentence
only agrees with the claim.

Job 3, limits. Judge every limit, by its number: applies is false only when the limit's premise is false for this
answer, and then why says how; for a limit that applies, why is "". A limit applies whenever its premise is true for
this answer, even when the answer also rests on other evidence, does not dwell on it or does not mention that part of
the research. Its premise also holds in a stronger or partial form: "some searches failed" applies when all of them
failed, and "no one described their own use of what was asked about" applies when people described only related use.
Limits that state what this research covered or could not reach (a harm screen's scope, abstract-only reading, a video
that could not be watched, comments that could not all be read, thin YouTube evidence, a first pass, forum reports
AskRigor could not verify, what searches covered) apply whenever they describe this research. A limit does not apply
when its premise is false here: for example, a limit about an unblinded test when the only test the answer proposes is
a clinician's assessment or monitoring, or an objective measurement such as weight, a blood test or an ECG, rather than
the person judging for themselves whether something they took or did helped them; a limit saying a finding was
measured in a different tissue when the measured and the applied tissues it names are the same; or a limit about what
the answer says was not found when the answer says nothing was not found. When in doubt, the limit applies.

Job 4, standalone. Only when the card has findings; otherwise return []. The public Atlas shows each finding on its own
page, with the card's topic, the finding's subject, its claim and whom it applies to, to a reader who never saw the
question, the answer or the other findings. For each finding, say whether that reader would understand it: the claim
must state a finding (what was found, about what, in whom), naming its treatment, product, practice or condition, and
applies_to must say whom or what it holds for. It fails when it leans on words that point back to this research, such
as "the bundles", "these studies", "the two audited papers", "this approach" or "the program above", when applies_to
describes the research instead of whom it holds for (such as "interpretation of the audited papers" or "comparing the
trials with the video"), or when the claim is only a caveat about studies without saying what they found. Read the
claim with the topic and the subject, which the page shows above it: a claim that leaves its treatment or condition to
them still stands, and so does a search that found nothing when it says what was searched for and in whom. A technical
finding that names its subject and population passes.

Job 5, source_lines. Return [] when there is no line. For each line, say whether the sentence and the conclusion, read
together, back the claim as the answer states it: the same population, treatment, outcome and direction, and no firmer
than the paper's own words. Not backed: a claim wider or surer than its quotes, a quote about a different outcome or
group, or a conclusion that takes back what the sentence says. Read only these quotes, not what you know of the paper;
whether the quotes are really in the paper is already checked apart from you. A claim that only restates its quotes is
backed.

Job 6, significance_language. For each numbered significance_mentions, decide from the answer and nearby text whether
it MISUSES significant, significantly, significance or nonsignificant. Statistical significance, clinical/practical
importance and ordinary English importance are DIFFERENT senses, all legitimate when used accurately. Ordinary prose
like "a significant concern", "a significant improvement" meaning a substantial improvement, or "a significant
undertaking" is not an error merely because no p-value appears. Nor is accurately reporting a source's statistical
finding an error when the observed magnitude is reported elsewhere in the answer. Flag only a misleading inference:
treating nonsignificance as proof of no effect/equivalence; treating significant-vs-nonsignificant labels as
proof that effects differ; calling a p-value a measure of clinical importance or effect size; or materially
ambiguous significant used as the sole evidence of an outcome with no measure or intended sense nearby.
When unsure, set misused false: a word search cannot know intent. Keep the why concise and exact. Return [] for none.

Each why is one short sentence of at most 200 characters, in English, quoting at most a few words and never a
commenter's words; only a limit that applies has an empty why, and a limit whose premise you find true applies. Number each item exactly as given. Reply with the JSON
object the schema asks for.`;

/** What one check sends to the judge, read from the check's own input and result. */
export interface MeaningJudgeSource {
  answer: string;
  commentsRead: boolean;
  card?: {
    question: string;
    topic?: { label: string } | undefined;
    findings: ReadonlyArray<{
      claim: string;
      applies_to: string;
      answer_quote: string;
      sources: readonly string[];
      why_not_usual: string;
      what_would_change_it: string;
      kind?: string | undefined;
      subject?: string | undefined;
      direction?: string | undefined;
    }>;
  } | undefined;
  /**
   * The plain-answer comparison's entries the note credits to their work, each by its 1-based place in
   * plain_answer_comparison (its position here when not given); not_checked ones are left out.
   */
  comparison?: ReadonlyArray<{
    number?: number | undefined;
    claim: string;
    outcome: string;
    answer_quote?: string | undefined;
    sources?: readonly string[] | undefined;
    /** What the check accepted its sentence as, exactly: a declared search that found nothing, or a correction found. */
    researchResult?: "not_found" | "correction" | undefined;
  }>;
  keySources: ReadonlyArray<{ id: string; answer_marker?: string | undefined }>;
  limits: readonly string[];
  /** Each key claim's source line, by its 1-based place in source_lines (owner answer 237a). */
  sourceLines?: ReadonlyArray<{ source: string; claim: string; sentence: string; conclusion: string; against: string }>;
}

/** The JSON the judge reads: each item numbered from 1 by its place in the check's own lists. */
export interface MeaningJudgeBundle {
  answer: string;
  comments_read: boolean;
  card: null | {
    question: string;
    topic: string | null;
    findings: Array<Record<string, unknown> & { number: number }>;
  };
  comparison: Array<{
    number: number; claim: string; outcome: string; answer_quote: string | null; sources: string[];
    research_result: "not_found" | "correction" | null;
  }>;
  key_sources: Array<{ id: string; label: string | null }>;
  limits: Array<{ number: number; text: string }>;
  source_lines: Array<{ number: number; source: string; claim: string; sentence: string; conclusion: string; against: string }>;
  significance_mentions: Array<{ number: number; word: string; context: string }>;
}

/** The bundle one check sends, or undefined when it has nothing for any job to judge. */
export function meaningJudgeBundle(source: MeaningJudgeSource): MeaningJudgeBundle | undefined {
  const findings = (source.card?.findings ?? []).map((finding, index) => ({
    number: index + 1,
    claim: finding.claim,
    applies_to: finding.applies_to,
    answer_quote: finding.answer_quote,
    sources: [...finding.sources],
    why_not_usual: finding.why_not_usual,
    what_would_change_it: finding.what_would_change_it,
    ...(finding.kind === undefined ? {} : { kind: finding.kind }),
    ...(finding.subject === undefined ? {} : { subject: finding.subject }),
    ...(finding.direction === undefined ? {} : { direction: finding.direction }),
  }));
  const comparison = (source.comparison ?? []).flatMap((entry, index) => entry.outcome === "not_checked" ? [] : [{
    number: entry.number ?? index + 1,
    claim: entry.claim,
    outcome: entry.outcome,
    answer_quote: entry.answer_quote ?? null,
    sources: [...(entry.sources ?? [])],
    research_result: entry.researchResult ?? null,
  }]);
  const limits = source.limits.map((text, index) => ({ number: index + 1, text }));
  const sourceLines = (source.sourceLines ?? []).map((line, index) => ({ number: index + 1, ...line }));
  const significance = significanceMentions(source.answer);
  if (findings.length === 0 && comparison.length === 0 && limits.length === 0 && sourceLines.length === 0 && significance.length === 0) return undefined;
  return {
    answer: source.answer,
    comments_read: source.commentsRead,
    card: source.card === undefined || findings.length === 0 ? null : {
      question: source.card.question,
      topic: source.card.topic?.label ?? null,
      findings,
    },
    comparison,
    key_sources: source.keySources.map(({ id, answer_marker }) => ({ id, label: answer_marker ?? null })),
    limits,
    source_lines: sourceLines,
    significance_mentions: significance,
  };
}

const why = { type: "string", description: "One short sentence, at most 200 characters." } as const;
/** Structured outputs: the API returns JSON in exactly this shape. */
export const MEANING_JUDGE_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    youtube_comments: { type: "array", items: { type: "object", properties: {
      finding: { type: "integer" }, rests_on_youtube_comments: { type: "boolean" }, why,
    }, required: ["finding", "rests_on_youtube_comments", "why"], additionalProperties: false } },
    comparison: { type: "array", items: { type: "object", properties: {
      item: { type: "integer" }, backed: { type: "boolean" }, why,
    }, required: ["item", "backed", "why"], additionalProperties: false } },
    limits: { type: "array", items: { type: "object", properties: {
      limit: { type: "integer" }, applies: { type: "boolean" },
      why: { type: "string", description: "Empty when the limit applies; otherwise one short sentence." },
    }, required: ["limit", "applies", "why"], additionalProperties: false } },
    standalone: { type: "array", items: { type: "object", properties: {
      finding: { type: "integer" }, stands_alone: { type: "boolean" }, why,
    }, required: ["finding", "stands_alone", "why"], additionalProperties: false } },
    source_lines: { type: "array", items: { type: "object", properties: {
      line: { type: "integer" }, backed: { type: "boolean" }, why,
    }, required: ["line", "backed", "why"], additionalProperties: false } },
    significance_language: { type: "array", items: { type: "object", properties: {
      occurrence: { type: "integer" }, misused: { type: "boolean" }, why,
    }, required: ["occurrence", "misused", "why"], additionalProperties: false } },
  },
  required: ["youtube_comments", "comparison", "limits", "standalone", "source_lines", "significance_language"],
  additionalProperties: false,
} as const;

/** Each judgment by the 1-based number of the item it judges, as the bundle numbered it. */
export interface MeaningJudgmentItems {
  youtube: Array<{ finding: number; rests: boolean; why: string }>;
  comparison: Array<{ item: number; backed: boolean; why: string }>;
  limits: Array<{ limit: number; why: string }>;
  standalone: Array<{ finding: number; standsAlone: boolean; why: string }>;
  sourceLines: Array<{ line: number; backed: boolean; why: string }>;
  significance: Array<{ occurrence: number; misused: boolean; why: string }>;
}

export type MeaningJudgeSkipReason = "off" | "daily_budget" | "error" | "timeout" | "refusal" | "unreadable";
export type MeaningJudgment =
  | ({ status: "ran" } & MeaningJudgmentItems)
  | { status: "skipped"; reason: MeaningJudgeSkipReason };

/** What one call cost and took, for the owner's measurement; never stored. */
export interface MeaningJudgeCall {
  judgment: MeaningJudgment;
  /** Whether this judgment came from the hour's cache, with no new call. */
  cached: boolean;
  costUsd: number;
  milliseconds: number;
  usage?: { input: number; output: number; cacheWrite: number; cacheRead: number; thinking?: number };
}

export interface MeaningJudge {
  readonly enabled: boolean;
  /** The day's cap in USD while it is on (ASKRIGOR_MEANING_JUDGE_DAILY_CAP_USD); the Atlas account page shows it. */
  readonly dailyCapUsd?: number;
  judge(bundle: MeaningJudgeBundle): Promise<MeaningJudgeCall>;
}

/** The part of the official SDK's client the judge uses, so tests can pass a fake one; no network in tests. */
export interface MeaningJudgeClient {
  messages: {
    create(
      body: Anthropic.MessageCreateParamsNonStreaming,
      options?: { signal?: AbortSignal; timeout?: number; maxRetries?: number },
    ): PromiseLike<Anthropic.Message>;
  };
}

/** USD per million tokens: input, output, 5-minute cache write, cache read. */
interface Prices { input: number; output: number; cacheWrite: number; cacheRead: number }
// Claude API list prices for the models the owner's key lists (Claude API reference, 2 November 2026).
const PRICES: Readonly<Record<string, Prices>> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
};

const HOUR = 60 * 60 * 1_000;
const DEFAULT_TIMEOUT_SECONDS = 60;
const DEFAULT_DAILY_CAP_USD = 3;
const MAX_OUTPUT_TOKENS = 16_000;
const MAX_WHY = 200;
const EFFORTS = new Set(["low", "medium"]);

/** The key in a mounted secret file: the file's one token starting sk-ant-, or its whole trimmed text. */
export function keyFromSecretFile(text: string): string | undefined {
  const tokens = text.split(/\s+/u).filter((token) => token !== "");
  const key = tokens.find((token) => token.startsWith("sk-ant-")) ?? (tokens.length === 1 ? tokens[0] : undefined);
  return key !== undefined && /^[A-Za-z0-9_-]{20,400}$/u.test(key) ? key : undefined;
}

const judgmentSchema = z.object({
  youtube_comments: z.array(z.unknown()),
  comparison: z.array(z.unknown()),
  limits: z.array(z.unknown()),
  standalone: z.array(z.unknown()),
  source_lines: z.array(z.unknown()).default([]),
  significance_language: z.array(z.unknown()).default([]),
});

/**
 * A judgment's own short reason, as a note quotes it: one line, at most 200 characters, never the key; "" when it gave
 * none (or one holding key material). A judgment stands without its reason.
 */
function reasonText(value: unknown, key: string): string {
  if (typeof value !== "string") return "";
  // Control and formatting characters go, as for any text shown to the AI.
  const text = value.replace(/[\p{Cc}\p{Cf}]+/gu, " ").replace(/\s+/gu, " ").trim();
  if (text.includes(key) || /sk-ant-/u.test(text)) return "";
  return text.length <= MAX_WHY ? text : `${text.slice(0, MAX_WHY - 1).trimEnd()}…`;
}

/** The items of a structured reply that name an item the bundle has, each once. */
export function judgmentItems(reply: unknown, bundle: MeaningJudgeBundle, key = "\u0000"): MeaningJudgmentItems | undefined {
  const parsed = judgmentSchema.safeParse(reply);
  if (!parsed.success) return undefined;
  const object = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const findings = new Set((bundle.card?.findings ?? []).map(({ number }) => number));
  const items = new Set(bundle.comparison.map(({ number }) => number));
  const limits = new Set(bundle.limits.map(({ number }) => number));
  const lines = new Set(bundle.source_lines.map(({ number }) => number));
  const significance = new Set(bundle.significance_mentions.map(({ number }) => number));
  const once = <T extends Record<string, unknown>>(list: unknown[], field: string, known: ReadonlySet<number>,
    read: (entry: Record<string, unknown>, reason: string) => T | undefined): T[] => {
    const seen = new Set<number>();
    return list.flatMap((entry) => {
      if (!object(entry)) return [];
      const number = entry[field];
      const reason = reasonText(entry.why, key);
      if (typeof number !== "number" || !known.has(number) || seen.has(number)) return [];
      const value = read(entry, reason);
      if (value === undefined) return [];
      seen.add(number);
      return [value];
    });
  };
  return {
    youtube: bundle.comments_read ? once(parsed.data.youtube_comments, "finding", findings, (entry, reason) =>
      typeof entry.rests_on_youtube_comments === "boolean"
        ? { finding: entry.finding as number, rests: entry.rests_on_youtube_comments, why: reason } : undefined) : [],
    comparison: once(parsed.data.comparison, "item", items, (entry, reason) => typeof entry.backed === "boolean"
      ? { item: entry.item as number, backed: entry.backed, why: reason } : undefined),
    // Only the limits judged not to apply become notes, each with its reason.
    limits: once(parsed.data.limits.filter((entry) => object(entry) && entry.applies === false), "limit", limits,
      (entry, reason) => ({ limit: entry.limit as number, why: reason })),
    standalone: once(parsed.data.standalone, "finding", findings, (entry, reason) => typeof entry.stands_alone === "boolean"
      ? { finding: entry.finding as number, standsAlone: entry.stands_alone, why: reason } : undefined),
    sourceLines: once(parsed.data.source_lines, "line", lines, (entry, reason) => typeof entry.backed === "boolean"
      ? { line: entry.line as number, backed: entry.backed, why: reason } : undefined),
    significance: once(parsed.data.significance_language, "occurrence", significance,
      (entry, reason) => typeof entry.misused === "boolean"
        ? { occurrence: entry.occurrence as number, misused: entry.misused, why: reason } : undefined),
  };
}

export interface MeaningJudgeDependencies {
  env?: NodeJS.ProcessEnv;
  readFile?: (path: string) => string;
  /** Builds the API client; the official SDK by default. */
  client?: (settings: { apiKey: string; workspaceId: string | undefined; timeoutMs: number }) => MeaningJudgeClient;
  now?: () => number;
  /** A failure's class only, never its message, which could hold request details. */
  log?: (failureClass: string) => void;
}

/** A new instance reads its settings once; the production instance below is process-local. */
export function createMeaningJudge(dependencies: MeaningJudgeDependencies = {}): MeaningJudge {
  const env = dependencies.env ?? process.env;
  const now = dependencies.now ?? Date.now;
  const log = dependencies.log ?? ((line: string) => console.error(`meaning judge: ${line}`));
  const skipped = (reason: MeaningJudgeSkipReason): MeaningJudgeCall =>
    ({ judgment: { status: "skipped", reason }, cached: false, costUsd: 0, milliseconds: 0 });
  const off: MeaningJudge = { enabled: false, judge: async () => skipped("off") };
  if (env.ASKRIGOR_MEANING_JUDGE !== "on") return off;
  const keyFile = env.ASKRIGOR_MEANING_JUDGE_KEY_FILE?.trim();
  if (keyFile === undefined || keyFile === "") { log("key_file_not_set"); return off; }
  let key: string | undefined;
  try {
    key = keyFromSecretFile((dependencies.readFile ?? ((path: string) => readFileSync(path, "utf8")))(keyFile));
  } catch { key = undefined; }
  if (key === undefined) { log("key_file_unreadable"); return off; }
  const apiKey = key;
  const model = env.ASKRIGOR_MEANING_JUDGE_MODEL?.trim() || "claude-opus-5-5";
  const workspace = env.ASKRIGOR_MEANING_JUDGE_WORKSPACE_ID?.trim() || undefined;
  // Owner answer 221 approved "a hard cap of $3 a day (at most about $90 of the $200 a month)".
  const cap = Number(env.ASKRIGOR_MEANING_JUDGE_DAILY_CAP_USD ?? DEFAULT_DAILY_CAP_USD);
  const effort = env.ASKRIGOR_MEANING_JUDGE_EFFORT?.trim() || "low";
  const timeoutSeconds = Number(env.ASKRIGOR_MEANING_JUDGE_TIMEOUT_SECONDS ?? DEFAULT_TIMEOUT_SECONDS);
  const prices = PRICES[model];
  if (prices === undefined || !Number.isFinite(cap) || cap < 0 || !EFFORTS.has(effort) ||
    !Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0 || timeoutSeconds > 600 ||
    (workspace !== undefined && !/^wrkspc_[A-Za-z0-9]{8,64}$/u.test(workspace))) {
    log("settings_invalid");
    return off;
  }
  const timeoutMs = Math.round(timeoutSeconds * 1_000);
  const client = (dependencies.client ?? sdkClient)({ apiKey, workspaceId: workspace, timeoutMs });
  const cache = new Map<string, { until: number; call: Promise<MeaningJudgeCall> }>();
  let day = "";
  let spent = 0;
  const today = () => new Date(now()).toISOString().slice(0, 10);

  async function request(bundle: MeaningJudgeBundle): Promise<MeaningJudgeCall> {
    const started = now();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fail = (reason: MeaningJudgeSkipReason, costUsd = 0): MeaningJudgeCall => {
      log(reason);
      return { judgment: { status: "skipped", reason }, cached: false, costUsd, milliseconds: now() - started };
    };
    try {
      const timedOut = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("timeout")); }, timeoutMs);
      });
      const message = await Promise.race([Promise.resolve(client.messages.create({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        // The model's thinking is always on; effort is the only control (no thinking or temperature setting).
        output_config: {
          effort: effort as "low" | "medium",
          format: { type: "json_schema", schema: MEANING_JUDGE_OUTPUT_SCHEMA as unknown as Record<string, unknown> },
        },
        system: [{ type: "text", text: MEANING_JUDGE_RUBRIC, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: JSON.stringify(bundle) }],
      }, { signal: controller.signal, timeout: timeoutMs, maxRetries: 0 })), timedOut]);
      const usage = message.usage;
      const count = (value: number | null | undefined) =>
        typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
      const tokens = {
        input: count(usage?.input_tokens),
        output: count(usage?.output_tokens),
        cacheWrite: count(usage?.cache_creation_input_tokens),
        cacheRead: count(usage?.cache_read_input_tokens),
        ...(usage?.output_tokens_details?.thinking_tokens === undefined ? {}
          : { thinking: count(usage.output_tokens_details.thinking_tokens) }),
      };
      const costUsd = (tokens.input * prices!.input + tokens.output * prices!.output +
        tokens.cacheWrite * prices!.cacheWrite + tokens.cacheRead * prices!.cacheRead) / 1e6;
      // Charge the reply's UTC day, including a request that crossed midnight.
      if (today() !== day) { day = today(); spent = 0; }
      spent += costUsd;
      const measured = { costUsd, milliseconds: now() - started, usage: tokens };
      // A refusal is read before the content, which it may leave incomplete.
      if (message.stop_reason === "refusal") return { ...fail("refusal", costUsd), ...measured };
      const text = message.content.find((block): block is Anthropic.TextBlock => block.type === "text")?.text;
      if (message.stop_reason !== "end_turn" || text === undefined) return { ...fail("unreadable", costUsd), ...measured };
      let reply: unknown;
      try { reply = JSON.parse(text); } catch { return { ...fail("unreadable", costUsd), ...measured }; }
      const items = judgmentItems(reply, bundle, apiKey);
      if (items === undefined) return { ...fail("unreadable", costUsd), ...measured };
      return { judgment: { status: "ran", ...items }, cached: false, ...measured };
    } catch {
      return fail(controller.signal.aborted ? "timeout" : "error");
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    enabled: true,
    dailyCapUsd: cap,
    async judge(bundle) {
      const current = now();
      if (today() !== day) { day = today(); spent = 0; }
      // Keyed by everything the call sends: the same check called again reuses the judgment for an hour.
      const hash = createHash("sha256")
        .update(JSON.stringify([model, effort, MEANING_JUDGE_RUBRIC_VERSION, bundle])).digest("hex");
      for (const [entry, cached] of cache) if (cached.until <= current) cache.delete(entry);
      const cached = cache.get(hash);
      if (cached !== undefined) {
        const call = await cached.call;
        return { ...call, cached: true, costUsd: 0, milliseconds: 0 };
      }
      if (spent >= cap) return skipped("daily_budget");
      if (cache.size >= 200) cache.delete(cache.keys().next().value!);
      const call = request(bundle);
      cache.set(hash, { until: current + HOUR, call });
      const result = await call;
      if (result.judgment.status !== "ran" && cache.get(hash)?.call === call) cache.delete(hash);
      return result;
    },
  };
}

/** The official SDK's client, bound to the API itself whatever the environment says, with no retries of its own. */
function sdkClient(settings: { apiKey: string; workspaceId: string | undefined; timeoutMs: number }): MeaningJudgeClient {
  return new Anthropic({
    apiKey: settings.apiKey,
    baseURL: "https://api.anthropic.com",
    timeout: settings.timeoutMs,
    maxRetries: 0,
    // The SDK's own logging and tracing stay off whatever the environment says: at debug level it logs requests and
    // replies whole (the review of 13 Nov 2026).
    logLevel: "off",
    openTelemetry: false,
    // An organization-scoped key names the workspace it bills.
    ...(settings.workspaceId === undefined ? {} : { defaultHeaders: { "anthropic-workspace-id": settings.workspaceId } }),
  });
}

let configured: MeaningJudge | undefined;
/** The process's judge, configured from the environment on first use. */
export function meaningJudgeFromEnv(): MeaningJudge {
  configured ??= createMeaningJudge();
  return configured;
}
