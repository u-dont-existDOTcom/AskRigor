import {
  AtlasParticipationError,
  type AtlasCommentModerationView,
  type AtlasHomePick,
  type AtlasModerationStore,
} from "@askrigor/evidence-repository";
import { z } from "zod";

import { containsCardReference } from "../findings/acceptance-checks.js";
import { contactDetailKinds, hasDirectionControl, linkKinds } from "./contact-check.js";
import { passesPageGuard } from "./page-guard.js";

/**
 * The owner's actions on the Atlas's comments and home page (decision 171, sections 4E and 4F; design
 * docs/superpowers/plans/2026-10-25-171-pages-sign-in-design.md, section E), on review_research_contribution, so the
 * connector keeps its 33 tools: list_comments lists the newest comments, or only those someone reported, with each
 * commenter's tag; hide_comment takes a comment off the pages and keeps it here, show_comment puts it on the pages and
 * clears its reports (dealt with), and remove_comment deletes it with its reports; stop_commenter stops a commenter,
 * named by their tag, from commenting, and
 * restore_commenter lets them comment again; set_picks sets the home page's "most important now" picks (decision 2a),
 * up to five, each with the owner's public reason. The review never sees a participant's key, only the tag derived
 * from it.
 */

export const ATLAS_PARTICIPATION_ACTIONS = [
  "list_comments", "hide_comment", "show_comment", "remove_comment", "stop_commenter", "restore_commenter", "set_picks",
] as const;
export type AtlasParticipationAction = typeof ATLAS_PARTICIPATION_ACTIONS[number];

export const ATLAS_PARTICIPATION_OUTCOMES = ["comments_listed", "comment_moderated", "commenter_changed", "picks_set"] as const;
export type AtlasParticipationOutcome = typeof ATLAS_PARTICIPATION_OUTCOMES[number];
export const ATLAS_PARTICIPATION_ERROR_CODES = ["comment_not_found", "commenter_not_found", "pick_not_published"] as const;

const LIST_PAGE = 20;
const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);

/** The comments listed or moderated, the commenter changed, and the picks set. */
export const atlasParticipationSchema = z.object({
  comments: z.array(z.object({
    comment: z.string().regex(/^C-[1-9][0-9]{3,}$/u),
    publication: z.string().regex(/^P-[1-9][0-9]{3,}$/u),
    commenter: z.string().regex(/^U-[a-f0-9]{12}$/u),
    commenterStopped: z.boolean(),
    displayName: z.string(),
    body: z.string(),
    state: z.enum(["shown", "hidden", "removed"]),
    reports: z.number().int().nonnegative(),
    postedOn: daySchema,
  }).strict()).max(LIST_PAGE),
  nextCursor: z.string().nullable(),
  commenter: z.object({
    commenter: z.string().regex(/^U-[a-f0-9]{12}$/u),
    stopped: z.boolean(),
    comments: z.number().int().nonnegative(),
  }).strict().nullable(),
  picks: z.array(z.object({
    slot: z.number().int().min(1).max(5),
    publication: z.string().regex(/^P-[1-9][0-9]{3,}$/u),
    reason: z.string(),
  }).strict()).max(5).nullable(),
}).strict();
export type AtlasParticipation = z.infer<typeof atlasParticipationSchema>;

export interface AtlasParticipationRequest {
  action: AtlasParticipationAction;
  comment?: string;
  commenter?: string;
  reported?: boolean;
  cursor?: string;
  picks?: Array<{ publication: string; reason: string }>;
}

export interface AtlasParticipationResult {
  ok: boolean;
  text: string;
  outcome?: AtlasParticipationOutcome;
  error?: { code: typeof ATLAS_PARTICIPATION_ERROR_CODES[number] | "invalid_request"; message: string };
  participation?: AtlasParticipation;
}

const clip = (text: string, length: number) => text.length <= length ? text : `${text.slice(0, length - 1).trimEnd()}…`;
const encodeCursor = (commentNumber: number) => `c${commentNumber}`;
const decodeCursor = (cursor: string) => {
  const match = /^c([1-9][0-9]{3,15})$/u.exec(cursor);
  return match === null ? null : Number(match[1]);
};

function itemOf(comment: AtlasCommentModerationView): AtlasParticipation["comments"][number] {
  return {
    comment: comment.publicId,
    publication: comment.publicationNumber,
    commenter: comment.commenterTag,
    commenterStopped: comment.commenterStopped,
    displayName: comment.displayName,
    body: clip(comment.body, 600),
    state: comment.state,
    reports: comment.reportCount,
    postedOn: comment.postedAt.slice(0, 10),
  };
}

const STATE_WORDS = { shown: "shown", hidden: "hidden from the pages", removed: "removed" } as const;

function commentLine(comment: AtlasCommentModerationView): string {
  return `${comment.publicId} on ${comment.publicationNumber}, by ${comment.displayName} (${comment.commenterTag}` +
    `${comment.commenterStopped ? ", stopped" : ""}), ${STATE_WORDS[comment.state]}, ${comment.reportCount} ` +
    `report${comment.reportCount === 1 ? "" : "s"}, ${comment.postedAt.slice(0, 10)}: ${clip(comment.body, 200)}`;
}

const empty = (): AtlasParticipation => ({ comments: [], nextCursor: null, commenter: null, picks: null });
const picksOf = (picks: readonly AtlasHomePick[]) =>
  picks.map(({ slot, publicationNumber, reason }) => ({ slot, publication: publicationNumber, reason }));

export class AtlasParticipationReview {
  constructor(private readonly deps: { moderation: AtlasModerationStore; now: () => Date }) {}

  async run(request: AtlasParticipationRequest): Promise<AtlasParticipationResult> {
    try {
      switch (request.action) {
        case "list_comments": return await this.list(request);
        case "hide_comment":
        case "show_comment":
        case "remove_comment":
          return await this.moderate(request.action, request.comment!.toUpperCase());
        case "stop_commenter":
        case "restore_commenter":
          return await this.commenter(request.action === "stop_commenter", `U-${request.commenter!.slice(2).toLowerCase()}`);
        case "set_picks": return await this.picks(request.picks!);
      }
    } catch (error) {
      if (error instanceof AtlasParticipationError && error.code === "PICK_NOT_PUBLISHED") {
        const message = "A pick names a publication that is not on the Atlas pages (held, rejected or withdrawn); nothing " +
          "was changed.";
        return { ok: false, error: { code: "pick_not_published", message }, text: message };
      }
      if (error instanceof AtlasParticipationError) {
        const message = "The request is not valid for the comments store; nothing was changed.";
        return { ok: false, error: { code: "invalid_request", message }, text: message };
      }
      throw error;
    }
  }

  private async list(request: AtlasParticipationRequest): Promise<AtlasParticipationResult> {
    const before = request.cursor === undefined ? undefined : decodeCursor(request.cursor);
    if (before === null) {
      const message = "The cursor is not one list_comments returned.";
      return { ok: false, error: { code: "invalid_request", message }, text: message };
    }
    const reportedOnly = request.reported === true;
    const rows = await this.deps.moderation.inspectComments({
      reportedOnly, limit: LIST_PAGE + 1, ...(before === undefined ? {} : { before }),
    });
    const shown = rows.slice(0, LIST_PAGE);
    const nextCursor = rows.length > LIST_PAGE ? encodeCursor(Number(shown.at(-1)!.publicId.slice(2))) : null;
    const scope = reportedOnly ? " reported" : "";
    return {
      ok: true,
      outcome: "comments_listed",
      participation: { ...empty(), comments: shown.map(itemOf), nextCursor },
      text: [
        ...(shown.length === 0 ? [`No${scope} comment${before === undefined ? "" : " on this page"}.`] : shown.map(commentLine)),
        ...(nextCursor === null ? [] : ["More comments: call list_comments with the nextCursor."]),
      ].join("\n"),
    };
  }

  private async moderate(action: "hide_comment" | "show_comment" | "remove_comment", publicId: string):
    Promise<AtlasParticipationResult> {
    const moderation = action === "hide_comment" ? "hide" : action === "show_comment" ? "show" : "remove";
    const comment = await this.deps.moderation.moderateComment(publicId, moderation, this.deps.now().toISOString());
    if (comment === null) {
      const message = `No comment has the id ${publicId}; it may have been deleted by its author or removed.`;
      return { ok: false, error: { code: "comment_not_found", message }, text: message };
    }
    const text = moderation === "hide"
      ? `${publicId} is hidden: it leaves the Atlas pages and stays in list_comments; show_comment puts it back.`
      : moderation === "show" ? `${publicId} shows on the Atlas pages, and its reports are cleared.`
        : `Removed ${publicId}: it is deleted, with its reports.`;
    return { ok: true, outcome: "comment_moderated", participation: { ...empty(), comments: [itemOf(comment)] }, text };
  }

  private async commenter(stop: boolean, commenterTag: string): Promise<AtlasParticipationResult> {
    const changed = await this.deps.moderation.setCommenterStopped(commenterTag, stop, this.deps.now().toISOString());
    if (changed === null) {
      const message = `No commenter has the tag ${commenterTag}; list_comments shows each comment's commenter.`;
      return { ok: false, error: { code: "commenter_not_found", message }, text: message };
    }
    return {
      ok: true,
      outcome: "commenter_changed",
      participation: { ...empty(), commenter: { commenter: changed.commenterTag, stopped: changed.stopped,
        comments: changed.comments } },
      text: stop
        ? `${commenterTag} can no longer comment in the Atlas; their ${changed.comments} comment` +
          `${changed.comments === 1 ? "" : "s"} stay as they are (hide or remove them one by one).`
        : `${commenterTag} can comment in the Atlas again.`,
    };
  }

  private async picks(requested: ReadonlyArray<{ publication: string; reason: string }>): Promise<AtlasParticipationResult> {
    const picks = requested.map(({ publication, reason }) => ({ publicationNumber: publication.toUpperCase(), reason }));
    // The reasons show on the home page: the comments' check applies to them too, and so does the pages' last check.
    const unfit = picks.find(({ reason }) => contactDetailKinds(reason).length > 0 || linkKinds(reason).length > 0 ||
      containsCardReference(reason) || !passesPageGuard(reason) || hasDirectionControl(reason));
    if (unfit !== undefined) {
      const message = `The reason for ${unfit.publicationNumber} holds contact details, a link, a YouTube address, a ` +
        "findings card's number or a text-direction control, which the pages never show; nothing was changed.";
      return { ok: false, error: { code: "invalid_request", message }, text: message };
    }
    if (new Set(picks.map(({ publicationNumber }) => publicationNumber)).size !== picks.length) {
      const message = "Each publication can be picked once; nothing was changed.";
      return { ok: false, error: { code: "invalid_request", message }, text: message };
    }
    const set = await this.deps.moderation.setHomePicks(picks, this.deps.now().toISOString());
    return {
      ok: true,
      outcome: "picks_set",
      participation: { ...empty(), picks: picksOf(set) },
      text: set.length === 0 ? "The home page's picks are cleared: the lane shows nothing."
        : `The home page's picks are now: ${set.map(({ slot, publicationNumber, reason }) =>
          `${slot}. ${publicationNumber} (${clip(reason, 80)})`).join("; ")}. A pick shows while its finding is on the ` +
          "pages.",
    };
  }
}
