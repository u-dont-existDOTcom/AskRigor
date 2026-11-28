/**
 * Release A's acceptance (the design of 19 Nov 2026, section 3.1, and its Fable recheck, 2.1): with
 * ASKRIGOR_ATLAS_SHOW_SAVED_FINDINGS off, a signed-out reader and the lookup tool reach what main reaches, for the same
 * findings after the same actions. The scenario uses only what main has too, so this same file, run on main's tree,
 * wrote the snapshot the test compares with (tests/fixtures/atlas-reach-main.json; how, in that file's "made").
 *
 * Three free contributor's saves, each kept for the quick-answer test as on main: one names a (made-up) living person
 * and stays kept; the quick-answer test shows one with a pass; the owner shows the third. A fourth is one shown before
 * this release, as main's showing left it, with no route recorded (every finding on the pages today). Then every public page a
 * signed-out reader can open, and the lookup tool, are read. Each answer is reduced to its status, whether it is kept
 * out of search engines, how often it says the quick-answer test found that a quick AI answer misses a finding, and a
 * digest of its body with the only sentences Release A means to change (how findings reach the pages) taken out.
 */
import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";

import {
  InMemoryAtlasPageSource,
  InMemoryAtlasPublicationStore,
  RESEARCH_USE_NOTICE_VERSION,
} from "@askrigor/evidence-repository";

import { AtlasChangeSignal } from "../../apps/research-mcp/src/atlas/change-signal.js";
import { HEALTH } from "../../apps/research-mcp/src/atlas/health-tree.js";
import { AtlasKeptReview } from "../../apps/research-mcp/src/atlas/kept-review.js";
import { lookupAtlas } from "../../apps/research-mcp/src/atlas/lookup-tool.js";
import { createAtlasPagesHandler } from "../../apps/research-mcp/src/atlas/pages-http.js";
import { AtlasCardPublisher, planCardPublication } from "../../apps/research-mcp/src/atlas/publication.js";
import { createAskRigorHttpServer } from "../../apps/research-mcp/src/server.js";
import { recordOf } from "./atlas-participation-fixture.js";
import { VELMOR_CARD, VELMOR_TOPIC } from "./atlas-scenario.js";

/** What the quick-answer test found, as a page says it (atlas/pages.ts, QUICK_ANSWER_MISSES_IT, on main and here). */
export const REACH_TEST_SENTENCE = "A separate AI found that a quick AI answer misses it.";
/** How findings reach the pages, as main's home page says it, and as this release's does (ATLAS_HOME_ROUTES). */
export const REACH_HOME_SENTENCES = [
  "A finding reaches these pages once a separate AI finds that a quick AI answer misses it, or that it challenges the " +
    "usual view, marked “Not checked by supervisors yet” until AskRigor’s owner has reviewed it.",
  "Findings reach these pages in three ways: AskRigor’s owner publishes or shows them, a separate AI’s quick-answer " +
    "test shows them, or they show automatically once they have passed AskRigor’s checks. Not every finding records " +
    "which of these it was, older ones in particular, and a finding’s page says what that test found only when the " +
    "test is recorded for it. A finding is marked “Not checked by supervisors yet” until AskRigor’s owner has reviewed it.",
] as const;

export const REACH_CLAIMS = {
  person: "REACHPERSON Dr Invented Zentaro, a living cardiologist, said zentarine 20 mg halved the tremor score in 60 of " +
    "240 against 36 of 240 on placebo over 12 weeks.",
  tested: "REACHTESTED zentarine 20 mg halved the tremor score in 60 of 240 against 36 of 240 on placebo over 12 weeks.",
  owner: "REACHOWNER zentarine 20 mg halved the tremor score in 60 of 240 against 36 of 240 on placebo over 12 weeks.",
  before: "REACHBEFORE zentarine 20 mg halved the tremor score in 60 of 240 against 36 of 240 on placebo over 12 weeks.",
} as const;

export interface AtlasReachPage {
  status: number;
  noindex: boolean;
  testSentences: number;
  homeSentence: number;
  digest: string;
}

export interface AtlasReachSnapshot {
  publications: Record<keyof typeof REACH_CLAIMS, string>;
  pages: Record<string, AtlasReachPage>;
  lookup: Record<string, { status: string; findings: string[]; digest: string }>;
}

const SAVED_AT = Date.parse("2026-11-19T09:00:00.000Z");
const FREE = { mode: "FREE_CONTRIBUTOR", noticeVersion: RESEARCH_USE_NOTICE_VERSION } as const;

const count = (text: string, part: string) => text.split(part).length - 1;
const digestOf = (text: string) => {
  // The test's sentence goes with the space after it, as a finding's status gives it (atlas/pages.ts, quickAnswerWords).
  let reduced = text.replaceAll(`${REACH_TEST_SENTENCE} `, "").replaceAll(REACH_TEST_SENTENCE, "");
  for (const sentence of REACH_HOME_SENTENCES) reduced = reduced.replaceAll(sentence, "[routes]");
  // The footer's support link now reads "Support AskRigor", where main's read "Support": the only other change.
  reduced = reduced.replaceAll(">Support AskRigor</a>", ">Support</a>");
  return createHash("sha256").update(reduced).digest("hex");
};

export async function atlasReachSnapshot(): Promise<AtlasReachSnapshot> {
  let clock = SAVED_AT;
  const now = () => new Date(clock);
  const publications = new InMemoryAtlasPublicationStore();
  // showOnPages is this release's setting, off; main's publisher has none and ignores it.
  const publisher = new AtlasCardPublisher({ store: publications, now, showOnPages: false } as
    ConstructorParameters<typeof AtlasCardPublisher>[0]);
  const numbers = {} as Record<keyof typeof REACH_CLAIMS, string>;
  const cardOf = (key: keyof typeof REACH_CLAIMS) => ({ ...VELMOR_CARD, question: `${VELMOR_CARD.question} (${key})`,
    findings: [{ ...VELMOR_CARD.findings[0]!, claim: REACH_CLAIMS[key] }] });
  // Shown before this release: published and kept as the save did, then shown again by main's showing, which says
  // nothing of who acted, so nothing is recorded.
  {
    const record = recordOf(cardOf("before"));
    const plan = planCardPublication({ record, setAside: false, route: { route: "save", account: FREE } });
    const [row] = await publications.publish({ cardNumber: 4500, cardSha256: record.card_sha256,
      findings: plan.drafts as Parameters<typeof publications.publish>[0]["findings"], publishedAt: now().toISOString(),
      revive: false });
    numbers.before = row!.publicationNumber;
    await publications.keep({ publicationNumbers: [row!.publicationNumber], atlasNumbers: [], keep: true,
      reason: "owner answer 240a: quick-answer test, passed, waiting for the whole picture", at: now().toISOString() });
    await publications.keep({ publicationNumbers: [row!.publicationNumber], atlasNumbers: [], keep: false, reason: null,
      at: now().toISOString() });
  }
  for (const [key, issueNumber] of [["person", 4501], ["tested", 4502], ["owner", 4503]] as const) {
    clock += 60_000;
    await publisher.afterSave({ record: recordOf(cardOf(key)), issueNumber, kind: "created", setAside: false, replacedCards: [],
      account: FREE });
    const [row] = await publications.inspect({ cardNumbers: [issueNumber] });
    if (row === undefined) throw new Error(`REACH_NOT_PUBLISHED ${key}`);
    numbers[key] = row.publicationNumber;
  }
  // The quick-answer test shows one with a pass, and the owner shows another, each as it calls show_on_pages at this
  // release (main's review ignores who acts, which it doesn't take).
  const review = new AtlasKeptReview({ publications, now });
  clock += 60_000;
  for (const request of [
    { action: "show_on_pages", items: [numbers.tested], shown_by: "quick_answer_test", quick_answer_verdict: "pass" },
    { action: "show_on_pages", items: [numbers.owner], shown_by: "owner" },
  ]) {
    const shown = await review.run(request as Parameters<AtlasKeptReview["run"]>[0]);
    if (!shown.ok) throw new Error(`REACH_NOT_SHOWN ${JSON.stringify(shown)}`);
  }

  const source = new InMemoryAtlasPageSource({ publications });
  const handler = createAtlasPagesHandler({ enabled: true, source, signal: new AtlasChangeSignal() });
  const server = createAskRigorHttpServer({ publicServerEnabled: false, atlasPagesHandler: handler });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const pages: Record<string, AtlasReachPage> = {};
  try {
    const paths = ["/atlas", "/atlas/findings", "/atlas/topics", `/atlas/topics/${VELMOR_TOPIC.key}`,
      "/atlas/search?q=zentarine", "/atlas/search?q=Zentaro", "/atlas/map", "/atlas/sitemap.xml", "/atlas/changes",
      "/atlas/challenges", "/atlas/health", `/atlas/health/${HEALTH.subcategories[0]!.key}`,
      ...Object.values(numbers).map((number) => `/atlas/findings/${number}`)];
    for (const path of paths) {
      const response = await fetch(`${base}${path}`);
      const body = await response.text();
      pages[path] = { status: response.status, noindex: body.includes('<meta name="robots" content="noindex">'),
        testSentences: count(body, REACH_TEST_SENTENCE),
        homeSentence: REACH_HOME_SENTENCES.findIndex((sentence) => body.includes(sentence)), digest: digestOf(body) };
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
  }
  const lookup: AtlasReachSnapshot["lookup"] = {};
  for (const [name, input] of [["query zentarine", { query: "zentarine" }], ["query Zentaro", { query: "Zentaro" }],
    ["topic", { topic_key: VELMOR_TOPIC.key }]] as const) {
    const output = await lookupAtlas(input, { source, now, origin: "https://askrigor.example" });
    lookup[name] = { status: output.status, findings: output.findings.map((finding) => finding.publication_number),
      digest: digestOf(JSON.stringify(output)) };
  }
  return { publications: numbers, pages, lookup };
}
