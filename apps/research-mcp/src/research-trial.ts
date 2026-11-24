import { createHash } from "node:crypto";

import { z } from "zod";

/**
 * Three changes to research, each behind a switch of its own (config.ts) and each tried on the owner's account before a
 * release (24 November 2026): the menu accounts for the plain answer's claims (owner answer 413a, claim-accounting.ts),
 * HRP's core handed over when the plain answer is registered (owner answer 412a, hrp-core.ts), and AskRigor's own plan
 * reaching for evidence one step away (promise P90, research-planner.ts). A switch is off, the default and any other
 * value; trial, for a dev account only while its test window has it on; dev, for every dev account; or on, for every
 * account (the third changes only a plan AskRigor makes itself, which it makes for dev accounts alone).
 *
 * The window is a test round's: the same question asked with the change and without it on one account, in whichever
 * order, with no other account and no setting changed. Like a pause of the planning call (owner answer 395b,
 * research-planner.ts), it is set through manage_research_access, ends by itself, is in this process's memory only, and
 * inspect says nothing of it, so the person's AI is not told of a test. It names its account by digest, never the key,
 * and holds three yes-or-no settings and two times; nothing of a question, and it is neither stored nor logged.
 */
export const RESEARCH_SWITCH_MODES = ["off", "trial", "dev", "on"] as const;
export type ResearchSwitchMode = (typeof RESEARCH_SWITCH_MODES)[number];
export function researchSwitchMode(value: string | undefined): ResearchSwitchMode {
  const mode = value?.trim() ?? "";
  return (RESEARCH_SWITCH_MODES as readonly string[]).includes(mode) ? mode as ResearchSwitchMode : "off";
}

/** Whether a switch holds for an account: its mode, whether it is a dev account, and whether its window has it on. */
export function switchHolds(mode: ResearchSwitchMode, devAccount: boolean, inTrial: boolean): boolean {
  return mode === "on" || (devAccount && (mode === "dev" || (mode === "trial" && inTrial)));
}

/** The switches a window sets, with what each one does, as the window's own result names it. */
export const RESEARCH_TRIAL_SWITCHES = Object.freeze({
  claimAccounting: "the menu's accounting of the quick answer's claims",
  hrpCore: "HRP's core with the registration of the quick answer",
  indirectEvidence: "AskRigor's own plan reaching for evidence one step away",
});
export type ResearchTrialSwitch = keyof typeof RESEARCH_TRIAL_SWITCHES;
export type ResearchSwitchModes = Readonly<Record<ResearchTrialSwitch, ResearchSwitchMode>>;
const SWITCH_NAMES = Object.keys(RESEARCH_TRIAL_SWITCHES) as ResearchTrialSwitch[];
/** One value for each switch, by its name. */
const eachSwitch = <T>(value: (name: ResearchTrialSwitch) => T): Record<ResearchTrialSwitch, T> =>
  Object.fromEntries(SWITCH_NAMES.map((name) => [name, value(name)])) as Record<ResearchTrialSwitch, T>;

/** The longest a window runs, from when it began, however often it is set again. */
export const RESEARCH_TRIAL_MAX_MINUTES = 120;

export const researchTrialInputSchema = z.object({
  claimAccounting: z.boolean(),
  hrpCore: z.boolean(),
  indirectEvidence: z.boolean(),
  minutes: z.number().int().min(0).max(RESEARCH_TRIAL_MAX_MINUTES),
}).strict();
export type ResearchTrialInput = z.output<typeof researchTrialInputSchema>;

/** An account's window while it runs: what it has on, and when it ends (milliseconds since the epoch). */
export type ResearchTrialWindow = Readonly<Record<ResearchTrialSwitch, boolean> & { until: number }>;

export interface ResearchTrialWindows {
  /** Opens or changes an account's window, or ends it with 0 minutes; the window that then runs, if any. */
  set(accountKey: string, input: ResearchTrialInput): ResearchTrialWindow | undefined;
  /** The account's window while it runs. */
  window(accountKey: string): ResearchTrialWindow | undefined;
}

/** One process's windows. Setting one again while it runs keeps its start, so none passes two hours. */
export function createResearchTrialWindows(now: () => number = Date.now): ResearchTrialWindows {
  const windows = new Map<string, ResearchTrialWindow & { started: number }>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const digest = (accountKey: string): string => createHash("sha256").update(accountKey).digest("hex").slice(0, 16);
  const running = (account: string) => {
    const window = windows.get(account);
    return window !== undefined && window.until > now() ? window : undefined;
  };
  const shown = (window: ResearchTrialWindow): ResearchTrialWindow =>
    ({ ...eachSwitch((name) => window[name]), until: window.until });
  return {
    set(accountKey, { minutes, ...settings }) {
      if (!Number.isInteger(minutes) || minutes < 0 || minutes > RESEARCH_TRIAL_MAX_MINUTES) {
        throw new RangeError(`A test window is 0 to ${RESEARCH_TRIAL_MAX_MINUTES} whole minutes.`);
      }
      const account = digest(accountKey);
      const at = now();
      const kept = running(account);
      clearTimeout(timers.get(account));
      timers.delete(account);
      if (minutes === 0) {
        windows.delete(account);
        return undefined;
      }
      const started = kept?.started ?? at;
      const until = Math.min(at + minutes * 60_000, started + RESEARCH_TRIAL_MAX_MINUTES * 60_000);
      const window = { ...eachSwitch((name) => settings[name]), until, started };
      windows.set(account, window);
      // It leaves memory when it ends, also when no later call comes to find it over.
      const forget = setTimeout(() => {
        if (windows.get(account) === window) { windows.delete(account); timers.delete(account); }
      }, Math.max(0, until - at) + 1);
      forget.unref?.();
      timers.set(account, forget);
      return shown(window);
    },
    window(accountKey) {
      const window = running(digest(accountKey));
      return window === undefined ? undefined : shown(window);
    },
  };
}

/** This process's windows: a restart clears them. */
export const researchTrialWindows: ResearchTrialWindows = createResearchTrialWindows();

/** A time as the window's texts give it: hours and minutes, UTC. */
const utcClock = (at: number): string => new Date(at).toISOString().slice(11, 16);

/** Whether the server lets a window decide anything: one of the switches is in mode trial. */
export const trialOffered = (modes: ResearchSwitchModes): boolean =>
  SWITCH_NAMES.some((name) => modes[name] === "trial");

/** What each switch comes to on this dev account now, in plain words: as the window has it, or as the server's setting does. */
function switchWords(modes: ResearchSwitchModes, window: ResearchTrialWindow | undefined): string {
  return SWITCH_NAMES.map((name) => {
    const on = switchHolds(modes[name], true, window?.[name] === true);
    const why = modes[name] === "trial"
      ? window === undefined ? ", with no window" : ""
      : `, by this server's own setting (${modes[name]}), which a window does not change`;
    return `${RESEARCH_TRIAL_SWITCHES[name]} is ${on ? "on" : "off"}${why}`;
  }).join("; ");
}

/** The result of set_research_trial, for the session that runs a test round. */
export function researchTrialText(modes: ResearchSwitchModes, window: ResearchTrialWindow | undefined): string {
  return window === undefined
    ? `No test window runs for this dev account now: ${switchWords(modes, undefined)}.`
    : `Test window for this dev account, for a test round, until ${utcClock(window.until)} UTC ` +
      `(${new Date(window.until).toISOString()}): ${switchWords(modes, window)}. The window ends by itself at that time; ` +
      "0 minutes ends it now, and a restart of AskRigor's server ends it too. Set again while it runs, it keeps its " +
      `start and ends at most ${RESEARCH_TRIAL_MAX_MINUTES} minutes after it. inspect says nothing of it. Each call goes ` +
      "by the window as it is when the call is made, so start each part of the round with inspect and a new registration.";
}

/** What set_research_trial's result carries: what holds on the account now, and until when the window runs. */
export function researchTrialState(modes: ResearchSwitchModes, window: ResearchTrialWindow | undefined) {
  return {
    ...eachSwitch((name) => switchHolds(modes[name], true, window?.[name] === true)),
    until: window === undefined ? null : new Date(window.until).toISOString(),
  };
}

/** Why nothing was changed while no switch is in mode trial. */
export const TRIAL_OFF_NOTHING_CHANGED = "None of AskRigor's three research switches is in trial mode on this server, " +
  "so a test window would change nothing; nothing was changed.";
