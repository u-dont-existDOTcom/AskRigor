/**
 * Atlas Release B (Fable's recheck, the default for where the owner's notices go): the notices stay in the private
 * table, each written in the transaction of what it reports, until the owner acknowledges it. These two runtime actions
 * of review_research_contribution, under the owner's login, are how they reach him: list_person_notices lists the open
 * ones, legal letters and data requests first, and ack_person_notice records his acknowledgement of one, so the daily
 * scheduled check can put each in his Inbox and close it when he answers. A notice holds a kind, a subject, a dispute's
 * number and a class only: never a dispute's words, link, email address, names or sentence.
 */
import { z } from "zod";

import type { AtlasPersonClaimStore, AtlasPersonNotice } from "@askrigor/evidence-repository";

export const ATLAS_PERSON_NOTICE_ACTIONS = ["list_person_notices", "ack_person_notice"] as const;
export type AtlasPersonNoticeAction = typeof ATLAS_PERSON_NOTICE_ACTIONS[number];
export const ATLAS_PERSON_NOTICE_OUTCOMES = ["person_notices_listed", "person_notice_acknowledged"] as const;
export type AtlasPersonNoticeOutcome = typeof ATLAS_PERSON_NOTICE_OUTCOMES[number];

/** The most open notices one listing gives. */
export const PERSON_NOTICES_LISTED = 100;

export const personNoticeNumberSchema = z.number().int().positive().max(2_147_483_647);

const NOTICE_KINDS = ["legal", "dispute", "refusal", "parked", "recheck"] as const;

export const atlasPersonNoticesSchema = z.object({
  open: z.array(z.object({
    notice: z.number().int(),
    kind: z.enum(NOTICE_KINDS),
    /** A legal letter or a data request: flag it in the Inbox. */
    legal: z.boolean(),
    subjectKind: z.string(),
    subject: z.string(),
    dispute: z.number().int().nullable(),
    detail: z.string().nullable(),
    createdAt: z.string(),
  }).strict()).optional(),
  acknowledged: z.object({ notice: z.number().int(), done: z.boolean() }).strict().optional(),
}).strict();
export type AtlasPersonNotices = z.infer<typeof atlasPersonNoticesSchema>;

export type AtlasPersonNoticeStore = Pick<AtlasPersonClaimStore, "listNotices" | "recordNotice">;

export interface AtlasPersonNoticeRequest { action: AtlasPersonNoticeAction; personNotice?: number }

export interface AtlasPersonNoticeResult {
  ok: boolean;
  text: string;
  outcome?: AtlasPersonNoticeOutcome;
  error?: { code: "invalid_request"; message: string };
  personNotices?: AtlasPersonNotices;
}

const KIND_WORDS: Readonly<Record<AtlasPersonNotice["kind"], string>> = {
  legal: "a legal letter or a request about personal data",
  dispute: "a dispute of a claim about a named person",
  refusal: "the reading refused a finding",
  parked: "a finding's reading was parked after three failures, so it is not shown",
  recheck: "a claim was taken off or disputed on a finding the owner checked",
};

export const PERSON_NOTICE_HOW = "For the owner's Inbox: one item per open notice, with its kind, the finding's number " +
  "and the dispute's number, a legal one flagged. When he has answered an item, call ack_person_notice with " +
  "later_inputs.personNotice set to its notice number. A notice holds no dispute's words; the dispute itself is in " +
  "the queue (person-claims-admin.js queue).";

export class AtlasPersonNoticeReview {
  private readonly now: () => Date;

  constructor(private readonly deps: { store: AtlasPersonNoticeStore; now?: () => Date }) {
    this.now = deps.now ?? (() => new Date());
  }

  async run(request: AtlasPersonNoticeRequest): Promise<AtlasPersonNoticeResult> {
    if (request.action === "list_person_notices") {
      const open = (await this.deps.store.listNotices(PERSON_NOTICES_LISTED)).map((notice) => ({
        notice: notice.noticeNumber, kind: notice.kind, legal: notice.kind === "legal", subjectKind: notice.subjectKind,
        subject: notice.publicationNumber, dispute: notice.disputeNumber, detail: notice.detail, createdAt: notice.createdAt,
      }));
      const lines = open.map((notice) => `notice ${notice.notice}${notice.legal ? " (LEGAL)" : ""}: ${KIND_WORDS[notice.kind]}, ` +
        `on ${notice.subject}${notice.dispute === null ? "" : `, dispute ${notice.dispute}`}, ${notice.createdAt.slice(0, 10)}`);
      return { ok: true, outcome: "person_notices_listed", personNotices: { open },
        text: open.length === 0 ? "No open notices for AskRigor's owner on claims about named people."
          : `${open.length} open notice${open.length === 1 ? "" : "s"} for AskRigor's owner, legal ones first: ` +
            `${lines.join("; ")}. ${PERSON_NOTICE_HOW}` };
    }
    const notice = request.personNotice;
    if (notice === undefined || !personNoticeNumberSchema.safeParse(notice).success) {
      const message = "ack_person_notice needs later_inputs.personNotice, a notice number list_person_notices gives.";
      return { ok: false, error: { code: "invalid_request", message }, text: message };
    }
    const done = await this.deps.store.recordNotice(notice, "acknowledged", "owner", this.now().toISOString());
    return { ok: true, outcome: "person_notice_acknowledged", personNotices: { acknowledged: { notice, done } },
      text: done ? `Notice ${notice} is acknowledged by the owner; it leaves the open list.`
        : `Nothing to change: notice ${notice} is not open.` };
  }
}
