import { z } from "zod";

import { parseVideoReference } from "./gemini-video-tool.js";
import { salvageFinalizeInput } from "./salvage-finalize-input.js";

/**
 * Leads from people's reports, and the study search that followed each (the owner, 5 November 2026: "make sure that
 * our feedback loop is working between forum signal and studies"). HRP already asks for the loop:
 * CommunityToFormalHypothesisTransfer turns repeated or high-value community observations into study searches, one
 * tried, cheap, low-risk option the answer doesn't cover included (owner answer 250a);
 * FormalAbsenceCannotEraseCommunitySignal records how the studies relate to the signal; and
 * MatchedContradictionAndOutcomeAlignment lets a study contradict reports only when it measured the same thing. Judges
 * reading 18 runs lead by lead found 19 of 98 leads that forum threads or comments raised searched in studies, mostly
 * harms, and no answer saying a lead went unsearched: the protocol's words don't move the model, the final check's
 * notes do.
 *
 * So finalize_research takes community_leads, a later input (owner answer 189a), and checks exactly what the model
 * declares, as option_classes is checked: each place it read a lead, by this call's read receipts; each search, by a
 * literature-search receipt's query; each sentence, by the draft. Which reports raise a lead, and what the studies
 * showed, stay the model's judgment, in any language. Every finding is a note; a lead not searched is a limit.
 */

export const COMMUNITY_LEAD_STATES = ["searched", "not_searched"] as const;
// HRP FormalAbsenceCannotEraseCommunitySignal's allowed formal relationships, in its words.
export const COMMUNITY_LEAD_STUDIES = ["corroborated", "contradicted", "support_not_located", "outcome_mismatch"] as const;
export const COMMUNITY_LEAD_LIMITS = {
  leads: 12, leadCharacters: 160, from: 5, fromCharacters: 2_048, queryCharacters: 500, reasonCharacters: 300
} as const;

// The result text of the tools that read people's reports (read_forum_thread, and the YouTube comment tools) asks for
// the loop where the reports are read; the final check asks again when the declaration is missing.
export const COMMUNITY_LEADS_GUIDANCE = "Turn each option, dose, form, responder group or harm these reports raise " +
  "that the question didn't name into a study search, and declare it in finalize_research's " +
  "later_inputs.community_leads.";

export const communityLeadSchema = z.object({
  // A lead names something, so it holds a letter or digit in some script; "..." names nothing (review of 5 Nov 2026).
  // A lead too short to name anything gets the length note alone.
  lead: z.string().trim().min(3).max(COMMUNITY_LEAD_LIMITS.leadCharacters)
    .refine((lead) => lead.length < 3 || /[\p{L}\p{N}]/u.test(lead), "needs at least one letter or digit")
    .describe("The option, form, dose, timing, responder group, harm or way it could work that people's reports " +
      `raised and the question didn't name, in at most ${COMMUNITY_LEAD_LIMITS.leadCharacters} characters, as the ` +
      "answer would name it."),
  from: z.array(z.string().trim().min(1).max(COMMUNITY_LEAD_LIMITS.fromCharacters)).min(1).max(COMMUNITY_LEAD_LIMITS.from)
    .describe("Where the reports were read: a thread's link that read_forum_thread read or community_searches " +
      "declares in threads_read, or video:<YouTube id> (or the video's YouTube link) for a video whose comments " +
      "AskRigor read."),
  state: z.enum(COMMUNITY_LEAD_STATES)
    .describe("searched: searched in studies with search_pubmed, search_europe_pmc or search_clinical_trials; " +
      "not_searched: not searched in studies, with reason."),
  search_query: z.string().trim().min(1).max(COMMUNITY_LEAD_LIMITS.queryCharacters).optional()
    .describe("With searched: the exact query of that search, whose research_receipt is passed in receipts."),
  studies: z.enum(COMMUNITY_LEAD_STUDIES).optional()
    .describe("With searched: what the studies showed about it. corroborated: they support what people reported. " +
      "contradicted: only when the studies measured it the way the reports did (the same option, people, outcome and " +
      "time) and found otherwise; a study that measured something else does not contradict the reports. " +
      "outcome_mismatch: the studies measured something else, such as another outcome, dose, form or group. " +
      "support_not_located: the search found no study of it."),
  // The gate's answerQuote form: the answer's own words, compared with answer_draft as option_classes' are.
  answer_quote: z.string().trim().max(1_000).optional()
    .describe("With searched: the answer's sentence about the lead and what the search found, copied from " +
      "answer_draft."),
  reason: z.string().trim().min(10).max(COMMUNITY_LEAD_LIMITS.reasonCharacters).optional()
    .describe(`With not_searched: why it was not searched in studies, in 10 to ${COMMUNITY_LEAD_LIMITS.reasonCharacters} ` +
      "characters.")
}).strict();
export type CommunityLead = z.output<typeof communityLeadSchema>;

export const communityLeadsSchema = z.array(communityLeadSchema).max(COMMUNITY_LEAD_LIMITS.leads);

/**
 * Reads community_leads an entry at a time, each at its place as given, as the study map is read: an entry that can't
 * be used is left out with a note, and the others keep their places in the check's notes. At most 12 usable entries are
 * kept. Returns the entries as accepted, with each one's place as given; no list when the value isn't one.
 */
export function readCommunityLeads(raw: unknown): { leads?: CommunityLead[]; places: number[]; notes: string[] } {
  if (!Array.isArray(raw)) return { places: [], notes: ["community_leads: dropped: expected a list."] };
  const notes: string[] = [];
  const read = raw.flatMap((item: unknown, place) => {
    const own: string[] = [];
    const entry = salvageFinalizeInput(z.object({ item: communityLeadSchema }), { item }, own) as
      { item: CommunityLead } | undefined;
    notes.push(...own.map((note) => note.startsWith("item") ? `community_leads[${place}]${note.slice("item".length)}` : note));
    return entry === undefined ? [] : [{ lead: entry.item, place }];
  });
  if (read.length > COMMUNITY_LEAD_LIMITS.leads) {
    notes.push(`community_leads: kept at most ${COMMUNITY_LEAD_LIMITS.leads} items to stay within the list's size limit.`);
  }
  const kept = read.slice(0, COMMUNITY_LEAD_LIMITS.leads);
  return { leads: kept.map(({ lead }) => lead), places: kept.map(({ place }) => place), notes };
}

/**
 * The video a lead's `from` entry names: video:<YouTube id>, or a YouTube link in any form extract_youtube_video_claims
 * reads (watch, youtu.be, Shorts, live and embed links, on www, m and music hosts, over http or https, with any other
 * parameters, such as t= or si=). Undefined for anything else, which is read as a thread's link. Exact: the forms are
 * identifiers, not meanings.
 */
export function communityLeadVideo(source: string): string | undefined {
  const named = /^video:\s*(.+)$/iu.exec(source.trim());
  return parseVideoReference(named === null ? source : named[1]!);
}

// The end of a lead that only closes it: white space and . , : ; with their full-width and CJK forms. A ? or ! stays,
// since it carries meaning ("¿magnesio?"). Structural, the same in any language.
const LEAD_CLOSING = /[\s.,:;。、：；，．]+$/u;

/**
 * A lead as the limit for leads not searched names it: on one line, without a closing mark, and with a semicolon inside
 * it as a comma (a full-width one as a full-width comma), so "; " between leads stays the only separator.
 */
export function leadPhrase(lead: string): string {
  return lead.replace(/\s+/gu, " ").trim().replace(/;/gu, ",").replace(/；/gu, "，").replace(LEAD_CLOSING, "");
}

/**
 * What two entries compare by, so one lead has one entry: the lead in Unicode's compatibility form (NFKC), in lower case
 * without a locale, its white space collapsed and its closing mark left out. Exact, in any language: two different
 * words for one thing are two leads.
 */
export function leadKey(lead: string): string {
  return lead.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim().replace(LEAD_CLOSING, "");
}
