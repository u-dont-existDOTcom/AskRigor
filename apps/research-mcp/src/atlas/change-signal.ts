import type {
  AtlasModerationStore,
  AtlasParticipationStore,
  AtlasPublicationStore,
  AtlasReviewStore,
} from "@askrigor/evidence-repository";

/**
 * The Atlas pages cache rendered pages briefly (decision 171, section 4C) and drop them whenever a publication or an
 * accepted finding changes in this process. Every write this process makes through the publication store (publishing
 * at a save, the owner's publication actions, accepting, editing, rejecting, erasing, forgetting) and through the
 * review store (the owner's decisions and intents) announces itself on a signal, and the pages' cache listens. The
 * canonical Atlas is written by the one-shot admin runner, in its own process: the cache's 60 seconds bound how long a
 * page shows the state before one of its writes.
 */
export class AtlasChangeSignal {
  private readonly listeners = new Set<() => void>();

  /** Calls the listener after every announced change; returns what stops it. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  announce(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch {
        // A listener never affects the write that announced the change.
      }
    }
  }
}

/** The process's own signal, which the runtime's stores announce on and the pages' cache listens to. */
export const atlasChanges = new AtlasChangeSignal();

async function announcing<T>(signal: AtlasChangeSignal, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } finally {
    // Also after a failed call: the cache is dropped, which is never wrong.
    signal.announce();
  }
}

/** The publication store, announcing each write on the signal once the write has returned. */
export function announcingPublicationStore(
  store: AtlasPublicationStore,
  signal: AtlasChangeSignal = atlasChanges,
): AtlasPublicationStore {
  return {
    publish: (input) => announcing(signal, () => store.publish(input)),
    inspect: (query) => store.inspect(query),
    decide: (decision) => announcing(signal, () => store.decide(decision)),
    markEdited: (atlasNumber, editedAt) => announcing(signal, () => store.markEdited(atlasNumber, editedAt)),
    withdraw: (withdrawal) => announcing(signal, () => store.withdraw(withdrawal)),
    eraseTexts: (atlasNumber, erasedAt) => announcing(signal, () => store.eraseTexts(atlasNumber, erasedAt)),
  };
}

/** The owner's review store, announcing each decision, intent and forgetting on the signal. */
export function announcingReviewStore(
  store: AtlasReviewStore,
  signal: AtlasChangeSignal = atlasChanges,
): AtlasReviewStore {
  return {
    inspectCards: (cardNumbers) => store.inspectCards(cardNumbers),
    decide: (input) => announcing(signal, () => store.decide(input)),
    recordIntent: (input) => announcing(signal, () => store.recordIntent(input)),
    recordIntents: (inputs) => announcing(signal, () => store.recordIntents(inputs)),
    inspectIntents: (publicNumbers) => store.inspectIntents(publicNumbers),
    forgetCards: (cardNumbers, forgottenAt) => announcing(signal, () => store.forgetCards(cardNumbers, forgottenAt)),
  };
}

/** Votes, comments and reports (section 4E), announcing each write: a page shows them within the cache's life. */
export function announcingParticipationStore(
  store: AtlasParticipationStore,
  signal: AtlasChangeSignal = atlasChanges,
): AtlasParticipationStore {
  return {
    inspectParticipant: (participantKey) => store.inspectParticipant(participantKey),
    setDisplayName: (participantKey, displayName, at) =>
      announcing(signal, () => store.setDisplayName(participantKey, displayName, at)),
    setVote: (participantKey, publicationNumber, vote, at) =>
      announcing(signal, () => store.setVote(participantKey, publicationNumber, vote, at)),
    postComment: (participantKey, publicationNumber, body, at, firstDisplayName) =>
      announcing(signal, () => store.postComment(participantKey, publicationNumber, body, at, firstDisplayName)),
    deleteComment: (participantKey, publicId) => announcing(signal, () => store.deleteComment(participantKey, publicId)),
    reportComment: (reporterKey, publicId, at) => announcing(signal, () => store.reportComment(reporterKey, publicId, at)),
    forgetParticipant: (participantKey, at) => announcing(signal, () => store.forgetParticipant(participantKey, at)),
  };
}

/** The owner's moderation and picks (section 4E), announcing each write. */
export function announcingModerationStore(
  store: AtlasModerationStore,
  signal: AtlasChangeSignal = atlasChanges,
): AtlasModerationStore {
  return {
    inspectComments: (query) => store.inspectComments(query),
    moderateComment: (publicId, moderation, at) => announcing(signal, () => store.moderateComment(publicId, moderation, at)),
    setCommenterStopped: (commenterTag, stopped, at) =>
      announcing(signal, () => store.setCommenterStopped(commenterTag, stopped, at)),
    setHomePicks: (picks, at) => announcing(signal, () => store.setHomePicks(picks, at)),
    inspectHomePicks: () => store.inspectHomePicks(),
  };
}
