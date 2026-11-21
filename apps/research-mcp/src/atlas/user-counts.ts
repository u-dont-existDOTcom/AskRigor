import {
  researchAccountKeyForSubject,
  type ResearchUserCounts,
  type ResearchUserCountsSource,
} from "@askrigor/evidence-repository";
import { devAccountKeysFromEnv, researchContributorAccessConfigFromEnv } from "../config.js";
import { escapeHtml } from "./page-guard.js";
import { html, page, type AtlasPageReader } from "./pages.js";

/**
 * The public user count (the owner's request of 20 Nov 2026): how many AskRigor accounts have research turned on, and
 * how many of them used it in the past 7 days, with the owner's own and test accounts left out. Two numbers, counted
 * once a UTC day as of the day's start (a recount after a restart shows nothing that happened that day) and kept in
 * process memory only; numbers under USER_COUNTS_SHOWN_FROM show as "fewer than 10", so a small count doesn't move when
 * one person signs up or uses AskRigor. The text page is the count's accessible form; the image is what the
 * script-free home page can show.
 */
export const USER_COUNTS_PATH = "/atlas/users";
export const USER_COUNTS_IMAGE_PATH = "/atlas/users.svg";

/** The smallest number shown as it is. */
export const USER_COUNTS_SHOWN_FROM = 10;

/**
 * ASKRIGOR_PUBLIC_USER_COUNTS: `off` (the default; the image is empty and the page is not found), `at-10` (nothing shows
 * until 10 accounts are counted, then as `on`) or `on` (shown now, small numbers as "fewer than 10").
 */
export const PUBLIC_USER_COUNTS_MODES = ["off", "at-10", "on"] as const;
export type PublicUserCountsMode = typeof PUBLIC_USER_COUNTS_MODES[number];

export function publicUserCountsModeFromEnv(value = process.env.ASKRIGOR_PUBLIC_USER_COUNTS): PublicUserCountsMode {
  const setting = value?.trim();
  return PUBLIC_USER_COUNTS_MODES.find((mode) => mode === setting) ?? "off";
}

export type ShownNumber = { exact: number } | { fewerThan: number };

export type UserCountsView =
  | { state: "off" }
  | { state: "unavailable" }
  | { state: "not-yet" }
  | { state: "shown"; accounts: ShownNumber; usedLast7Days: ShownNumber };

export function shownNumber(value: number): ShownNumber {
  return value >= USER_COUNTS_SHOWN_FROM ? { exact: value } : { fewerThan: USER_COUNTS_SHOWN_FROM };
}

/** What the page and the image show for a mode and a count (undefined: the count could not be read). */
export function userCountsView(mode: PublicUserCountsMode, counts: ResearchUserCounts | undefined): UserCountsView {
  if (mode === "off") return { state: "off" };
  if (counts === undefined) return { state: "unavailable" };
  if (mode === "at-10" && counts.accounts < USER_COUNTS_SHOWN_FROM) return { state: "not-yet" };
  return { state: "shown", accounts: shownNumber(counts.accounts), usedLast7Days: shownNumber(counts.usedLast7Days) };
}

/** After a failed read, the next try waits this long, so a database outage costs one query per 5 minutes at most. */
export const USER_COUNTS_RETRY_MS = 5 * 60_000;
/** A read that hasn't answered by then counts as failed, so no request waits on a stalled database for longer. */
export const USER_COUNTS_DEADLINE_MS = 3_000;

/** The source's answer, or a rejection once the deadline passes; a late answer or failure is dropped. */
function withinDeadline<T>(work: Promise<T>, deadlineMs: number): Promise<T> {
  work.catch(() => undefined);
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("USER_COUNTS_DEADLINE")), deadlineMs);
    timer.unref();
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

export interface PublicUserCountsOptions {
  mode: PublicUserCountsMode;
  /** The research-access database's two aggregates; without it, the count is unavailable. */
  source?: ResearchUserCountsSource;
  /** The owner's research account keys, derived from the owner's logins; none, and nothing is counted. */
  ownerAccountKeys: readonly string[];
  /** The dev accounts' 12-character references (ASKRIGOR_DEV_ACCOUNT_KEYS): the owner's test accounts. */
  devAccountReferences: readonly string[];
  now?: () => number;
  deadlineMs?: number;
}

/**
 * The count, read at most once per UTC day (and after each restart), one read at a time, as of the day's start. Its view
 * never names a time, and a recount the same day leaves out what happened that day, so no page tells when within a day
 * anyone signed up or made a call.
 */
export class PublicUserCounts {
  private kept: { day: string; counts: ResearchUserCounts } | undefined;
  private failedAt: number | undefined;
  private loading: Promise<ResearchUserCounts | undefined> | undefined;

  constructor(private readonly options: PublicUserCountsOptions) {}

  get mode(): PublicUserCountsMode {
    return this.options.mode;
  }

  async view(): Promise<UserCountsView> {
    if (this.options.mode === "off") return { state: "off" };
    return userCountsView(this.options.mode, await this.counts());
  }

  private async counts(): Promise<ResearchUserCounts | undefined> {
    const now = this.options.now?.() ?? Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    const startOfDay = new Date(`${day}T00:00:00.000Z`);
    if (this.kept?.day === day) return this.kept.counts;
    const source = this.options.source;
    // Without the owner's own account to leave out, a count would include the owner: none is better than a wrong one.
    if (source === undefined || this.options.ownerAccountKeys.length === 0) return undefined;
    if (this.failedAt !== undefined && now - this.failedAt < USER_COUNTS_RETRY_MS) return undefined;
    this.loading ??= (async () => {
      try {
        const counts = await withinDeadline(source.counts({
          excludedAccountKeys: this.options.ownerAccountKeys,
          excludedReferences: this.options.devAccountReferences,
          at: new Date(now),
          upTo: startOfDay,
        }), this.options.deadlineMs ?? USER_COUNTS_DEADLINE_MS);
        this.kept = { day, counts: { accounts: counts.accounts, usedLast7Days: counts.usedLast7Days } };
        this.failedAt = undefined;
        return this.kept.counts;
      } catch {
        this.failedAt = now;
        return undefined;
      } finally {
        this.loading = undefined;
      }
    })();
    return await this.loading;
  }
}

// A subject as the connector binds one (oauth-resource-server.ts): no white space or control character, at most 512.
const OWNER_SUBJECT = /^[^\s\u0000-\u001f\u007f]{1,512}$/u;

/**
 * The count from the environment: the mode (ASKRIGOR_PUBLIC_USER_COUNTS); the owner's account keys, derived with the
 * research identity secret from the owner's logins (ASKRIGOR_OAUTH_ALLOWED_SUBJECT, the connector's owner, and
 * ASKRIGOR_ATLAS_OWNER_SUBJECT, another login of the owner's); and the dev accounts (ASKRIGOR_DEV_ACCOUNT_KEYS). The
 * source is the server's research-access store, on its pool.
 */
export function publicUserCountsFromEnv(env: NodeJS.ProcessEnv, source: ResearchUserCountsSource | undefined):
  PublicUserCounts {
  const mode = publicUserCountsModeFromEnv(env.ASKRIGOR_PUBLIC_USER_COUNTS);
  if (mode === "off") return new PublicUserCounts({ mode, ownerAccountKeys: [], devAccountReferences: [] });
  let ownerAccountKeys: string[] = [];
  try {
    const access = researchContributorAccessConfigFromEnv(env);
    if (access !== undefined) {
      ownerAccountKeys = [...new Set([env.ASKRIGOR_OAUTH_ALLOWED_SUBJECT, env.ASKRIGOR_ATLAS_OWNER_SUBJECT]
        .flatMap((subject) => {
          if (subject === undefined || !OWNER_SUBJECT.test(subject)) return [];
          try {
            return [researchAccountKeyForSubject(access.identitySecret, subject)];
          } catch {
            return [];
          }
        }))];
    }
  } catch {
    ownerAccountKeys = [];
  }
  return new PublicUserCounts({
    mode,
    ...(source === undefined ? {} : { source }),
    ownerAccountKeys,
    devAccountReferences: [...devAccountKeysFromEnv(env.ASKRIGOR_DEV_ACCOUNT_KEYS)],
  });
}

// Words -------------------------------------------------------------------------------------------------------------

const numberWords = (shown: ShownNumber): string =>
  "exact" in shown ? shown.exact.toLocaleString("en-US") : `fewer than ${shown.fewerThan}`;

/** The count's two lines, as the image and the page both word them. */
export function userCountsLines(view: Extract<UserCountsView, { state: "shown" }>): [string, string][] {
  return [
    ["AskRigor accounts", numberWords(view.accounts)],
    ["Used it in the past 7 days", numberWords(view.usedLast7Days)],
  ];
}

// The image ---------------------------------------------------------------------------------------------------------

/** What the image is when nothing shows: no size, so the home page shows nothing in its place. */
export const EMPTY_USER_COUNTS_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" aria-hidden="true"></svg>\n';

const SVG_FONT = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const SVG_FONT_SIZE = 15;
const SVG_LINE_HEIGHT = 22;
// A system font's average letter is narrower than 0.62 of its size, so the width estimate leaves room rather than cut.
const SVG_LETTER_WIDTH = 0.62;

/**
 * The count as an image for the home page, whose policy allows images from its own origin and no script. Colours are
 * the site's light text colours; the site's stylesheet turns them for dark mode, since an image can't read the page's
 * style. Its words are the page's, numbers only; nothing else is interpolated.
 */
export function renderUserCountsSvg(view: UserCountsView): string {
  if (view.state !== "shown") return EMPTY_USER_COUNTS_SVG;
  const lines = userCountsLines(view);
  const longest = Math.max(...lines.map(([label, value]) => `${label}: ${value}`.length));
  const width = Math.ceil(longest * SVG_FONT_SIZE * SVG_LETTER_WIDTH) + 2;
  const height = lines.length * SVG_LINE_HEIGHT + 4;
  const said = escapeHtml(lines.map(([label, value]) => `${label}: ${value}`).join(". "));
  const rows = lines.map(([label, value], index) =>
    `<text x="0" y="${(index + 1) * SVG_LINE_HEIGHT - 5}"><tspan fill="#52606d">${escapeHtml(label)}: </tspan>` +
    `<tspan fill="#1f2933" font-weight="700">${escapeHtml(value)}</tspan></text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ` +
    `role="img" aria-label="${said}"><title>${said}</title>` +
    `<g font-family="${SVG_FONT}" font-size="${SVG_FONT_SIZE}">${rows}</g></svg>\n`;
}

// The page ----------------------------------------------------------------------------------------------------------

const HOW_COUNTED = html`<h2>How these numbers are counted</h2>
<p>"AskRigor accounts" counts the accounts that signed in to AskRigor and turned research on. It counts accounts, not
people: someone who signs in with two different logins has two. "Used it in the past 7 days" counts those accounts
whose AI app had at least one call answered by AskRigor in the week before the count.</p>
<p>AskRigor's owner's own accounts and test accounts are left out.</p>
<p>The count is made once a day, as of the start of the day (UTC): accounts made and calls answered later that day wait
for the next day's count, even when AskRigor's server restarts and counts again. Numbers under
${USER_COUNTS_SHOWN_FROM} show as "fewer than ${USER_COUNTS_SHOWN_FROM}", so while the count is small it doesn't change
when one person signs up or uses AskRigor.</p>
<p>Nothing about any person is shown or kept for this. The two numbers are counted from AskRigor's account records and
its 7-day call record, and kept only in the server's memory until the next count. The
<a href="https://askrigor.com/privacy">privacy notice</a> says what those records hold.</p>`;

/**
 * The count's text page: the same numbers as the image, and how they are counted. Off, the page is not found; unavailable,
 * the Atlas's own "unavailable" page answers.
 */
export function renderUserCountsPage(view: Extract<UserCountsView, { state: "shown" | "not-yet" }>,
  reader?: AtlasPageReader): string {
  const shown = view.state === "shown" ? html`<dl class="user-counts">
${userCountsLines(view).map(([label, value]) => html`<dt>${label}</dt><dd>${value}</dd>
`)}</dl>`
    : html`<p>AskRigor will show how many people use it here once there are ${USER_COUNTS_SHOWN_FROM} accounts.</p>`;
  return page({
    reader,
    path: USER_COUNTS_PATH,
    title: "How many people use AskRigor | AskRigor Atlas",
    description: "How many AskRigor accounts there are, and how many of them used it in the past 7 days.",
    body: html`<h1>How many people use AskRigor</h1>
${shown}
${HOW_COUNTED}`,
  });
}
