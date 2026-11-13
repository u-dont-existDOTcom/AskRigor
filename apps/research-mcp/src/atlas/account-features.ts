import type {
  ActiveResearchAccount,
  ResearchAccessView,
  ResearchContributorAccessService,
  ResearchUseNoticeAcceptance,
} from "@askrigor/evidence-repository";

import {
  GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD,
  geminiKeyDeclaredUnbilled,
  geminiScoutBudgetLeftNanoUsd,
} from "../actions/gemini-scout-route.js";
import { findingsLibraryEnabledFromEnv } from "../config.js";
import { GEMINI_VIDEO_DAILY_LIMIT_SECONDS, productionGeminiVideoLedger } from "../gemini-video-ledger.js";
import { GEMINI_VIDEO_MAX_SECONDS } from "../gemini-video-tool.js";
import { infoAccessClientFromEnv } from "../infoaccess-client.js";
import { MONTHLY_AI_BUDGET_NANO_USD } from "../lessons/ai-budget.js";
import { DAILY_ATTEMPT_LIMIT, HOURLY_ATTEMPT_LIMIT } from "../lessons/rate-limit.js";
import { meaningJudgeFromEnv } from "../meaning-judge.js";
import { researchPlannerFromEnv } from "../research-planner.js";
import { redditReaderFromEnv, SEARCH_PAGE_SIZE } from "../reddit-reader-client.js";
import { isDevAccount } from "../research-contributor-access-tool.js";
import { PLAIN_ANSWER_LIMITS } from "../research-finalization-gate.js";
import { researchReceiptSecretFromEnv } from "../research-receipts.js";
import { SHARED_ANSWER_DAILY_LIMIT, SHARED_ANSWER_RETENTION_DAYS, sharedAnswersFromEnv } from "../shared-answers.js";

/**
 * The signed-in person's AskRigor features on the Atlas account page (owner, 5 Nov 2026: "i should be able to see all
 * of the features i'm using on the askrigor accounts page"): for each feature, whether it is on for their account, who
 * pays for it and its limit. Their research account is read as manage_research_access's inspect reads it, by the
 * account key their session carries, through the access role the connector uses; the server's features come from its
 * settings, never a secret's value, and from its two usage ledgers, read without writing. Nothing is kept or logged,
 * and nothing about any other account is read.
 */

/** The server's features, as its settings and usage ledgers stand. */
export interface AtlasServerFeatures {
  /** AskRigor's Reddit reader is set up; public forum pages need nothing. */
  redditReader: boolean;
  /** The YouTube Data API key is set. */
  youtube: boolean;
  /** Gemini runs: its key is set and declared to have no billing, with the secret that signs its continuations. */
  gemini: boolean;
  /** What is left of this UTC month's AI budget, in nano-USD; null when it cannot be read. */
  aiBudgetLeftNanoUsd: number | null;
  /** The seconds of video Gemini may still read today, Pacific time; null when they cannot be read. */
  videoSecondsLeft: number | null;
  /** The meaning judge (owner answer 221), and its daily cap in USD while it is on. */
  meaningJudge: { on: boolean; dailyCapUsd: number | null };
  /** AskRigor's own planning call (owner answer 298b), with its daily cap in USD and its calls per account while on. */
  researchPlanner: { on: boolean; dailyCapUsd: number | null; accountDailyCalls: number | null };
  /** The owner's library (InfoAccess) is set up. */
  ownerLibrary: boolean;
  /** Shared answers (owner answer 200a) are kept. */
  sharedAnswers: boolean;
  /** The findings library is open. */
  findingsLibrary: boolean;
}

/** The signed-in person's research account, as inspect reports it, with its own switches. */
export interface AtlasResearchAccount {
  status: ResearchAccessView["status"];
  mode: ResearchAccessView["mode"];
  /** The current free-use notice, as inspect reports it. */
  noticeVersion: string;
  /** An active free account's yes, as inspect reports it: the notice it holds, and how it was accepted. */
  acceptance?: ResearchUseNoticeAcceptance;
  /** An active account's switches; null when it is not active, or its paid private entitlement lapsed. */
  settings: Pick<ActiveResearchAccount, "plainAnswerNote" | "detailedLessonReports" | "findingsSave"> | null;
  /** A paid private account whose entitlement is no longer active: inspect still says active, the research tools refuse. */
  entitlementLapsed: boolean;
  /** One of the dev accounts the server's settings list (ASKRIGOR_DEV_ACCOUNT_KEYS). */
  devAccount: boolean;
  /** AskRigor's owner, the subject the owner review admits (ASKRIGOR_OAUTH_ALLOWED_SUBJECT). */
  owner: boolean;
}

export interface AtlasFeatureRow {
  /** The feature's anchor on the page, after feature-. */
  id: string;
  name: string;
  /** Whether it is on for this account. */
  on: boolean;
  forYou: string;
  whoPays: string;
  limit: string;
}

export type AtlasAccountFeatures =
  | { state: "shown"; rows: AtlasFeatureRow[] }
  // A session sealed before sessions carried the account key: signing in again shows the features.
  | { state: "sign-in-again" }
  // The research account or the server's features could not be read just now.
  | { state: "unavailable" };

/** What the account page reads the features with. */
export interface AtlasFeaturesRuntime {
  /** The research access service's reads by account key: the connector's own, through the same access role. */
  research: Pick<ResearchContributorAccessService, "inspectByAccountKey" | "activeAccountByKey">;
  /** The server's features, read for each page. */
  server: () => Promise<AtlasServerFeatures>;
  /** The research account keys of AskRigor's owner, derived once from the owner's subjects. */
  ownerAccountKeys: ReadonlySet<string>;
  /** The dev accounts' references, as the connector reads them. */
  devAccountKeys: () => ReadonlySet<string>;
}

/**
 * The features of the account a session carries: none to show for a session without an account key, and a plain
 * refusal when its research account or the server's features cannot be read, so the page itself never fails.
 */
export async function loadAtlasAccountFeatures(runtime: AtlasFeaturesRuntime, accountKey: string | null, now: Date):
  Promise<AtlasAccountFeatures> {
  if (accountKey === null) return { state: "sign-in-again" };
  try {
    const [account, server] = await Promise.all([researchAccountOf(runtime, accountKey), runtime.server()]);
    return { state: "shown", rows: atlasFeatureRows(account, server, now) };
  } catch {
    return { state: "unavailable" };
  }
}

async function researchAccountOf(runtime: AtlasFeaturesRuntime, accountKey: string): Promise<AtlasResearchAccount> {
  const access = await runtime.research.inspectByAccountKey(accountKey);
  let settings: AtlasResearchAccount["settings"] = null;
  let entitlementLapsed = false;
  // An active account's switches, read as inspect reads them; inspect does not check a paid entitlement, which the
  // research tools do, so a lapsed one shows here as off.
  if (access.status === "ACTIVE" && access.mode !== null) {
    try {
      const { plainAnswerNote, detailedLessonReports, findingsSave } = await runtime.research.activeAccountByKey(accountKey);
      settings = { plainAnswerNote, detailedLessonReports, findingsSave };
    } catch (error) {
      if ((error as { code?: unknown } | null)?.code !== "PAID_PRIVATE_ENTITLEMENT_REQUIRED") throw error;
      entitlementLapsed = true;
    }
  }
  return {
    status: access.status,
    mode: access.mode,
    noticeVersion: access.noticeVersion,
    ...(access.acceptance === undefined ? {} : { acceptance: access.acceptance }),
    settings,
    entitlementLapsed,
    devAccount: isDevAccount(accountKey, runtime.devAccountKeys()),
    owner: runtime.ownerAccountKeys.has(accountKey),
  };
}

// Words -----------------------------------------------------------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const NEEDS_ACCESS = "It needs research access, above.";
const NOT_SET_UP = "Not set up on this server.";
const GEMINI_OFF = "Not set up on this server: AskRigor runs Gemini only on a key with no billing.";
const GEMINI_PAYS = "No one: AskRigor runs Gemini only on a key with no billing.";
const PAID_PAYS = "Your paid private entitlement covers it. AskRigor doesn't sell one online yet.";

/** A whole number with its thousands separated, as 1,500. */
const count = (value: number) => String(value).replace(/\B(?=(\d{3})+(?!\d))/gu, ",");

/** An amount in USD, as $50 or $2.50. */
const dollars = (usd: number) => `$${Number.isInteger(usd) ? count(usd) : usd.toFixed(2)}`;
const nanoDollars = (nanoUsd: number) => dollars(nanoUsd / 1_000_000_000);

const hours = (seconds: number) => `${seconds / 3_600} hour${seconds === 3_600 ? "" : "s"}`;

/** The free-use notice as its version reads, free-contributor-v4-2026-10-25: "version 4, of 25 Oct 2026". */
export function noticeWords(version: string): string {
  const match = /^free-contributor-v(\d+)-(\d{4})-(\d{2})-(\d{2})$/u.exec(version);
  const month = match === null ? undefined : MONTHS[Number(match[3]) - 1];
  return match === null || month === undefined ? "the current version"
    : `version ${match[1]}, of ${Number(match[4])} ${month} ${match[2]}`;
}

/** The first day of the next UTC month, when the AI budget starts again. */
function nextMonth(now: Date): string {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return `1 ${MONTHS[next.getUTCMonth()]} ${next.getUTCFullYear()}`;
}

/**
 * The notice an active free account holds, in words, exactly as it was accepted (the owner, 6 Nov 2026): by the person,
 * or for the owner's own login by the owner's standing instruction; and whether that yes carries forward to a newer
 * notice that changed only in wording.
 */
function acceptedNotice(account: AtlasResearchAccount): string {
  const acceptance = account.acceptance;
  if (acceptance === undefined) return `under the free-use notice you accepted: ${noticeWords(account.noticeVersion)}.`;
  const held = acceptance.acceptedBy === "OWNER_STANDING_INSTRUCTION_2026_11_06"
    ? `under the free-use notice ${noticeWords(acceptance.noticeVersion)}, accepted for you by your standing instruction ` +
      "of 6 Nov 2026."
    : acceptance.acceptedBy === null
      // A row a hold or restore script, or an image from before migration 0031, last wrote: how isn't known.
      ? `under the free-use notice ${noticeWords(acceptance.noticeVersion)}. How it was accepted wasn't recorded.`
      : `under the free-use notice you accepted: ${noticeWords(acceptance.noticeVersion)}.`;
  return acceptance.current === "carried_forward"
    ? `${held} The notice has changed only in wording since, so your yes carries forward to ` +
      `${noticeWords(account.noticeVersion)}.`
    : held;
}

function researchAccess(account: AtlasResearchAccount): Pick<AtlasFeatureRow, "on" | "forYou" | "whoPays"> {
  const notice = noticeWords(account.noticeVersion);
  if (account.settings !== null && account.mode === "FREE_CONTRIBUTOR") {
    return {
      on: true,
      forYou: `Free contributor use, ${acceptedNotice(account)}`,
      whoPays: "No one pays money: free use is reciprocal. What AskRigor learns from your research is saved for its " +
        "research library, and your findings cards are published in the Atlas.",
    };
  }
  if (account.settings !== null) {
    return {
      on: true,
      forYou: "Paid private use: AskRigor saves research findings or lesson feedback only when you accept saving them, " +
        "answer by answer.",
      whoPays: PAID_PAYS,
    };
  }
  if (account.entitlementLapsed) {
    return {
      on: false,
      forYou: "Your paid private entitlement is no longer active, so AskRigor's research tools don't run for you. Your AI " +
        "app can offer you free contributor use instead.",
      whoPays: PAID_PAYS,
    };
  }
  return {
    on: false,
    forYou: account.status === "REVOKED"
      ? `You turned research access off. Before you research again, your AI app asks you to choose free contributor ` +
        `use, under the free-use notice (${notice}), or paid private use.`
      : `Not chosen yet, or AskRigor's free-use notice now collects or publishes more than the one you accepted. ` +
        "Before research, your AI app " +
        `shows you the current notice (${notice}) and asks you to choose free contributor use or paid private use.`,
    whoPays: "Free contributor use costs nothing: it is reciprocal. Paid private use needs a paid private entitlement, " +
      "which AskRigor doesn't sell online yet.",
  };
}

function findingsCards(account: AtlasResearchAccount, server: AtlasServerFeatures): Pick<AtlasFeatureRow, "on" | "forYou"> {
  const settings = account.settings;
  if (!server.findingsLibrary) {
    return { on: false, forYou: "AskRigor's findings library is closed on this server, so no findings card is saved." };
  }
  if (settings === null) return { on: false, forYou: NEEDS_ACCESS };
  if (account.mode === "PAID_PRIVATE") {
    return { on: true, forYou: "Only with your yes: after the final check, your AI asks you before an answer's findings " +
      "card is saved." };
  }
  return settings.findingsSave
    ? { on: true, forYou: "The final check saves the findings card of each finished answer whose findings would help " +
      "other people, and the Atlas publishes it as soon as it is saved, marked “Not checked by supervisors yet” until " +
      "AskRigor's owner reviews it. " + (account.devAccount
        ? "As one of the owner's dev accounts, yours can have your AI turn this off, for regression runs."
        : "Only the owner's dev accounts can turn this off.") }
    : { on: false, forYou: "Turned off for your account, for regression runs: the final check still checks each " +
      "findings card, but saves none. " + (account.devAccount ? "Your AI can turn it back on."
        : "Ask AskRigor's owner to turn it back on.") };
}

/** On when the server has it and the account has research access; otherwise why not. */
function available(set: boolean, usable: boolean, on: string, off = NOT_SET_UP): Pick<AtlasFeatureRow, "on" | "forYou"> {
  return !set ? { on: false, forYou: off } : usable ? { on: true, forYou: on } : { on: false, forYou: NEEDS_ACCESS };
}

/** The account's features as they stand: its own switches first, then the server's features, each for this account. */
export function atlasFeatureRows(account: AtlasResearchAccount, server: AtlasServerFeatures, now: Date): AtlasFeatureRow[] {
  const settings = account.settings;
  const usable = settings !== null;
  const scoutLeft = server.aiBudgetLeftNanoUsd;
  const videoLeft = server.videoSecondsLeft;
  const cap = server.meaningJudge.dailyCapUsd;
  const perHourAndDay = (what: string) => `${HOURLY_ATTEMPT_LIMIT} ${what} an hour and ${DAILY_ATTEMPT_LIMIT} a day, ` +
    "from everyone together.";
  return [
    {
      id: "research-access",
      name: "Research access",
      ...researchAccess(account),
      limit: "AskRigor sets no limit on your research; some features below have limits of their own.",
    },
    {
      id: "plain-answer-note",
      name: "The plain-answer note",
      on: settings?.plainAnswerNote === true,
      forYou: settings === null ? NEEDS_ACCESS : settings.plainAnswerNote
        ? "Before research, AskRigor's connector has your AI write the short answer it would give without " +
          "AskRigor's tools, and the checked answer ends with a note comparing the two."
        : "Before research, AskRigor's connector still has your AI write the short answer it would give without " +
          "AskRigor's tools, and it still guides the research, but the checked answer doesn't end with the note " +
          "comparing the two. Your AI can turn the note back on when you ask.",
      whoPays: "No one: AskRigor's own final check writes the note.",
      limit: `A plain answer holds at most ${count(PLAIN_ANSWER_LIMITS.textCharacters)} characters and ` +
        `${PLAIN_ANSWER_LIMITS.claims} claims, each at most ${PLAIN_ANSWER_LIMITS.claimCharacters} characters.`,
    },
    {
      id: "findings-cards",
      name: "Saving findings cards",
      ...findingsCards(account, server),
      whoPays: "No one.",
      limit: `AskRigor saves at most ${perHourAndDay("findings cards")}`,
    },
    {
      id: "detailed-lesson-reports",
      name: "Detailed lesson reports",
      on: settings?.detailedLessonReports === true,
      forYou: settings === null ? NEEDS_ACCESS : settings.detailedLessonReports
        ? "A lesson you send AskRigor about what went wrong may carry a detailed report, which your AI shows you " +
          "with the lesson before asking you to send it."
        : "Off, as by default: a lesson you send AskRigor about what went wrong carries no detailed report. Your AI " +
          "can turn them on when you ask.",
      whoPays: "No one.",
      limit: `AskRigor takes at most ${perHourAndDay("lessons")}`,
    },
    {
      id: "forums",
      name: "Reading forums",
      on: usable,
      forYou: !usable ? NEEDS_ACCESS : server.redditReader
        ? "Your AI can read public forum pages, and search and read Reddit threads through AskRigor's Reddit reader."
        : "Your AI can read public forum pages. AskRigor's Reddit reader isn't set up on this server, so Reddit stays " +
          "with your AI's own search.",
      whoPays: "No one: AskRigor reads the pages itself.",
      limit: server.redditReader
        ? `The Reddit reader takes one request at a time, and a Reddit search returns up to ${SEARCH_PAGE_SIZE} threads ` +
          "a page."
        : "No limit of its own.",
    },
    {
      id: "video-search",
      name: "Video search and comments",
      ...available(server.youtube, usable, "Your AI can search YouTube and read a video's details, its comments and " +
        "their replies."),
      whoPays: "No one: Google gives AskRigor a free daily quota.",
      limit: "YouTube's daily quota for AskRigor, shared by everyone; it starts again each day at midnight Pacific time.",
    },
    {
      id: "video-scout",
      name: "The video scout",
      ...available(server.gemini, usable, "Your AI can ask Gemini, Google's AI, to search the web for YouTube videos on " +
        "a question described in general terms, without personal details.", GEMINI_OFF),
      whoPays: GEMINI_PAYS,
      limit: `AskRigor's AI budget: ${nanoDollars(MONTHLY_AI_BUDGET_NANO_USD)} a month, for everyone together, and each ` +
        `search sets aside ${nanoDollars(GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD)} of it.` + (!server.gemini ? ""
          : scoutLeft === null ? " AskRigor couldn't read how much of it is used this month."
            : scoutLeft < GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD
              ? ` Used up this month: no search can start until ${nextMonth(now)}.`
              : " Not used up this month."),
    },
    {
      id: "video-reading",
      name: "Video reading",
      ...available(server.gemini, usable, `Your AI can have Gemini watch a public YouTube video of up to ` +
        `${hours(GEMINI_VIDEO_MAX_SECONDS)} and list the health claims it makes, each with its time.`, GEMINI_OFF),
      whoPays: GEMINI_PAYS,
      limit: `${hours(GEMINI_VIDEO_DAILY_LIMIT_SECONDS)} of video a day, for everyone together; each reading counts ` +
        "the whole video, and the day starts again at midnight Pacific time." + (!server.gemini ? ""
          : videoLeft === null ? " AskRigor couldn't read how much is used today."
            : videoLeft <= 0 ? " Used up today." : " Not used up today."),
    },
    {
      id: "owner-library",
      name: "Papers from the owner's library",
      ...available(server.ownerLibrary, usable, account.owner
        ? "You are AskRigor's owner: when no open copy of a paper is found, AskRigor gets it from your library."
        : "When no open copy of a paper is found, AskRigor gets it from its owner's library, but only a paper that is " +
          "public in another way: a public page with the paper's own text beyond its abstract, or an open license."),
      whoPays: "No one: AskRigor uses only the library's free PDF route.",
      limit: "Only papers with a DOI (the identifier journals give papers). AskRigor asks the library last, one paper " +
        "at a time for everyone together.",
    },
    {
      id: "sharing",
      name: "Sharing an answer with AskRigor",
      ...available(server.sharedAnswers, usable, "When an answer ends with AskRigor's offer, you can send a " +
        "de-identified copy of your question and the answer to help improve AskRigor. Nothing is sent before you confirm."),
      whoPays: "No one.",
      limit: `${SHARED_ANSWER_DAILY_LIMIT} a day from your account. Each copy is kept apart from your account and never ` +
        `made public, for ${SHARED_ANSWER_RETENTION_DAYS} days; the code you get deletes it sooner.`,
    },
    {
      id: "meaning-judge",
      name: "The meaning judge",
      on: server.meaningJudge.on && account.devAccount && usable,
      forYou: !server.meaningJudge.on
        ? "Switched off on this server. When it is on, it runs only for the owner's dev accounts."
        : !account.devAccount ? "It runs only for the owner's dev accounts."
          : !usable ? NEEDS_ACCESS
            : "Your account is one of the owner's dev accounts: once a final check passes, Claude, Anthropic's AI, " +
              "reads the answer and its findings card for what exact checks can't judge, such as whether each limit " +
              "applies to the answer.",
      whoPays: "AskRigor's owner, from their monthly Claude API credits.",
      limit: server.meaningJudge.on && cap !== null ? `At most ${dollars(cap)} a day.` : "Nothing is spent while it is off.",
    },
    {
      id: "research-planner",
      name: "AskRigor's own research plan",
      on: server.researchPlanner.on && account.devAccount && usable,
      forYou: !server.researchPlanner.on
        ? "Switched off on this server. When it is on, it runs only for the owner's dev accounts."
        : !account.devAccount ? "It runs only for the owner's dev accounts."
          : !usable ? NEEDS_ACCESS
            : "Your account is one of the owner's dev accounts: right after your AI's quick answer, Claude, " +
              "Anthropic's AI, looks up what your question is about with up to two web searches, then names the " +
              "one question to put to you before the research, or none, and the research tasks. Your question as " +
              "you wrote it, your AI's quick answer and the search words go to Anthropic for this; AskRigor keeps " +
              "none of them.",
      whoPays: "AskRigor's owner, from their monthly Claude API credits.",
      limit: server.researchPlanner.on && server.researchPlanner.dailyCapUsd !== null &&
          server.researchPlanner.accountDailyCalls !== null
        ? `At most ${dollars(server.researchPlanner.dailyCapUsd)} a day from everyone together, and ` +
          `${server.researchPlanner.accountDailyCalls} plans a day for your account; after that your AI plans the ` +
          "research itself until 00:00 UTC, and tells you so."
        : "Nothing is spent while it is off.",
    },
  ];
}

// The server's settings -------------------------------------------------------------------------------------------------

/** Whether a settings reader finds its feature configured; one that throws on its settings counts as not. */
function configured(read: () => unknown): boolean {
  try {
    return read() !== undefined;
  } catch {
    return false;
  }
}

/**
 * The server's features from its settings, read by the readers the tools themselves use: the settings once, the AI
 * budget and the video ledger for each page (a ledger that cannot be read gives null), and the meaning judge and shared
 * answers from the process's own instances. No value of a secret leaves this function: only whether each is set.
 */
export function atlasServerFeaturesFromEnv(env: NodeJS.ProcessEnv = process.env): () => Promise<AtlasServerFeatures> {
  const redditReader = configured(() => redditReaderFromEnv(env));
  const youtube = (env.YOUTUBE_API_KEY ?? "").trim() !== "";
  const ownerLibrary = configured(() => infoAccessClientFromEnv(env));
  const findingsLibrary = findingsLibraryEnabledFromEnv(env.ASKRIGOR_FINDINGS_LIBRARY);
  // The scout and the video reading each refuse without the key, its no-billing declaration or the receipt secret.
  const gemini = (env.ASKRIGOR_GEMINI_API_KEY ?? "").trim() !== "" && geminiKeyDeclaredUnbilled(env) &&
    researchReceiptSecretFromEnv(env) !== undefined;
  return async () => {
    const [aiBudgetLeftNanoUsd, videoSecondsLeft] = gemini
      ? await Promise.all([
        geminiScoutBudgetLeftNanoUsd(env).catch(() => null),
        Promise.resolve().then(() => productionGeminiVideoLedger(env).remaining()).catch(() => null),
      ])
      : [null, null];
    const judge = meaningJudgeFromEnv();
    const planner = researchPlannerFromEnv(judge.enabled ? judge.dailyCapUsd : undefined);
    return {
      redditReader,
      youtube,
      gemini,
      aiBudgetLeftNanoUsd,
      videoSecondsLeft,
      meaningJudge: { on: judge.enabled, dailyCapUsd: judge.enabled ? judge.dailyCapUsd ?? null : null },
      researchPlanner: { on: planner.enabled, dailyCapUsd: planner.enabled ? planner.dailyCapUsd ?? null : null,
        accountDailyCalls: planner.enabled ? planner.accountDailyCalls ?? null : null },
      ownerLibrary,
      sharedAnswers: configured(() => sharedAnswersFromEnv()),
      findingsLibrary,
    };
  };
}
