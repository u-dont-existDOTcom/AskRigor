import { createHash } from "node:crypto";

import {
  PUBLIC_DOSSIER_NUMBER,
  RESEARCH_DOSSIER_LIVING_PERSON_STATEMENTS,
  RESEARCH_DOSSIER_PUBLIC_STATES,
  type ResearchDossierLivingPersonStatement,
  type ResearchDossierPublicDecision,
  type ResearchDossierPublicState,
  type ResearchDossierPublicationReviewStore,
  type ResearchDossierPublicationRow,
} from "@askrigor/evidence-repository";
import { z } from "zod";

import { dossierPagePath, holdReasonWords } from "../findings/dossier-publication.js";

/**
 * AskRigor#477, stage 2 (owner answer 332a, 16 November 2026): the research dossiers' public copies, as runtime actions
 * of review_research_contribution (owner answer 189a). list_dossiers lists them, held ones (the check's queue) by
 * default; inspect_dossier shows every copy of one with its public content, its hold reasons, the dossiers it conflicts
 * with and where its research ran (the plugin, ChatGPT or the runner, 332a); show_dossier shows a held or taken-down
 * copy; hold_dossier sends a shown one back for the check; take_down_dossier takes one off the pages; accept_dossier
 * marks one checked by supervisors (its page then goes to search engines). The owner, or AskRigor's check of held
 * copies through the owner's login, decides. No action names or shows the account.
 *
 * A copy held because a claim names a living person is refused by show_dossier and accept_dossier: the owner's rule is
 * that such claims are published only on his explicit decision, so show_dossier_naming_living_person, with his typed
 * reason, alone shows it, and records who decided (the reviewer login's digest) and when (Codex's review of stage 2,
 * finding 2). revise_dossier_importance changes one finding's importance mark the only way it changes: a new version of
 * the copy with the reviewer and his reason recorded, the old version kept as it was (finding 7).
 *
 * "Didn't say" is not "no" (Codex's re-review of stage 2, P0): a copy whose researching AI did not say whether a claim
 * names a living person is refused by show_dossier and accept_dossier until the owner states it himself with
 * state_dossier_living_person, recorded once with who and when: names_no_living_person, after which the ordinary show
 * works, or names_a_living_person, after which only show_dossier_naming_living_person can show it.
 */

export const ATLAS_DOSSIER_ACTIONS = [
  "list_dossiers", "inspect_dossier", "show_dossier", "hold_dossier", "take_down_dossier", "accept_dossier",
  "show_dossier_naming_living_person", "revise_dossier_importance", "state_dossier_living_person",
] as const;
export type AtlasDossierAction = typeof ATLAS_DOSSIER_ACTIONS[number];
export const ATLAS_DOSSIER_OUTCOMES = ["dossiers_listed", "dossier_inspected", "dossier_decided"] as const;
export type AtlasDossierOutcome = typeof ATLAS_DOSSIER_OUTCOMES[number];

/** later_inputs on the dossier actions. */
export const dossierNumberInputSchema = z.string().trim().toUpperCase().regex(PUBLIC_DOSSIER_NUMBER);
export const dossierVersionInputSchema = z.number().int().min(1);
export const dossierStateInputSchema = z.enum(RESEARCH_DOSSIER_PUBLIC_STATES);
export const dossierFindingInputSchema = z.string().trim().regex(/^[a-z][a-z0-9_-]{0,31}$/u);
export const dossierImportanceInputSchema = z.enum(["decision_changing", "important", "context"]);
export const dossierLivingPersonInputSchema = z.enum(RESEARCH_DOSSIER_LIVING_PERSON_STATEMENTS);

const IMPORTANCE_WORDS: Readonly<Record<string, string>> = {
  decision_changing: "could change a decision", important: "important", context: "background",
};

const DECISIONS: Readonly<Record<Exclude<AtlasDossierAction, "list_dossiers" | "inspect_dossier" |
  "show_dossier_naming_living_person" | "revise_dossier_importance" | "state_dossier_living_person">,
  ResearchDossierPublicDecision>> = {
  show_dossier: "show", hold_dossier: "hold", take_down_dossier: "take_down", accept_dossier: "accept",
};
const LIST_LIMIT = 50;

const SURFACE_WORDS: Readonly<Record<string, string>> = {
  "/mcp": "the ChatGPT app or another client on /mcp",
  "/mcp/claude": "the Claude plugin",
  "/mcp/gemini": "Gemini",
};

/** The owner's statement on a copy whose AI did not say, in words. */
const STATEMENT_WORDS: Readonly<Record<ResearchDossierLivingPersonStatement, string>> = {
  names_no_living_person: "no claim in it names a living person",
  names_a_living_person: "a claim in it names a living person",
};

/**
 * Who decided on a named living person, stated whether a claim names one, or revised an importance mark: the reviewer
 * login as 16 hex characters of a domain-separated SHA-256, never the login.
 */
export function livingPersonDecider(reviewer: string,
  purpose: "living_person" | "importance" | "living_person_statement" = "living_person"): string {
  const domain = purpose === "living_person" ? "askrigor:dossier-living-person-decision:v1\0"
    : purpose === "living_person_statement" ? "askrigor:dossier-living-person-statement:v1\0"
      : "askrigor:dossier-importance-revision:v1\0";
  return `reviewer:${createHash("sha256").update(domain, "utf8").update(reviewer, "utf8").digest("hex").slice(0, 16)}`;
}

/** Where a copy's research ran, in words: the connector surface, the runner's declaration, who made the readings. */
export function originWords(origin: Record<string, unknown>): string {
  if (Object.keys(origin).length === 0) return "not kept (its contributor's access ended or its research was deleted)";
  const surface = SURFACE_WORDS[String(origin.surface)] ?? "an unknown surface";
  const runner = origin.run === "runner" ? "declared as AskRigor's research runner, through " : "a chat through ";
  return `${runner}${surface}${origin.readings === "caller" ? ", with the final check's AI readings made by the caller"
    : ""}`;
}

export const atlasDossiersSchema = z.object({
  items: z.array(z.object({
    dossier: z.string(),
    version: z.number().int(),
    privateNumber: z.string().nullable().describe("The private ARD number, for the owner only; null once its " +
      "contributor's access ended with an accepted copy, which then keeps no link to the account."),
    state: z.enum(RESEARCH_DOSSIER_PUBLIC_STATES),
    topicKey: z.string().nullable(),
    question: z.string().nullable(),
    holdReasons: z.array(z.string()),
    conflictsWith: z.array(z.string()),
    origin: z.string(),
    privacyRead: z.boolean(),
    namesLivingPerson: z.boolean().nullable().describe("Whether a claim names a living person, as the researching AI " +
      "declared it; null when it did not say, which only the owner's own statement resolves."),
    livingPersonStatement: z.object({ statement: z.enum(RESEARCH_DOSSIER_LIVING_PERSON_STATEMENTS), by: z.string(),
      on: z.string() }).strict().nullable().describe("The owner's statement, for a copy whose researching AI did not " +
      "say, of whether a claim names a living person: what, the reviewer login's digest and the day."),
    livingPersonDecision: z.object({ by: z.string(), on: z.string(), reason: z.string() }).strict().nullable()
      .describe("The owner's decision to show a copy whose claim names a living person: the reviewer login's digest, " +
        "the day and the reason typed."),
    revision: z.object({ of: z.number().int(), by: z.string(), reason: z.string().nullable() }).strict().nullable()
      .describe("A reviewed revision of an importance mark: the version it revises, the reviewer login's digest and the " +
        "reason typed."),
    accepted: z.boolean(),
    decidedOn: z.string(),
    page: z.string().nullable(),
    content: z.record(z.string(), z.unknown()).nullable().optional(),
  }).strict()),
}).strict();
export type AtlasDossiers = z.infer<typeof atlasDossiersSchema>;

export interface AtlasDossierRequest {
  action: AtlasDossierAction;
  dossier?: string;
  dossierVersion?: number;
  dossierState?: ResearchDossierPublicState;
  reason?: string;
  /** The reviewer login that made the call, set by the tool after its owner check; never an input. */
  reviewer?: string;
  /** revise_dossier_importance: the finding's id, and the mark it gets. */
  dossierFinding?: string;
  dossierImportance?: "decision_changing" | "important" | "context";
  /** state_dossier_living_person: the owner's own statement. */
  dossierLivingPerson?: ResearchDossierLivingPersonStatement;
}

export interface AtlasDossierResult {
  ok: boolean;
  text: string;
  outcome?: AtlasDossierOutcome;
  error?: { code: "invalid_request"; message: string };
  dossiers?: AtlasDossiers;
}

const refused = (text: string): AtlasDossierResult => ({ ok: false, text, error: { code: "invalid_request", message: text } });

function itemOf(row: ResearchDossierPublicationRow, content?: Record<string, unknown> | null): AtlasDossiers["items"][number] {
  return {
    dossier: row.publicNumber,
    version: row.versionNumber,
    privateNumber: row.dossierNumber,
    state: row.state,
    topicKey: row.topicKey,
    question: row.question,
    holdReasons: row.holdReasons,
    conflictsWith: row.conflictsWith,
    origin: originWords(row.origin),
    privacyRead: row.privacyRead,
    namesLivingPerson: row.namesLivingPerson,
    livingPersonStatement: row.livingPersonStatement === null ? null : { statement: row.livingPersonStatement.statement,
      by: row.livingPersonStatement.by, on: row.livingPersonStatement.at.slice(0, 10) },
    livingPersonDecision: row.livingPersonDecision === null ? null : { by: row.livingPersonDecision.by,
      on: row.livingPersonDecision.at.slice(0, 10), reason: row.livingPersonDecision.reason },
    revision: row.revision === null ? null : { ...row.revision },
    accepted: row.accepted,
    decidedOn: row.decidedAt.slice(0, 10),
    page: row.state === "shown" ? dossierPagePath(row.publicNumber) : null,
    ...(content === undefined ? {} : { content }),
  };
}

const lineOf = (row: ResearchDossierPublicationRow) => `${row.publicNumber} version ${row.versionNumber}` +
  `${row.dossierNumber === null ? "" : ` (${row.dossierNumber})`}, ${row.state}${row.accepted ? ", checked by supervisors"
    : ""}${row.topicKey === null ? ""
    : `, topic ${row.topicKey}`}${row.holdReasons.length === 0 ? "" : `, held for: ${holdReasonWords(row.holdReasons)}`}${
    row.livingPersonStatement === null ? "" : `; you stated on ${row.livingPersonStatement.at.slice(0, 10)} that ${
      STATEMENT_WORDS[row.livingPersonStatement.statement]}`}${
    row.conflictsWith.length === 0 ? "" : `, conflicts with ${row.conflictsWith.join(", ")}`}; ${
    Object.keys(row.origin).length === 0 ? `where its research ran is ${originWords(row.origin)}`
      : `researched in ${originWords(row.origin)}`}`;

export class AtlasDossierReview {
  constructor(private readonly deps: { store: ResearchDossierPublicationReviewStore; now: () => Date }) {}

  async run(request: AtlasDossierRequest): Promise<AtlasDossierResult> {
    if (request.action === "list_dossiers") {
      if (request.dossier !== undefined || request.dossierVersion !== undefined || request.reason !== undefined) {
        return refused("list_dossiers takes only later_inputs.dossierState.");
      }
      const state = request.dossierState ?? "held";
      const rows = await this.deps.store.list(state, LIST_LIMIT);
      return {
        ok: true,
        outcome: "dossiers_listed",
        text: rows.length === 0 ? `No research dossier is ${state.replace("_", " ")}.`
          : `${rows.length} research dossier cop${rows.length === 1 ? "y" : "ies"} ${state.replace("_", " ")}` +
            `${rows.length === LIST_LIMIT ? " (the newest 50)" : ""}: ${rows.map(lineOf).join("; ")}.`,
        dossiers: { items: rows.map((row) => itemOf(row)) },
      };
    }
    if (request.dossier === undefined) return refused(`${request.action} needs later_inputs.dossier, such as D-1001.`);
    if (request.dossierState !== undefined) return refused(`${request.action} does not take dossierState.`);
    const copies = await this.deps.store.inspect(request.dossier);
    if (copies.length === 0) return refused(`No research dossier ${request.dossier} exists; nothing was changed.`);
    if (request.action === "inspect_dossier") {
      if (request.dossierVersion !== undefined || request.reason !== undefined) {
        return refused("inspect_dossier takes only later_inputs.dossier.");
      }
      return {
        ok: true,
        outcome: "dossier_inspected",
        text: `${request.dossier}: ${copies.map(lineOf).join("; ")}. Its public content is in dossiers.items[].content.`,
        dossiers: { items: copies.map((copy) => itemOf(copy, copy.payload)) },
      };
    }
    if (request.action === "show_dossier_naming_living_person") return await this.livingPerson(request, copies);
    if (request.action === "revise_dossier_importance") return await this.reviseImportance(request, copies);
    if (request.action === "state_dossier_living_person") return await this.stateLivingPerson(request, copies);
    if (request.dossierFinding !== undefined || request.dossierImportance !== undefined ||
      request.dossierLivingPerson !== undefined) {
      return refused(`${request.action} does not take dossierFinding, dossierImportance or dossierLivingPerson.`);
    }
    const decision = DECISIONS[request.action];
    const reason = request.reason?.trim();
    if ((decision === "hold" || decision === "take_down") && (reason === undefined || reason.length === 0)) {
      return refused(`${request.action} needs reason: why, kept privately, such as "the check found a misread figure".`);
    }
    if (reason !== undefined && reason.length > 200) return refused("reason is at most 200 characters here.");
    const version = request.dossierVersion ?? Math.max(...copies.map(({ versionNumber }) => versionNumber));
    const target = copies.find(({ versionNumber }) => versionNumber === version);
    // A named living person, by the AI's declaration or the owner's statement: only his separate decision shows it.
    if ((decision === "show" || decision === "accept") && target !== undefined && target.livingPersonDecision === null &&
      (target.namesLivingPerson === true || target.livingPersonStatement?.statement === "names_a_living_person")) {
      return refused(`${request.dossier} version ${version} can't be shown by ${request.action}: a claim in it names a ` +
        `living person${target.namesLivingPerson === true ? "" : ", as you stated"}. Only your own decision can show ` +
        "it: show_dossier_naming_living_person, with your reason. Nothing was changed.");
    }
    // "Didn't say" is not "no": the owner states it himself first.
    if ((decision === "show" || decision === "accept") && target !== undefined && target.livingPersonDecision === null &&
      target.namesLivingPerson === null && target.livingPersonStatement === null) {
      return refused(`${request.dossier} version ${version} can't be shown by ${request.action}: its researching AI ` +
        "did not say whether a claim names a living person. State it yourself first: state_dossier_living_person, " +
        "with later_inputs.dossierLivingPerson names_no_living_person or names_a_living_person. Nothing was changed.");
    }
    const decided = await this.deps.store.decide({ publicNumber: request.dossier, versionNumber: version, decision,
      reason: reason === undefined || reason.length === 0 ? null : reason, at: this.deps.now() });
    if (decided.outcome === "not_found") return refused(`${request.dossier} has no version ${version}; nothing was changed.`);
    if (decided.outcome === "not_decidable") {
      return refused(`${request.dossier} version ${version} is ${decided.state}${decided.accepted ? " and accepted" : ""}, ` +
        `so ${request.action} can't apply to it (a copy that isn't its dossier's newest, whose research was ` +
        "withdrawn, rejected or deleted, or that no privacy reading has passed can't be shown or accepted; only an " +
        "unaccepted shown copy can be held); nothing was changed.");
    }
    const after = (await this.deps.store.inspect(request.dossier)).find(({ versionNumber }) => versionNumber === version);
    return {
      ok: true,
      outcome: "dossier_decided",
      text: `${request.dossier} version ${version} is now ${decided.state}${decided.accepted ? ", checked by supervisors"
        : ""}${decided.state === "shown" ? `, at ${dossierPagePath(request.dossier)}` : ", off the pages"}.`,
      ...(after === undefined ? {} : { dossiers: { items: [itemOf(after)] } }),
    };
  }

  /** A reviewed revision of one importance mark: a new version, never an edit in place. */
  private async reviseImportance(request: AtlasDossierRequest, copies: readonly ResearchDossierPublicationRow[]):
    Promise<AtlasDossierResult> {
    const dossier = request.dossier!;
    const reason = request.reason?.trim();
    if (request.dossierFinding === undefined || request.dossierImportance === undefined) {
      return refused("revise_dossier_importance needs later_inputs.dossierFinding, the finding's id such as f3, and " +
        "later_inputs.dossierImportance: decision_changing, important or context. Nothing was changed.");
    }
    if (reason === undefined || reason.length === 0) {
      return refused("revise_dossier_importance needs reason: why the mark changes, kept with the new version. " +
        "Nothing was changed.");
    }
    if (reason.length > 200) return refused("reason is at most 200 characters here.");
    if (request.reviewer === undefined || request.reviewer === "") {
      return refused("revise_dossier_importance needs the reviewer login that revises it; nothing was changed.");
    }
    const version = request.dossierVersion ?? Math.max(...copies.map(({ versionNumber }) => versionNumber));
    const revised = await this.deps.store.reviseImportance({ publicNumber: dossier, versionNumber: version,
      findingId: request.dossierFinding, importance: request.dossierImportance, reason,
      revisedBy: livingPersonDecider(request.reviewer, "importance"), at: this.deps.now() });
    if (revised.outcome === "not_found") return refused(`${dossier} has no version ${version}; nothing was changed.`);
    if (revised.outcome === "not_revisable") {
      return refused(revised.previous === null
        ? `${dossier} version ${version} has no finding ${request.dossierFinding}; nothing was changed.`
        : revised.previous === request.dossierImportance
          ? `${dossier} version ${version} already marks ${request.dossierFinding} as ${
            IMPORTANCE_WORDS[revised.previous]}; nothing was changed.`
          : `${dossier} version ${version} is ${revised.state}, so its marks can't be revised (only the newest copy, ` +
            "shown or held); nothing was changed.");
    }
    const after = (await this.deps.store.inspect(dossier)).find(({ versionNumber }) => versionNumber === revised.versionNumber);
    return {
      ok: true,
      outcome: "dossier_decided",
      text: `${dossier} version ${revised.versionNumber} now marks finding ${request.dossierFinding} as ${
        IMPORTANCE_WORDS[request.dossierImportance]} (it was ${IMPORTANCE_WORDS[revised.previous] ?? revised.previous}), ` +
        `on your review; version ${version} is kept as it was.`,
      ...(after === undefined ? {} : { dossiers: { items: [itemOf(after)] } }),
    };
  }

  /**
   * The owner's own statement on a copy whose researching AI did not say whether a claim names a living person,
   * recorded once with who made it and when; it shows nothing itself.
   */
  private async stateLivingPerson(request: AtlasDossierRequest, copies: readonly ResearchDossierPublicationRow[]):
    Promise<AtlasDossierResult> {
    const dossier = request.dossier!;
    if (request.dossierFinding !== undefined || request.dossierImportance !== undefined || request.reason !== undefined) {
      return refused("state_dossier_living_person takes only later_inputs.dossier, dossierVersion and " +
        "dossierLivingPerson. Nothing was changed.");
    }
    if (request.dossierLivingPerson === undefined) {
      return refused("state_dossier_living_person needs later_inputs.dossierLivingPerson, your own statement: " +
        "names_no_living_person or names_a_living_person. Nothing was changed.");
    }
    if (request.reviewer === undefined || request.reviewer === "") {
      return refused("state_dossier_living_person needs the reviewer login that states it; nothing was changed.");
    }
    const version = request.dossierVersion ?? Math.max(...copies.map(({ versionNumber }) => versionNumber));
    const stated = await this.deps.store.stateLivingPerson({ publicNumber: dossier, versionNumber: version,
      statement: request.dossierLivingPerson, statedBy: livingPersonDecider(request.reviewer, "living_person_statement"),
      at: this.deps.now() });
    if (stated.outcome === "not_found") return refused(`${dossier} has no version ${version}; nothing was changed.`);
    if (stated.outcome === "not_decidable") {
      return refused(`${dossier} version ${version} is ${stated.state.replace("_", " ")}, so state_dossier_living_person ` +
        "can't apply to it (only the newest copy, held or taken down, whose researching AI did not say whether a claim " +
        "names a living person and that has no statement yet); nothing was changed.");
    }
    const after = (await this.deps.store.inspect(dossier)).find(({ versionNumber }) => versionNumber === version);
    return {
      ok: true,
      outcome: "dossier_decided",
      text: `${dossier} version ${version}: your statement that ${STATEMENT_WORDS[request.dossierLivingPerson]} is ` +
        `recorded, with who made it and when. It is still ${stated.state.replace("_", " ")}; ${
          request.dossierLivingPerson === "names_no_living_person"
            ? "that question no longer keeps show_dossier or accept_dossier from showing it."
            : "only show_dossier_naming_living_person, with your reason, can show it."}`,
      ...(after === undefined ? {} : { dossiers: { items: [itemOf(after)] } }),
    };
  }

  /** The owner's own decision to show a copy whose claim names a living person: his typed reason, and who he is. */
  private async livingPerson(request: AtlasDossierRequest, copies: readonly ResearchDossierPublicationRow[]):
    Promise<AtlasDossierResult> {
    const dossier = request.dossier!;
    const reason = request.reason?.trim();
    if (reason === undefined || reason.length === 0) {
      return refused("show_dossier_naming_living_person needs reason: why this claim about a named living person may " +
        "be published, kept privately with your decision. Nothing was changed.");
    }
    if (reason.length > 200) return refused("reason is at most 200 characters here.");
    if (request.reviewer === undefined || request.reviewer === "") {
      return refused("show_dossier_naming_living_person needs the reviewer login that decides; nothing was changed.");
    }
    const version = request.dossierVersion ?? Math.max(...copies.map(({ versionNumber }) => versionNumber));
    const decided = await this.deps.store.decideLivingPerson({ publicNumber: dossier, versionNumber: version, reason,
      decidedBy: livingPersonDecider(request.reviewer), at: this.deps.now() });
    if (decided.outcome === "not_found") return refused(`${dossier} has no version ${version}; nothing was changed.`);
    if (decided.outcome === "not_decidable") {
      return refused(`${dossier} version ${version} is ${decided.state}${decided.accepted ? " and accepted" : ""}, so ` +
        "show_dossier_naming_living_person can't apply to it (only the newest copy, held or taken down, whose claim " +
        "names a living person by its AI's declaration or your statement and not yet decided, whose research was not withdrawn, rejected or deleted and that a " +
        "privacy reading has passed); nothing was changed.");
    }
    const after = (await this.deps.store.inspect(dossier)).find(({ versionNumber }) => versionNumber === version);
    return {
      ok: true,
      outcome: "dossier_decided",
      text: `${dossier} version ${version} is now shown, at ${dossierPagePath(dossier)}, on your decision that its ` +
        "claim about a named living person may be published.",
      ...(after === undefined ? {} : { dossiers: { items: [itemOf(after)] } }),
    };
  }
}
