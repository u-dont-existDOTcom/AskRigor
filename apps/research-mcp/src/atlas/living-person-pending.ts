import type { AtlasPageReads, AtlasPageSource } from "@askrigor/evidence-repository";

import { atlasChanges, type AtlasChangeSignal } from "./change-signal.js";

/**
 * Codex's fifth review of 17 Nov 2026 (P0): a save that says a finding names a living person records that before it
 * publishes anything (record_atlas_living_person), and the database then holds the finding's publication. When that
 * record fails, the save fails, retryable, and publishes nothing, but a publication of the same claim already shown
 * stays shown in the database. So, from the moment a save starts its record until a record for that card stores the
 * claim (a later save, or the same save tried again), this process's pages don't show an unreviewed publication of a
 * claim the save said yes of: its page answers 404 and no list, search or map shows it. By the claim's key
 * (livingPersonClaimKey), since the pages never read a card's number; a claim on another card that reads the same is
 * kept off too. In memory only: it lasts until the process stops, and a restart serves only once the database's hold is
 * ready (atlasHoldReadiness), which holds a stored yes itself.
 */
export class UnrecordedLivingPersonClaims {
  private readonly byCard = new Map<number, Set<string>>();

  constructor(private readonly signal: AtlasChangeSignal = atlasChanges) {}

  /** A save is about to record these claims of its card as naming a living person: their pages stop showing. */
  pending(cardNumber: number, claimKeys: readonly string[]): void {
    if (claimKeys.length === 0) return;
    const keys = this.byCard.get(cardNumber) ?? new Set<string>();
    for (const key of claimKeys) keys.add(key);
    this.byCard.set(cardNumber, keys);
    // The pages' cache drops what it has, so a page already cached stops too.
    this.signal.announce();
  }

  /** A record of the card stored these claims: the database holds what it says, and their pages read it again. */
  recorded(cardNumber: number, claimKeys: readonly string[]): void {
    const keys = this.byCard.get(cardNumber);
    if (keys === undefined) return;
    const before = keys.size;
    for (const key of claimKeys) keys.delete(key);
    if (keys.size === 0) this.byCard.delete(cardNumber);
    if (keys.size !== before) this.signal.announce();
  }

  /** Whether a claim, by its key, waits for its record on any card. */
  has(claimKey: string): boolean {
    for (const keys of this.byCard.values()) if (keys.has(claimKey)) return true;
    return false;
  }

  get size(): number {
    return this.byCard.size;
  }
}

/** The process's own: the save's publisher adds to it, and the pages read through it. */
export const unrecordedLivingPersonClaims = new UnrecordedLivingPersonClaims();

/**
 * The pages' source, without an unreviewed publication whose claim waits for its record (UnrecordedLivingPersonClaims):
 * every page reads publications through listPublications, so none shows it.
 */
export function withoutUnrecordedLivingPerson(
  source: AtlasPageSource,
  claimKeyOf: (claim: string) => string,
  claims: UnrecordedLivingPersonClaims = unrecordedLivingPersonClaims,
): AtlasPageSource {
  return {
    read: (work) => source.read((reads) => {
      if (claims.size === 0) return work(reads);
      const filtered = Object.create(reads) as AtlasPageReads;
      filtered.listPublications = async (query) => (await reads.listPublications(query)).filter((publication) =>
        !(publication.state === "unreviewed" && publication.published !== null &&
          claims.has(claimKeyOf(publication.published.claim))));
      return work(filtered);
    }),
  };
}
