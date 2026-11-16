import { z } from "zod";

/**
 * What finalize_research says of a research dossier (AskRigor#477, stage 1; owner answer 329a, 16 November 2026), in
 * its own module so the final check's output schema reads it without the save's dependencies.
 *
 * saved: stored privately for the owner's review and read back with the digest it was written with; duplicate: this
 * dossier was saved before (its version); insufficient: not saved, with the problems; private: declared personal only,
 * or no research account; consent_blocked: not saved for this account or call (paid private, card saving switched off,
 * a call marked findings_save off, a notice that does not cover it); not_sent: the research did work a quick answer
 * cannot do and no dossier came; unconfirmed: the save was not confirmed in time; unavailable: the store failed.
 */
export const RESEARCH_DOSSIER_STATUSES = [
  "saved", "duplicate", "insufficient", "private", "consent_blocked", "not_sent", "unconfirmed", "unavailable",
] as const;
export type ResearchDossierStatus = typeof RESEARCH_DOSSIER_STATUSES[number];

export const researchDossierDispositionSchema = z.object({
  status: z.enum(RESEARCH_DOSSIER_STATUSES),
  dossier_id: z.string().regex(/^ARD-[0-9]{4,}$/u).optional(),
  version: z.number().int().positive().optional(),
  visibility: z.literal("private_review").optional(),
  /** The first 16 hexadecimal characters of the stored version's digest, as it was read back. */
  digest: z.string().regex(/^[a-f0-9]{16}$/u).optional(),
  written_alongside: z.boolean().optional(),
  reason: z.string().optional(),
  problems: z.array(z.object({ path: z.string(), rule: z.string() }).strict()).max(50).optional(),
}).strict().describe("This research's dossier (AskRigor#477): saved, stored privately for AskRigor's owner to review " +
  "and read back; duplicate, saved before; insufficient, not saved, with its problems by path and rule; private, " +
  "personal only or no research account; consent_blocked, not saved for this account or call; not_sent, the research " +
  "did work a quick answer cannot do and no dossier came; unconfirmed, not confirmed in time; unavailable.");

export type ResearchDossierDisposition = z.output<typeof researchDossierDispositionSchema>;

/**
 * The card guidance's sentence on the dossier (Codex's red team of the instruction proposal, 16 Nov 2026, item 3),
 * given only where a dossier can be saved for the account and call; here so the final check reads it without the save.
 */
export const RESEARCH_DOSSIER_CARD_SENTENCE = "A dossier has a separate value test: when AskRigor requests one, include " +
  "it with the first final check only if the completed research saves a later reader substantial work, even when no " +
  "card qualifies.";
