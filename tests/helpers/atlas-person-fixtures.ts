/**
 * Atlas Release B's test findings: a ShownFinding as the pages build it, with every text field a route shows, and a
 * reader that labels sentences by rule (no network), for the hermetic tests.
 */
import type { MeaningJudgeClient } from "../../apps/research-mcp/src/meaning-judge.js";
import type { ShownFinding, ShownQuoteLine, ShownResearchSource } from "../../apps/research-mcp/src/atlas/page-data.js";
import { parsePersonReply, type PersonBundle } from "../../apps/research-mcp/src/atlas/person-claims.js";
import type { PersonReader, PersonReadingCall } from "../../apps/research-mcp/src/atlas/person-reading.js";

export function personFinding(overrides: Partial<ShownFinding> = {}): ShownFinding {
  return {
    publicationNumber: "P-1001", question: null, usualAnswer: null, links: {} as ShownFinding["links"],
    status: { kind: "unreviewed" }, topic: { key: "velmor-syndrome", label: "Velmor syndrome" },
    claim: "Zentarine 20 mg halved the tremor score in 60 of 240 against 36 of 240 on placebo.",
    certainty: "moderate", appliesTo: null, kind: null, subject: null, subjectType: null, direction: null,
    numbers: [], searches: [], sources: [], whyNotUsual: null, whatWouldChangeIt: null, verifiedBases: [],
    savedOn: "2026-11-19", researchCheckedOn: null, askrigorVersion: null, contested: [], replacedBy: [],
    publishedAt: "2026-11-19T12:00:00.000Z", stateChangedAt: "2026-11-19T12:00:00.000Z", kept: false,
    research: [], forumSignal: null, namedVideos: [], aiReadings: null, challenge: null, shownBy: null,
    shownTestVerdict: null,
    ...overrides,
  };
}

export function quoteLine(sentence: string, section = "Conflicts of interest", against = "It is one trial."):
  ShownQuoteLine {
  return { sentence, sentenceSection: section, conclusion: null, conclusionSection: null, text: "full_text", against };
}

export function researchSource(title: string, lines: ShownQuoteLine[], doi = "10.1000/velmor.1"): ShownResearchSource {
  return { source: { identifiers: [{ scheme: "doi", value: doi }], title, year: 2021 }, retraction: null, read: null,
    figures: null, lines };
}

export function forumSignal(mechanism: string | null = null): NonNullable<ShownFinding["forumSignal"]> {
  return { communities: ["r/velmor"], threadsRead: 2, threads: ["https://www.reddit.com/r/velmor/comments/abc123/"],
    people: { better: 3, noChange: 1, worse: 0, mixed: 0 }, quality: { detailed: 2, measured: 1, bare: 1 }, mechanism,
    studies: "support_not_located", studiesMeasured: null };
}

/** A rule for one sentence: its reply line after the number, or undefined for "none". */
export type PersonRule = (text: string, bundle: PersonBundle) => string | undefined;

/** The reply a rule gives for a bundle, in the reading's line format. */
export function ruleReply(bundle: PersonBundle, rule: PersonRule): { r: string[] } {
  return { r: bundle.sentences.map(({ n, text }) => `${n}|${rule(text, bundle) ?? "none"}`) };
}

/** A reader with no network: it answers by rule, at a fixed cost. */
export function ruleReader(rule: PersonRule, costUsd = 0.012): PersonReader & { calls: string[] } {
  const calls: string[] = [];
  return {
    model: "claude-opus-5-5", effort: "low", calls,
    reserveUsd: () => 0.05,
    async read(finding, bundle): Promise<PersonReadingCall> {
      calls.push(finding.publicationNumber);
      const parsed = parsePersonReply(ruleReply(bundle, rule), finding, bundle);
      const usage = { input: 2_000, output: 400, cacheWrite: 0, cacheRead: 0 };
      return parsed.ok
        ? { sentences: parsed.sentences, failure: null, refusalCategory: null, costUsd, milliseconds: 1, usage,
          stopReason: "end_turn" }
        : { sentences: null, failure: parsed.problem, refusalCategory: null, costUsd, milliseconds: 1, usage,
          stopReason: "end_turn" };
    },
  };
}

/** A fake SDK client answering each call with the next scripted message. */
export function scriptedClient(messages: Array<Record<string, unknown>>): MeaningJudgeClient & { bodies: unknown[] } {
  const bodies: unknown[] = [];
  return {
    bodies,
    messages: {
      async create(body) {
        bodies.push(body);
        const next = messages.shift();
        if (next === undefined) throw new Error("no scripted message");
        return next as never;
      },
    },
  };
}
