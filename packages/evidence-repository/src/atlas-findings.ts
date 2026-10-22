import { Pool, type PoolConfig } from "pg";
import { z } from "zod";

import { assertNoProhibitedPersistentKeys } from "./contracts.js";
import { deterministicUuid, sha256, stableJson } from "./hash.js";

// Atlas phase 2, part A (owner answers 159 and 160b, 2026-10-22; design
// docs/superpowers/plans/2026-10-22-atlas-phase-2-design.md, sections 3, 5 and 7). The owner's call records a decision
// and a hash-bound intent; the one-shot admin runner writes the canonical rows through planAtlasWrite(), the one pure
// planner the PostgreSQL and in-memory writers share. Code checks only exact things here: what an intent may hold,
// identities, versions, links and labels. Meaning (topic, numbers, links) is the AI's declaration and the owner's call.

// Vocabulary --------------------------------------------------------------------------------------------------------

export const ATLAS_INTENT_SCHEMA = "askrigor.atlas-finding-intent.v1";
export const ATLAS_INTENT_KINDS = ["accept", "recheck", "revise", "withdraw", "link", "unlink", "erase"] as const;
export type AtlasIntentKind = typeof ATLAS_INTENT_KINDS[number];
/**
 * The kinds this build's canonical writer applies. An erasure (decision 7) is recorded by part D's path; until a build
 * applies it, the runner leaves such an intent pending, as an older image leaves every Atlas intent pending.
 */
export const ATLAS_INTENT_KINDS_WRITTEN = ["accept", "recheck", "revise", "withdraw", "link", "unlink"] as const;

export const ATLAS_LABELS = ["checked", "lead", "contested", "superseded", "withdrawn"] as const;
export type AtlasLabel = typeof ATLAS_LABELS[number];
export const ATLAS_LINK_RELATIONS = ["same_as", "narrows", "contradicts", "replaces"] as const;
export type AtlasLinkRelation = typeof ATLAS_LINK_RELATIONS[number];
export const ATLAS_DISAGREEMENTS = ["dose", "population", "outcome", "follow_up", "study_quality", "analysis"] as const;
export const ATLAS_CHANGE_KINDS = [
  "accepted", "edited", "corrected", "withdrawn", "rechecked", "relabeled", "wording_removed",
] as const;
export type AtlasChangeKind = typeof ATLAS_CHANGE_KINDS[number];
export const ATLAS_CARD_DECISIONS = ["accepted", "accepted_as_lead", "rechecked", "rejected"] as const;
export type AtlasCardDecision = typeof ATLAS_CARD_DECISIONS[number];
export const ATLAS_CARD_ITEM_KINDS = ["finding", "open_lead"] as const;
export type AtlasCardItemKind = typeof ATLAS_CARD_ITEM_KINDS[number];

/**
 * The work a quick answer cannot do that counts as a verified basis (139c). comment_audit is not one, and is never
 * stored (4a): a finding resting only on audited comments waits for the community rule.
 */
export const ATLAS_VERIFIED_BASES = ["full_text_audit", "bounded_absence", "research_correction"] as const;
/** A card finding's tags without community_checked, which is never stored (4a). */
export const ATLAS_FINDING_TAGS = [
  "full_text_read", "contradicts_common_answer", "overlooked_study", "documented_absence",
] as const;
export const ATLAS_CERTAINTIES = ["high", "moderate", "low", "very_low"] as const;
export const ATLAS_SOURCE_KINDS = ["study", "review", "guideline", "registry", "other"] as const;
export const ATLAS_SOURCE_PROVIDERS = ["crossref", "pubmed", "europe_pmc", "clinicaltrials_gov"] as const;
export const ATLAS_RETRACTION_STATUSES = [
  "none_found", "corrected_or_updated", "expression_of_concern", "retracted", "not_applicable", "unknown",
] as const;
/** The statuses a source is bound under only after the owner confirmed it. */
const FLAGGED_RETRACTION_STATUSES: ReadonlySet<string> = new Set([
  "retracted", "expression_of_concern", "corrected_or_updated",
]);

/** What erase_atlas_wording() (migration 0017) writes in place of erased wording, and of an erased wording key. */
export const ATLAS_ERASED_TEXT = "[wording removed]";
export const ATLAS_ERASED_KEY = "0".repeat(64);

const PUBLIC_NUMBER = /^F-[1-9][0-9]{3,}$/u;
const ARF_REFERENCE = /ARF-\d/iu;
const YOUTUBE_REFERENCE = /(?:youtube(?:-nocookie)?\.com|youtu\.be)/iu;
const CONTROL_CHARACTER = /\p{Cc}/u;

// Intent payload schemas ----------------------------------------------------------------------------------------------

const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/u);
const publicNumberSchema = z.string().regex(PUBLIC_NUMBER);
const topicKeySchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,199}$/u);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine(
  (value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value,
  { message: "a calendar date" },
);
/** An instant to the millisecond at most, so it is the same instant in JavaScript and PostgreSQL. */
const instantSchema = z.iso.datetime({ offset: true }).refine(
  (value) => !/\.\d{4,}/u.test(value),
  { message: "at most millisecond precision" },
);

/**
 * A text the Atlas stores. Never a card reference (ARF- followed by digits) or a YouTube link (4a), and no control
 * characters. Whether a text could identify a person is the owner's judgment, and the privacy screen's before this.
 */
const atlasText = (max: number) => z.string().trim().min(1).max(max)
  .refine((value) => !CONTROL_CHARACTER.test(value.replace(/[\n\t]/gu, "")), {
    message: "an Atlas text holds no control characters",
  })
  .refine((value) => !ARF_REFERENCE.test(value), { message: "an Atlas text never names a findings card (ARF-…)" })
  .refine((value) => !YOUTUBE_REFERENCE.test(value), { message: "an Atlas text holds no YouTube link (4a)" });

/** Source identifiers in canonical form, so one paper always names one source family. */
export const atlasSourceIdentifierSchema = z.discriminatedUnion("scheme", [
  z.object({
    scheme: z.literal("doi"),
    value: z.string().regex(/^10\.\d{4,9}\/\S{1,300}$/u)
      .refine((value) => value === value.toLowerCase(), { message: "a DOI in lower case" }),
  }).strict(),
  z.object({ scheme: z.literal("pmid"), value: z.string().regex(/^[1-9]\d{0,8}$/u) }).strict(),
  z.object({ scheme: z.literal("pmcid"), value: z.string().regex(/^PMC[1-9]\d{0,8}$/u) }).strict(),
  z.object({ scheme: z.literal("nct"), value: z.string().regex(/^NCT\d{8}$/u) }).strict(),
]);
export type AtlasSourceIdentifier = z.infer<typeof atlasSourceIdentifierSchema>;

const identifierOrder = (left: { scheme: string; value: string }, right: { scheme: string; value: string }) =>
  left.scheme.localeCompare(right.scheme) || left.value.localeCompare(right.value);

/** The public record and retraction check of one source, made in the owner's call (part B's checkAtlasSources()). */
export const atlasSourceCheckSchema = z.object({
  provider: z.enum(ATLAS_SOURCE_PROVIDERS),
  title: atlasText(500).nullable(),
  publishedYear: z.number().int().min(1500).max(2200).nullable(),
  retractionStatus: z.enum(ATLAS_RETRACTION_STATUSES),
  notices: z.array(z.object({
    type: z.enum(["retracted", "expression_of_concern", "corrected_or_updated"]),
    date: isoDateSchema.nullable(),
    doi: z.string().regex(/^10\.\d{4,9}\/\S{1,300}$/u).nullable(),
  }).strict()).max(20),
  /** The owner said "accept anyway" for a retracted, corrected or concerned source. */
  ownerConfirmed: z.boolean(),
  envelopeSha256: sha256Hex,
  checkedAt: instantSchema,
}).strict().superRefine((check, context) => {
  if (FLAGGED_RETRACTION_STATUSES.has(check.retractionStatus) && !check.ownerConfirmed) {
    context.addIssue({
      code: "custom",
      path: ["ownerConfirmed"],
      message: "a retracted, corrected or concerned source is bound only after the owner confirmed it",
    });
  }
});

export const atlasSourceSchema = z.object({
  kind: z.enum(ATLAS_SOURCE_KINDS),
  identifiers: z.array(atlasSourceIdentifierSchema).min(1).max(4),
  check: atlasSourceCheckSchema,
}).strict().superRefine((source, context) => {
  const schemes = source.identifiers.map(({ scheme }) => scheme);
  if (new Set(schemes).size !== schemes.length) {
    context.addIssue({ code: "custom", path: ["identifiers"], message: "one identifier per scheme" });
  }
  if (source.identifiers.some((identifier, index) =>
    index > 0 && identifierOrder(source.identifiers[index - 1]!, identifier) >= 0)) {
    context.addIssue({ code: "custom", path: ["identifiers"], message: "identifiers sorted by scheme, then value" });
  }
});
export type AtlasSource = z.infer<typeof atlasSourceSchema>;

/**
 * One two-group yes-or-no figure, in binary_results' flat shape without the quote (design section 1): the one
 * definition the owner's tool takes, the intents store and phase 3's card numbers block will reuse. Flat fields only,
 * as binary_results' are, so ChatGPT's app shows the model every field and its description. Whether the wording shows
 * it, and the NNT arithmetic, are part B's exact checks (atlasNumbersProblems()); storage checks shape.
 */
export const atlasNumberEntrySchema = z.object({
  outcome: atlasText(200)
    .describe("The yes-or-no outcome as the wording names it, such as response or any adverse event."),
  better: z.enum(["fewer", "more"])
    .describe("Whether fewer or more people with this outcome is better: fewer for a harm or a relapse, more for a " +
      "response or a remission."),
  option: atlasText(120).describe("The option the figure is about, as the wording names it."),
  option_events: z.number().int().nonnegative().describe("How many people in the option's group had the outcome."),
  option_total: z.number().int().min(1).describe("How many people were in the option's group."),
  comparator: atlasText(120)
    .describe("What the option was compared with, as the wording names it, such as placebo."),
  comparator_events: z.number().int().nonnegative()
    .describe("How many people in the comparator's group had the outcome."),
  comparator_total: z.number().int().min(1).describe("How many people were in the comparator's group."),
  follow_up: atlasText(120)
    .describe("How long people were followed for this outcome, as the wording writes it, such as 12 weeks."),
  nnt: z.number().int().positive().optional()
    .describe("The number needed to treat the wording gives for this outcome, if it gives one: 1 divided by the " +
      "difference in the groups' rates, rounded up."),
  nnh: z.number().int().positive().optional()
    .describe("The number needed to harm the wording gives for this outcome, if it gives one: 1 divided by the " +
      "difference in the groups' rates, rounded up."),
  harms_none_found: z.boolean().optional()
    .describe("With nnt: true when no harms were found over the same follow-up. Otherwise each harm measured over it " +
      "is its own entry, with better set to fewer."),
}).strict().superRefine((entry, context) => {
  if (entry.option_events > entry.option_total) {
    context.addIssue({ code: "custom", path: ["option_events"], message: "events above the group's total" });
  }
  if (entry.comparator_events > entry.comparator_total) {
    context.addIssue({ code: "custom", path: ["comparator_events"], message: "events above the group's total" });
  }
  if (entry.nnt !== undefined && entry.nnh !== undefined) {
    context.addIssue({ code: "custom", path: ["nnh"], message: "a number needed to treat or to harm, not both" });
  }
});
export type AtlasNumberEntry = z.infer<typeof atlasNumberEntrySchema>;

/** The figures a finding's wording gives for two groups: an empty list when it gives none. */
export const atlasNumbersSchema = z.array(atlasNumberEntrySchema).max(20)
  .describe("Each yes-or-no figure the wording gives for two groups, or with a number needed to treat or harm (an " +
    "empty list if none). The wording shows each group's events and total, or its rate as a percentage, in digits of " +
    "any script; nnt (the option did better) or nnh (it did worse) is checked against 1 divided by the difference in " +
    "the groups' rates, rounded up, and the wording shows it with the follow-up. Beside an nnt, an entry for a harm " +
    "(better: fewer) over the same follow-up, or harms_none_found.");

const canonicalSubset = <T extends string>(allowed: readonly T[], values: readonly T[]) =>
  new Set(values).size === values.length &&
  values.every((value, index) => index === 0 || allowed.indexOf(values[index - 1]!) < allowed.indexOf(value));

/** One version's content: the accepted wording and its fields. */
export const atlasVersionContentSchema = z.object({
  wording: atlasText(500),
  appliesTo: atlasText(300).nullable(),
  certainty: z.enum(ATLAS_CERTAINTIES).nullable(),
  usualAnswer: atlasText(400).nullable(),
  whyNotUsual: atlasText(300).nullable(),
  whatWouldChangeIt: atlasText(300).nullable(),
  whoElse: atlasText(300).nullable(),
  whatItChanges: atlasText(300).nullable(),
  tags: z.array(z.enum(ATLAS_FINDING_TAGS)).max(ATLAS_FINDING_TAGS.length),
  verifiedBases: z.array(z.enum(ATLAS_VERIFIED_BASES)).max(ATLAS_VERIFIED_BASES.length),
  numbers: atlasNumbersSchema,
}).strict().superRefine((content, context) => {
  if (!canonicalSubset(ATLAS_FINDING_TAGS, content.tags)) {
    context.addIssue({ code: "custom", path: ["tags"], message: "tags once each, in their listed order" });
  }
  if (!canonicalSubset(ATLAS_VERIFIED_BASES, content.verifiedBases)) {
    context.addIssue({ code: "custom", path: ["verifiedBases"], message: "bases once each, in their listed order" });
  }
});
export type AtlasVersionContent = z.infer<typeof atlasVersionContentSchema>;

const atlasProtocolSchema = z.object({
  name: atlasText(100),
  version: atlasText(40),
  sha256: sha256Hex,
}).strict();

/** Which AskRigor made the research (the card stamp, without its save time, surface, model or catalog hash). */
export const atlasMadeWithSchema = z.object({
  askrigorVersion: z.string().regex(/^[0-9A-Za-z][0-9A-Za-z.+-]{0,39}$/u),
  build: z.string().regex(/^(?:[0-9a-f]{7,40}|unknown)$/u),
  protocols: z.array(atlasProtocolSchema).min(1).max(4),
  depth: z.string().regex(/^[a-z_]{1,40}$/u).nullable(),
  status: z.string().regex(/^[a-z_]{1,40}$/u).nullable(),
}).strict();
export type AtlasMadeWith = z.infer<typeof atlasMadeWithSchema>;

/** Which AskRigor recorded a decision that makes no research (a withdrawal, a link or an erasure). */
export const atlasDecidedWithSchema = z.object({
  askrigorVersion: z.string().regex(/^[0-9A-Za-z][0-9A-Za-z.+-]{0,39}$/u),
  build: z.string().regex(/^(?:[0-9a-f]{7,40}|unknown)$/u),
  protocols: z.array(atlasProtocolSchema).min(1).max(4),
}).strict();

const sourcesSchema = z.array(atlasSourceSchema).max(10);

function sharedIdentifier(sources: readonly AtlasSource[]): boolean {
  const seen = new Set<string>();
  for (const { identifiers } of sources) {
    for (const { scheme, value } of identifiers) {
      const key = `${scheme}\u0000${value}`;
      if (seen.has(key)) return true;
      seen.add(key);
    }
  }
  return false;
}

/**
 * accept_finding (and edit_finding before acceptance): a card finding or open lead as the owner accepts it. The
 * database gives it its public number; the payload never names the card, whose SHA-256 binds the decision row only.
 */
export const atlasAcceptIntentSchema = z.object({
  schema: z.literal(ATLAS_INTENT_SCHEMA),
  kind: z.literal("accept"),
  entryKind: z.enum(["finding", "lead"]),
  leadOrigin: z.enum(["unverified_finding", "open_lead"]).nullable(),
  editedAtAcceptance: z.boolean(),
  topic: z.object({ key: topicKeySchema, label: atlasText(500).nullable() }).strict(),
  question: atlasText(300),
  content: atlasVersionContentSchema,
  sources: sourcesSchema,
  wordingKeys: z.object({ card: sha256Hex, accepted: sha256Hex }).strict(),
  researchCheckedOn: isoDateSchema,
  madeWith: atlasMadeWithSchema,
}).strict().superRefine((intent, context) => {
  const issue = (path: Array<string | number>, message: string) => context.addIssue({ code: "custom", path, message });
  if ((intent.entryKind === "lead") !== (intent.leadOrigin !== null)) {
    issue(["leadOrigin"], "a lead names its origin; a finding has none");
  }
  const bases = intent.content.verifiedBases.length;
  if (intent.entryKind === "finding" && bases === 0) {
    issue(["content", "verifiedBases"], "a finding without a verified basis is accepted as a lead (3b)");
  }
  if (intent.entryKind === "lead" && bases > 0) {
    issue(["content", "verifiedBases"], "a lead has no verified basis");
  }
  if (intent.leadOrigin === "open_lead") {
    if (intent.sources.length > 0 || intent.content.numbers.length > 0 || intent.content.tags.length > 0) {
      issue(["sources"], "an open lead has no sources, numbers or tags");
    }
    if (intent.content.certainty !== null || intent.content.whyNotUsual !== null ||
      intent.content.whatWouldChangeIt !== null) {
      issue(["content"], "an open lead has no certainty, why-not-usual or what-would-change-it");
    }
  } else {
    if (intent.sources.length === 0) {
      issue(["sources"], "a card finding rests on a DOI, PMID, PMCID or NCT source (community_only is refused)");
    }
    if (intent.content.appliesTo === null || intent.content.certainty === null ||
      intent.content.whyNotUsual === null || intent.content.whatWouldChangeIt === null) {
      issue(["content"], "a card finding has whom it applies to, its certainty, why it is not usual and what " +
        "would change it");
    }
  }
  if (!intent.editedAtAcceptance && intent.wordingKeys.card !== intent.wordingKeys.accepted) {
    issue(["wordingKeys"], "unedited wording keeps the card's wording key");
  }
  if (intent.topic.key.length === 0) issue(["topic", "key"], "a topic key");
  if (sharedIdentifier(intent.sources)) issue(["sources"], "each source once");
});

/** A later card whose normalized question and claim match an accepted finding: a new research date (design 3). */
export const atlasRecheckIntentSchema = z.object({
  schema: z.literal(ATLAS_INTENT_SCHEMA),
  kind: z.literal("recheck"),
  publicNumber: publicNumberSchema,
  cardWordingKey: sha256Hex,
  verifiedBases: z.array(z.enum(ATLAS_VERIFIED_BASES)).max(ATLAS_VERIFIED_BASES.length),
  sources: sourcesSchema,
  researchCheckedOn: isoDateSchema,
  madeWith: atlasMadeWithSchema,
}).strict().superRefine((intent, context) => {
  if (!canonicalSubset(ATLAS_VERIFIED_BASES, intent.verifiedBases)) {
    context.addIssue({ code: "custom", path: ["verifiedBases"], message: "bases once each, in their listed order" });
  }
  if (sharedIdentifier(intent.sources)) context.addIssue({ code: "custom", path: ["sources"], message: "each source once" });
});

/** edit_finding after acceptance: a correction with a dated note, or a wording fix (5a). */
export const atlasReviseIntentSchema = z.object({
  schema: z.literal(ATLAS_INTENT_SCHEMA),
  kind: z.literal("revise"),
  publicNumber: publicNumberSchema,
  version: z.number().int().min(1),
  changeKind: z.enum(["corrected", "edited"]),
  note: atlasText(600).nullable(),
  content: atlasVersionContentSchema,
  sources: sourcesSchema,
  acceptedWordingKey: sha256Hex,
  researchCheckedOn: isoDateSchema,
  madeWith: atlasMadeWithSchema,
}).strict().superRefine((intent, context) => {
  if (intent.changeKind === "corrected" && intent.note === null) {
    context.addIssue({ code: "custom", path: ["note"], message: "a correction carries a public dated note (5a)" });
  }
  if (sharedIdentifier(intent.sources)) context.addIssue({ code: "custom", path: ["sources"], message: "each source once" });
});

/** withdraw_finding: takes an accepted finding down with a public dated note (5a). */
export const atlasWithdrawIntentSchema = z.object({
  schema: z.literal(ATLAS_INTENT_SCHEMA),
  kind: z.literal("withdraw"),
  publicNumber: publicNumberSchema,
  version: z.number().int().min(1),
  note: atlasText(600),
  decidedWith: atlasDecidedWithSchema,
}).strict();

/** link_findings: a link the AI declared and the owner agreed to. */
export const atlasLinkIntentSchema = z.object({
  schema: z.literal(ATLAS_INTENT_SCHEMA),
  kind: z.literal("link"),
  publicNumber: publicNumberSchema,
  relation: z.enum(ATLAS_LINK_RELATIONS),
  toPublicNumber: publicNumberSchema,
  disagreement: z.enum(ATLAS_DISAGREEMENTS).nullable(),
  rationale: atlasText(500),
  decidedWith: atlasDecidedWithSchema,
}).strict().superRefine((intent, context) => {
  if (intent.publicNumber === intent.toPublicNumber) {
    context.addIssue({ code: "custom", path: ["toPublicNumber"], message: "a link joins two different findings" });
  }
  if ((intent.relation === "contradicts") !== (intent.disagreement !== null)) {
    context.addIssue({
      code: "custom",
      path: ["disagreement"],
      message: "a contradiction names what the two disagree on; other links name nothing",
    });
  }
});

/** link_findings with relation unlink: withdraws a link, with a public note. */
export const atlasUnlinkIntentSchema = z.object({
  schema: z.literal(ATLAS_INTENT_SCHEMA),
  kind: z.literal("unlink"),
  publicNumber: publicNumberSchema,
  relation: z.enum(ATLAS_LINK_RELATIONS),
  toPublicNumber: publicNumberSchema,
  note: atlasText(600),
  decidedWith: atlasDecidedWithSchema,
}).strict().superRefine((intent, context) => {
  if (intent.publicNumber === intent.toPublicNumber) {
    context.addIssue({ code: "custom", path: ["toPublicNumber"], message: "a link joins two different findings" });
  }
});

/**
 * A finding whose wording could identify a person (decision 7): erases the wording of its earlier versions (after an
 * edit that made a general version) or of all its versions (after a withdrawal). Applied by part D's writer path.
 */
export const atlasEraseIntentSchema = z.object({
  schema: z.literal(ATLAS_INTENT_SCHEMA),
  kind: z.literal("erase"),
  publicNumber: publicNumberSchema,
  version: z.number().int().min(1),
  scope: z.enum(["earlier_versions", "all_versions"]),
  reasonCode: z.literal("could_identify_a_person"),
  decidedWith: atlasDecidedWithSchema,
}).strict();

export const atlasFindingIntentSchema = z.discriminatedUnion("kind", [
  atlasAcceptIntentSchema,
  atlasRecheckIntentSchema,
  atlasReviseIntentSchema,
  atlasWithdrawIntentSchema,
  atlasLinkIntentSchema,
  atlasUnlinkIntentSchema,
  atlasEraseIntentSchema,
]);
export type AtlasFindingIntent = z.infer<typeof atlasFindingIntentSchema>;

export class AtlasIntentMismatchError extends Error {
  constructor(
    readonly code: "ATLAS_INTENT_KIND_MISMATCH" | "ATLAS_INTENT_PUBLIC_NUMBER_MISMATCH" |
      "ATLAS_INTENT_PAYLOAD_SHA256_MISMATCH",
  ) {
    super(code);
  }
}

export interface PreparedAtlasFindingIntent {
  payload: AtlasFindingIntent;
  /** sha256 of the payload's stableJson, the hash the owner's decision and the runner bind. */
  payloadSha256: string;
}

/**
 * Parses an intent payload strictly and hashes it. Given what a stored intent row says (its kind, its public number,
 * its payload hash), it refuses any mismatch. The hash is of the parsed payload as JSON stores it.
 */
export function prepareAtlasFindingIntent(
  input: unknown,
  expected: { kind?: AtlasIntentKind; publicNumber?: string; payloadSha256?: string } = {},
): PreparedAtlasFindingIntent {
  const parsed = atlasFindingIntentSchema.parse(input);
  const payload = JSON.parse(JSON.stringify(parsed)) as AtlasFindingIntent;
  assertNoProhibitedPersistentKeys(payload);
  if (expected.kind !== undefined && payload.kind !== expected.kind) {
    throw new AtlasIntentMismatchError("ATLAS_INTENT_KIND_MISMATCH");
  }
  if (expected.publicNumber !== undefined && payload.kind !== "accept" && payload.publicNumber !== expected.publicNumber) {
    throw new AtlasIntentMismatchError("ATLAS_INTENT_PUBLIC_NUMBER_MISMATCH");
  }
  const payloadSha256 = sha256(stableJson(payload));
  if (expected.payloadSha256 !== undefined && payloadSha256 !== expected.payloadSha256) {
    throw new AtlasIntentMismatchError("ATLAS_INTENT_PAYLOAD_SHA256_MISMATCH");
  }
  return { payload, payloadSha256 };
}

// Failure codes -----------------------------------------------------------------------------------------------------

/**
 * Why an Atlas intent ended FAILED: a deterministic conflict with what the append-only store holds, so the same intent
 * would fail on every retry. The list is closed, in step with migration 0017's check, and holds no free text or
 * payload content. Anything else (a lost connection, a timeout, a serialization failure, an unexpected error) leaves
 * the intent pending for the next activation.
 */
export const ATLAS_FINDING_PROMOTION_FAILURE_CODES = [
  "ATLAS_INTENT_APPLICATION_MISMATCH",
  "ATLAS_FINDING_ALREADY_WRITTEN",
  "ATLAS_FINDING_MISSING",
  "ATLAS_FINDING_WITHDRAWN",
  "ATLAS_VERSION_STALE",
  "ATLAS_TOPIC_MISSING",
  "ATLAS_RECHECK_KEY_MISMATCH",
  "ATLAS_LINK_TARGET_MISSING",
  "ATLAS_LINK_TARGET_WITHDRAWN",
  "ATLAS_LINK_LEAD",
  "ATLAS_LINK_PAIR_TAKEN",
  "ATLAS_LINK_ALREADY_RECORDED",
  "ATLAS_LINK_CYCLE",
  "ATLAS_LINK_MISSING",
  "SOURCE_IDENTIFIER_CONFLICT",
  // The canonical store's triggers (migrations 0001 and 0017), raised as check violations with these exact messages.
  "ATLAS_VERSION_LINEAGE_MISMATCH",
  "CLAIM_DEPENDENCY_CYCLE",
  // Any other canonical constraint the write violated, by its class.
  "CANONICAL_UNIQUE_CONFLICT",
  "CANONICAL_REFERENCE_MISSING",
  "CANONICAL_CHECK_VIOLATION",
  "CANONICAL_VALUE_INVALID",
] as const;
export type AtlasFindingPromotionFailureCode = typeof ATLAS_FINDING_PROMOTION_FAILURE_CODES[number];

const ATLAS_TRIGGER_CODES: ReadonlySet<string> = new Set(["ATLAS_VERSION_LINEAGE_MISMATCH", "CLAIM_DEPENDENCY_CYCLE"]);

/** A deterministic conflict the planner found, with its code from the closed list. */
export class AtlasWriteConflict extends Error {
  constructor(readonly code: AtlasFindingPromotionFailureCode) {
    super(code);
  }
}

/**
 * The failure code for an error the canonical writer raised, or undefined when the error is transient or unexpected
 * and the intent stays pending: the planner's own code, or PostgreSQL's SQLSTATE and, for the canonical triggers,
 * their fixed message.
 */
export function atlasPromotionFailureCode(error: unknown): AtlasFindingPromotionFailureCode | undefined {
  if (error instanceof AtlasWriteConflict) return error.code;
  if (!(error instanceof Error)) return undefined;
  const sqlState = "code" in error && typeof error.code === "string" && /^[0-9A-Z]{5}$/u.test(error.code)
    ? error.code
    : undefined;
  if (sqlState === undefined) return undefined;
  if (sqlState === "23514") {
    return ATLAS_TRIGGER_CODES.has(error.message)
      ? error.message as AtlasFindingPromotionFailureCode
      : "CANONICAL_CHECK_VIOLATION";
  }
  if (sqlState === "23505") return "CANONICAL_UNIQUE_CONFLICT";
  if (sqlState === "23503") return "CANONICAL_REFERENCE_MISSING";
  if (sqlState.startsWith("22")) return "CANONICAL_VALUE_INVALID";
  return undefined;
}

// Labels ------------------------------------------------------------------------------------------------------------

export interface AtlasLabelContext {
  /** latestStatus is the status of the finding's latest claim version; verifiedBases are that version's. */
  findings: ReadonlyArray<{ findingId: string; latestStatus: string; verifiedBases: readonly string[] }>;
  links: ReadonlyArray<{ fromFindingId: string; toFindingId: string; relation: string; withdrawn: boolean }>;
}

const VERIFIED_BASIS_SET: ReadonlySet<string> = new Set(ATLAS_VERIFIED_BASES);

/**
 * A finding's label (design section 3). The first rule that applies wins:
 * 1. withdrawn: its latest version is invalidated;
 * 2. superseded: an unwithdrawn replaces link points at it;
 * 3. lead: it has no verified basis;
 * 4. contested: an unwithdrawn contradicts link joins it to a finding that is not withdrawn, superseded or a lead;
 * 5. checked: otherwise.
 * The context must hold the finding, its links and each contradicts partner with the partner's incoming links.
 */
export function atlasLabelOf(findingId: string, context: AtlasLabelContext): AtlasLabel {
  const findings = new Map(context.findings.map((finding) => [finding.findingId, finding]));
  const ruled = (id: string): AtlasLabel | undefined => {
    const finding = findings.get(id);
    if (finding === undefined) throw new Error("ATLAS_LABEL_CONTEXT_INCOMPLETE");
    if (finding.latestStatus === "invalidated") return "withdrawn";
    if (context.links.some((link) => !link.withdrawn && link.relation === "replaces" && link.toFindingId === id)) {
      return "superseded";
    }
    if (!finding.verifiedBases.some((basis) => VERIFIED_BASIS_SET.has(basis))) return "lead";
    return undefined;
  };
  const own = ruled(findingId);
  if (own !== undefined) return own;
  const contested = context.links.some((link) => {
    if (link.withdrawn || link.relation !== "contradicts") return false;
    if (link.fromFindingId !== findingId && link.toFindingId !== findingId) return false;
    return ruled(link.fromFindingId === findingId ? link.toFindingId : link.fromFindingId) === undefined;
  });
  return contested ? "contested" : "checked";
}

/** The claim-version status a label implies: invalidated when withdrawn, superseded when superseded, else current. */
function statusForLabel(label: AtlasLabel): "current" | "superseded" | "invalidated" {
  return label === "withdrawn" ? "invalidated" : label === "superseded" ? "superseded" : "current";
}

// Canonical state ---------------------------------------------------------------------------------------------------

export interface AtlasStateBinding {
  sourceVersionId: string;
  familyId: string;
  locator: string;
  polarity: string;
  capabilityCeiling: string;
  limitations: string[];
}

export interface AtlasStateVersion {
  claimVersionId: string;
  versionNumber: number;
  status: string;
  content: AtlasVersionContent;
  researchCheckedOn: string;
  madeWith: AtlasMadeWith;
  cardWordingKey: string | null;
  acceptedWordingKey: string | null;
  editedAtAcceptance: boolean;
  bindings: AtlasStateBinding[];
}

export interface AtlasStateFinding {
  findingId: string;
  publicNumber: string;
  claimId: string;
  questionId: string;
  topicId: string;
  entryKind: "finding" | "lead";
  leadOrigin: "unverified_finding" | "open_lead" | null;
  /** Ascending by version number. */
  versions: AtlasStateVersion[];
}

export interface AtlasStateLink {
  linkId: string;
  fromFindingId: string;
  toFindingId: string;
  relation: AtlasLinkRelation;
  disagreement: string | null;
  withdrawn: boolean;
}

/**
 * What the canonical store holds for an intent or a review: the findings a request names with every finding linked to
 * them and each of those findings' contradicts partners (the context their labels need), their links, the topics and
 * exact questions named, and the source families the identifiers name with their metadata-only versions.
 */
export interface AtlasState {
  findings: AtlasStateFinding[];
  links: AtlasStateLink[];
  /** Every unwithdrawn replaces link in the Atlas, when the request asked for them; otherwise null. */
  replacesLinks: Array<{ fromFindingId: string; toFindingId: string }> | null;
  topics: Array<{ topicId: string; canonicalKey: string; label: string }>;
  /** Questions with no dimensions, which an Atlas finding joins by exact topic and text. */
  questions: Array<{ questionId: string; topicId: string; normalizedQuestion: string }>;
  sourceFamilies: Array<{
    familyId: string;
    sourceKind: string;
    identityHash: string;
    displayTitle: string;
    identifiers: Array<{ scheme: string; value: string }>;
  }>;
  /** Metadata-only versions, with no content hash, of the families the identifiers name. */
  sourceVersions: Array<{ versionId: string; familyId: string; retrievedAt: string }>;
}

export interface AtlasStateRequest {
  publicNumbers?: string[];
  /** Card or accepted wording keys (part B's atlasWordingKey()). */
  wordingKeys?: string[];
  questions?: Array<{ topicKey: string; normalizedQuestion: string }>;
  identifiers?: Array<{ scheme: string; value: string }>;
  topicKeys?: string[];
  replacesGraph?: boolean;
}

/** The canonical store's read-only Atlas view; the public runtime's reader role is enough. */
export interface AtlasStateReader {
  readAtlasState(request: AtlasStateRequest): Promise<AtlasState>;
}

/**
 * What the writer reads before planning an intent: everything the planner looks up for it. An accept's payload has no
 * public number (the database gives it one), so the stored intent's number is read too, to refuse one already written.
 */
export function atlasStateRequest(intent: { publicNumber: string; payload: AtlasFindingIntent }): AtlasStateRequest {
  const payload = intent.payload;
  const identifiers = (sources: readonly AtlasSource[]) => sources.flatMap(({ identifiers: own }) => own);
  switch (payload.kind) {
    case "accept":
      return {
        publicNumbers: [intent.publicNumber],
        topicKeys: [payload.topic.key],
        questions: [{ topicKey: payload.topic.key, normalizedQuestion: payload.question }],
        identifiers: identifiers(payload.sources),
      };
    case "recheck":
    case "revise":
      return { publicNumbers: [payload.publicNumber], identifiers: identifiers(payload.sources) };
    case "withdraw":
    case "erase":
      return { publicNumbers: [payload.publicNumber] };
    case "link":
      return { publicNumbers: [payload.publicNumber, payload.toPublicNumber], replacesGraph: payload.relation === "replaces" };
    case "unlink":
      return { publicNumbers: [payload.publicNumber, payload.toPublicNumber] };
  }
}

/** Each finding's current label, for the findings whose label context the state holds in full. */
export function atlasCurrentLabels(state: AtlasState, findingIds: readonly string[]): Map<string, AtlasLabel> {
  const context = labelContextOf(state.findings, state.links);
  return new Map(findingIds.map((id) => [id, atlasLabelOf(id, context)]));
}

function labelContextOf(findings: readonly AtlasStateFinding[], links: readonly AtlasStateLink[]): {
  findings: Array<{ findingId: string; latestStatus: string; verifiedBases: string[] }>;
  links: Array<{ fromFindingId: string; toFindingId: string; relation: string; withdrawn: boolean; linkId: string }>;
} {
  return {
    findings: findings.map((finding) => {
      const latest = finding.versions.at(-1)!;
      return { findingId: finding.findingId, latestStatus: latest.status, verifiedBases: [...latest.content.verifiedBases] };
    }),
    links: links.map(({ linkId, fromFindingId, toFindingId, relation, withdrawn }) =>
      ({ linkId, fromFindingId, toFindingId, relation, withdrawn })),
  };
}

// The planner -------------------------------------------------------------------------------------------------------

/** An intent as the queue stores it, before the writer re-validates it. */
export interface AtlasStoredIntent {
  intentId: string;
  intentKind: AtlasIntentKind;
  publicNumber: string;
  payload: unknown;
  payloadSha256: string;
  /** The owner's decision time: the run's time and every change's decided_at. */
  createdAt: string;
}

export interface PreparedAtlasStoredIntent extends AtlasStoredIntent {
  payload: AtlasFindingIntent;
}

/** Re-validates a stored intent: its payload parses, and its kind, number and hash are the row's. */
export function prepareStoredAtlasIntent(intent: AtlasStoredIntent): PreparedAtlasStoredIntent {
  const prepared = prepareAtlasFindingIntent(intent.payload, {
    kind: intent.intentKind,
    publicNumber: intent.publicNumber,
    payloadSha256: intent.payloadSha256,
  });
  if (!PUBLIC_NUMBER.test(intent.publicNumber)) throw new AtlasIntentMismatchError("ATLAS_INTENT_PUBLIC_NUMBER_MISMATCH");
  return { ...intent, createdAt: isoInstant(intent.createdAt), payload: prepared.payload };
}

/** The canonical writer's receipt: ids and hashes only. */
export interface AtlasWriterReceipt {
  receiptSchema: "askrigor.atlas-writer.v1";
  status: "inserted" | "idempotent_replay";
  intentId: string;
  intentKind: AtlasIntentKind;
  publicNumber: string;
  payloadSha256: string;
  runId: string;
  eventId: string;
  findingIds: string[];
  claimVersionIds: string[];
  changeIds: string[];
  linkIds: string[];
  sourceFamilyIds: string[];
}

export interface AtlasPlannedFindingVersion {
  claimVersionId: string;
  findingId: string;
  claimId: string;
  versionNumber: number;
  supersedesClaimVersionId: string | null;
  status: "current" | "superseded" | "invalidated";
  content: AtlasVersionContent;
  researchCheckedOn: string;
  madeWith: AtlasMadeWith;
  cardWordingKey: string | null;
  acceptedWordingKey: string | null;
  editedAtAcceptance: boolean;
}

export interface AtlasPlannedBinding {
  bindingId: string;
  claimVersionId: string;
  sourceVersionId: string;
  locator: string;
  polarity: "supports" | "context_only";
  capabilityCeiling: "can_support" | "cannot_support" | "uncertain";
  limitations: string[];
}

export interface AtlasPlannedChange {
  changeId: string;
  findingId: string;
  changeKind: AtlasChangeKind;
  claimVersionId: string | null;
  labelBefore: AtlasLabel | null;
  labelAfter: AtlasLabel;
  publicNote: string | null;
  linkId: string | null;
  researchCheckedOn: string | null;
}

/** Every row one intent writes, in the order the writers insert them. */
export interface AtlasWritePlan {
  intent: { intentId: string; intentKind: AtlasIntentKind; publicNumber: string; payloadSha256: string };
  decidedAt: string;
  run: {
    runId: string;
    runKind: "live_research" | "correction";
    protocolManifestSha256s: string[];
    provenanceNote: string;
  };
  topic: { topicId: string; canonicalKey: string; label: string } | null;
  question: { questionId: string; topicId: string; normalizedQuestion: string } | null;
  claim: { claimId: string; questionId: string } | null;
  finding: {
    findingId: string;
    publicNumber: string;
    claimId: string;
    entryKind: "finding" | "lead";
    leadOrigin: "unverified_finding" | "open_lead" | null;
  } | null;
  sourceFamilies: Array<{ familyId: string; sourceKind: string; identityHash: string; displayTitle: string }>;
  sourceIdentifiers: Array<{ familyId: string; scheme: string; value: string }>;
  sourceVersions: Array<{ versionId: string; familyId: string; retrievedAt: string }>;
  sourceChecks: Array<{
    checkId: string;
    familyId: string;
    check: AtlasSource["check"];
  }>;
  versions: AtlasPlannedFindingVersion[];
  bindings: AtlasPlannedBinding[];
  links: Array<{
    linkId: string;
    fromFindingId: string;
    relation: AtlasLinkRelation;
    toFindingId: string;
    disagreement: string | null;
    rationale: string;
    claimEdge: { edgeId: string; fromClaimVersionId: string; toClaimVersionId: string; relation: string };
  }>;
  linkWithdrawals: Array<{ linkId: string; publicNote: string }>;
  changes: AtlasPlannedChange[];
  event: { eventId: string; eventKind: string; details: Record<string, unknown> };
  receipt: AtlasWriterReceipt;
}

const CLAIM_EDGE_RELATIONS: Record<AtlasLinkRelation, string> = {
  contradicts: "contradicts",
  replaces: "supersedes",
  same_as: "duplicates",
  narrows: "qualifies",
};

const PROVENANCE_NOTE = (kind: AtlasIntentKind) =>
  `AskRigor Atlas owner decision (${kind}) applied by the canonical Atlas writer from its hash-bound intent; no ` +
  "findings card, account, chat, answer quote or community data is stored.";

/** The writer receipt's lists, from the rows one intent wrote. */
export function atlasWriterReceipt(input: {
  status: AtlasWriterReceipt["status"];
  intent: { intentId: string; intentKind: AtlasIntentKind; publicNumber: string; payloadSha256: string };
  findingIds: Iterable<string>;
  claimVersionIds: Iterable<string>;
  changeIds: Iterable<string>;
  linkIds: Iterable<string>;
  sourceFamilyIds: Iterable<string>;
}): AtlasWriterReceipt {
  const sorted = (values: Iterable<string>) => [...new Set(values)].sort();
  return {
    receiptSchema: "askrigor.atlas-writer.v1",
    status: input.status,
    intentId: input.intent.intentId,
    intentKind: input.intent.intentKind,
    publicNumber: input.intent.publicNumber,
    payloadSha256: input.intent.payloadSha256,
    runId: atlasRunId(input.intent.intentId),
    eventId: deterministicUuid(`askrigor:atlas-event:${input.intent.intentId}`),
    findingIds: sorted(input.findingIds),
    claimVersionIds: sorted(input.claimVersionIds),
    changeIds: sorted(input.changeIds),
    linkIds: sorted(input.linkIds),
    sourceFamilyIds: sorted(input.sourceFamilyIds),
  };
}

export function atlasRunId(intentId: string): string {
  return deterministicUuid(`askrigor:atlas-run:${intentId}`);
}

function isoInstant(value: string | Date): string {
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) throw new Error("ATLAS_INSTANT_INVALID");
  return instant.toISOString();
}

interface ResolvedSource {
  familyId: string;
  locator: string;
  retractionStatus: string;
  retrievedAt: string;
  sourceVersionId: string;
  createSourceVersion: boolean;
}

function limitationsFor(retractionStatus: string): string[] {
  return FLAGGED_RETRACTION_STATUSES.has(retractionStatus) ? [retractionStatus] : [];
}

/**
 * Plans every row one intent writes against the canonical state the writer read under its lock. Pure: the PostgreSQL
 * and in-memory writers share it. A deterministic conflict throws AtlasWriteConflict with its code; nothing is
 * written then. Erasure (part D) is not planned here.
 */
export function planAtlasWrite(intent: PreparedAtlasStoredIntent, state: AtlasState): AtlasWritePlan {
  const payload = intent.payload;
  if (payload.kind === "erase") throw new Error("ATLAS_ERASE_NOT_BUILT");
  const decidedAt = isoInstant(intent.createdAt);
  const intentIdentity = {
    intentId: intent.intentId,
    intentKind: intent.intentKind,
    publicNumber: intent.publicNumber,
    payloadSha256: intent.payloadSha256,
  };
  const protocols = "madeWith" in payload ? payload.madeWith.protocols : payload.decidedWith.protocols;
  const plan: AtlasWritePlan = {
    intent: intentIdentity,
    decidedAt,
    run: {
      runId: atlasRunId(intent.intentId),
      runKind: ["revise", "withdraw", "unlink"].includes(payload.kind) ? "correction" : "live_research",
      protocolManifestSha256s: protocols.map(({ sha256: digest }) => digest),
      provenanceNote: PROVENANCE_NOTE(payload.kind),
    },
    topic: null,
    question: null,
    claim: null,
    finding: null,
    sourceFamilies: [],
    sourceIdentifiers: [],
    sourceVersions: [],
    sourceChecks: [],
    versions: [],
    bindings: [],
    links: [],
    linkWithdrawals: [],
    changes: [],
    event: { eventId: deterministicUuid(`askrigor:atlas-event:${intent.intentId}`), eventKind: "", details: {} },
    receipt: undefined as unknown as AtlasWriterReceipt,
  };

  const byNumber = new Map(state.findings.map((finding) => [finding.publicNumber, finding]));
  const before = labelContextOf(state.findings, state.links);
  const after = {
    findings: before.findings.map((finding) => ({ ...finding, verifiedBases: [...finding.verifiedBases] })),
    links: before.links.map((link) => ({ ...link })),
  };
  const afterFinding = (findingId: string) => after.findings.find((finding) => finding.findingId === findingId)!;
  const labelBefore = (findingId: string) => atlasLabelOf(findingId, before);
  const latestOf = (finding: AtlasStateFinding) => finding.versions.at(-1)!;
  const findingFor = (publicNumber: string, missing: AtlasFindingPromotionFailureCode) => {
    const finding = byNumber.get(publicNumber);
    if (finding === undefined) throw new AtlasWriteConflict(missing);
    return finding;
  };
  const versionId = (publicNumber: string, versionNumber: number) =>
    deterministicUuid(`askrigor:atlas-claim-version:${publicNumber}:${versionNumber}`);
  const changeId = (findingId: string, kind: AtlasChangeKind) =>
    deterministicUuid(`askrigor:atlas-change:${intent.intentId}:${findingId}:${kind}`);

  const usedFamilies = new Set<string>();
  const resolveSources = (sources: readonly AtlasSource[]): ResolvedSource[] => sources.map((source) => {
    const identifiers = [...source.identifiers].sort(identifierOrder);
    const named = state.sourceFamilies.filter((family) => family.identifiers.some((stored) =>
      identifiers.some(({ scheme, value }) => scheme === stored.scheme && value === stored.value)));
    let familyId: string;
    if (named.length === 0) {
      familyId = deterministicUuid(`askrigor:source-family:${stableJson(identifiers)}`);
      if (!usedFamilies.has(familyId)) {
        plan.sourceFamilies.push({
          familyId,
          sourceKind: source.kind,
          identityHash: sha256(stableJson(identifiers)),
          displayTitle: (source.check.title ?? `${identifiers[0]!.scheme}:${identifiers[0]!.value}`).slice(0, 500),
        });
        for (const { scheme, value } of identifiers) plan.sourceIdentifiers.push({ familyId, scheme, value });
      }
    } else {
      // As resolveCanonicalSource does: one family, the same kind of source, and no other value for a scheme it has.
      const family = named[0]!;
      const disagrees = identifiers.some(({ scheme, value }) => {
        const stored = family.identifiers.filter((identifier) => identifier.scheme === scheme);
        return stored.length > 0 && !stored.some((identifier) => identifier.value === value);
      });
      if (named.length > 1 || family.sourceKind !== source.kind || disagrees) {
        throw new AtlasWriteConflict("SOURCE_IDENTIFIER_CONFLICT");
      }
      familyId = family.familyId;
      for (const { scheme, value } of identifiers) {
        if (!family.identifiers.some((stored) => stored.scheme === scheme && stored.value === value)) {
          plan.sourceIdentifiers.push({ familyId, scheme, value });
        }
      }
    }
    if (usedFamilies.has(familyId)) throw new AtlasWriteConflict("SOURCE_IDENTIFIER_CONFLICT");
    usedFamilies.add(familyId);
    plan.sourceChecks.push({
      checkId: deterministicUuid(`askrigor:atlas-source-check:${intent.intentId}:${familyId}`),
      familyId,
      check: source.check,
    });
    const retrievedAt = isoInstant(source.check.checkedAt);
    const stored = state.sourceVersions.find((version) =>
      version.familyId === familyId && isoInstant(version.retrievedAt) === retrievedAt);
    return {
      familyId,
      locator: `${identifiers[0]!.scheme}:${identifiers[0]!.value}`,
      retractionStatus: source.check.retractionStatus,
      retrievedAt,
      sourceVersionId: stored?.versionId ??
        deterministicUuid(`askrigor:atlas-source-version:${familyId}:${retrievedAt}`),
      createSourceVersion: stored === undefined,
    };
  });

  const bindResolved = (claimVersionId: string, resolved: ResolvedSource, hasBases: boolean) => {
    if (resolved.createSourceVersion && !plan.sourceVersions.some(({ versionId: id }) => id === resolved.sourceVersionId)) {
      plan.sourceVersions.push({
        versionId: resolved.sourceVersionId,
        familyId: resolved.familyId,
        retrievedAt: resolved.retrievedAt,
      });
    }
    // A retracted source is bound as context only, never as support (design section 2).
    const contextOnly = resolved.retractionStatus === "retracted";
    plan.bindings.push({
      bindingId: deterministicUuid(`askrigor:atlas-binding:${claimVersionId}:${resolved.sourceVersionId}`),
      claimVersionId,
      sourceVersionId: resolved.sourceVersionId,
      locator: resolved.locator,
      polarity: contextOnly ? "context_only" : "supports",
      capabilityCeiling: contextOnly ? "cannot_support" : hasBases ? "can_support" : "uncertain",
      limitations: limitationsFor(resolved.retractionStatus),
    });
  };
  const copyBinding = (claimVersionId: string, binding: AtlasStateBinding, hasBases: boolean) => {
    const contextOnly = binding.polarity === "context_only";
    plan.bindings.push({
      bindingId: deterministicUuid(`askrigor:atlas-binding:${claimVersionId}:${binding.sourceVersionId}`),
      claimVersionId,
      sourceVersionId: binding.sourceVersionId,
      locator: binding.locator,
      polarity: contextOnly ? "context_only" : "supports",
      capabilityCeiling: contextOnly ? "cannot_support" : hasBases ? "can_support" : "uncertain",
      limitations: [...binding.limitations],
    });
  };
  const nextVersion = (
    finding: { findingId: string; claimId: string; publicNumber: string },
    previous: AtlasStateVersion | null,
    fields: Omit<AtlasPlannedFindingVersion, "claimVersionId" | "findingId" | "claimId" | "versionNumber" |
      "supersedesClaimVersionId">,
  ): AtlasPlannedFindingVersion => {
    const versionNumber = (previous?.versionNumber ?? 0) + 1;
    const version = {
      claimVersionId: versionId(finding.publicNumber, versionNumber),
      findingId: finding.findingId,
      claimId: finding.claimId,
      versionNumber,
      supersedesClaimVersionId: previous?.claimVersionId ?? null,
      ...fields,
    };
    plan.versions.push(version);
    return version;
  };
  const statusOnlyVersion = (finding: AtlasStateFinding, status: AtlasPlannedFindingVersion["status"]) => {
    const latest = latestOf(finding);
    const version = nextVersion(finding, latest, {
      status,
      content: latest.content,
      researchCheckedOn: latest.researchCheckedOn,
      madeWith: latest.madeWith,
      cardWordingKey: latest.cardWordingKey,
      acceptedWordingKey: latest.acceptedWordingKey,
      editedAtAcceptance: false,
    });
    const hasBases = latest.content.verifiedBases.length > 0;
    for (const binding of latest.bindings) copyBinding(version.claimVersionId, binding, hasBases);
    return version;
  };
  const assertWritable = (finding: AtlasStateFinding, withdrawnCode: AtlasFindingPromotionFailureCode) => {
    if (labelBefore(finding.findingId) === "withdrawn") throw new AtlasWriteConflict(withdrawnCode);
  };
  const assertVersion = (finding: AtlasStateFinding, version: number) => {
    if (latestOf(finding).versionNumber !== version) throw new AtlasWriteConflict("ATLAS_VERSION_STALE");
  };

  // The finding an accept, re-check, revision or withdrawal changes, with its change; links have none.
  let primary: { findingId: string; change: AtlasPlannedChange; version: AtlasPlannedFindingVersion | null } | null =
    null;
  let touched: string[];
  let linkId: string | null = null;

  switch (payload.kind) {
    case "accept": {
      if (byNumber.has(intent.publicNumber)) throw new AtlasWriteConflict("ATLAS_FINDING_ALREADY_WRITTEN");
      const storedTopic = state.topics.find(({ canonicalKey }) => canonicalKey === payload.topic.key);
      let topicId: string;
      if (storedTopic !== undefined) {
        topicId = storedTopic.topicId;
      } else {
        if (payload.topic.label === null) throw new AtlasWriteConflict("ATLAS_TOPIC_MISSING");
        topicId = deterministicUuid(`askrigor:atlas-topic:${payload.topic.key}`);
        plan.topic = { topicId, canonicalKey: payload.topic.key, label: payload.topic.label };
      }
      const storedQuestion = state.questions.find((question) =>
        question.topicId === topicId && question.normalizedQuestion === payload.question);
      const questionId = storedQuestion?.questionId ??
        deterministicUuid(`askrigor:atlas-question:${topicId}:${payload.question}`);
      if (storedQuestion === undefined) plan.question = { questionId, topicId, normalizedQuestion: payload.question };
      const claimId = deterministicUuid(`askrigor:atlas-claim:${intent.publicNumber}`);
      const findingId = deterministicUuid(`askrigor:atlas-finding:${intent.publicNumber}`);
      plan.claim = { claimId, questionId };
      plan.finding = {
        findingId,
        publicNumber: intent.publicNumber,
        claimId,
        entryKind: payload.entryKind,
        leadOrigin: payload.leadOrigin,
      };
      const resolved = resolveSources(payload.sources);
      const version = nextVersion({ findingId, claimId, publicNumber: intent.publicNumber }, null, {
        status: "current",
        content: payload.content,
        researchCheckedOn: payload.researchCheckedOn,
        madeWith: payload.madeWith,
        cardWordingKey: payload.wordingKeys.card,
        acceptedWordingKey: payload.wordingKeys.accepted,
        editedAtAcceptance: payload.editedAtAcceptance,
      });
      const hasBases = payload.content.verifiedBases.length > 0;
      for (const source of resolved) bindResolved(version.claimVersionId, source, hasBases);
      after.findings.push({ findingId, latestStatus: "current", verifiedBases: [...payload.content.verifiedBases] });
      primary = {
        findingId,
        version,
        change: {
          changeId: changeId(findingId, "accepted"),
          findingId,
          changeKind: "accepted",
          claimVersionId: version.claimVersionId,
          labelBefore: null,
          labelAfter: "checked",
          publicNote: null,
          linkId: null,
          researchCheckedOn: null,
        },
      };
      touched = [findingId];
      break;
    }
    case "recheck": {
      const finding = findingFor(intent.publicNumber, "ATLAS_FINDING_MISSING");
      assertWritable(finding, "ATLAS_FINDING_WITHDRAWN");
      if (!finding.versions.some((version) =>
        version.cardWordingKey === payload.cardWordingKey || version.acceptedWordingKey === payload.cardWordingKey)) {
        throw new AtlasWriteConflict("ATLAS_RECHECK_KEY_MISMATCH");
      }
      const latest = latestOf(finding);
      const resolved = resolveSources(payload.sources);
      const bound = new Set(latest.bindings.map(({ familyId }) => familyId));
      const newBases = payload.verifiedBases.filter((basis) => !latest.content.verifiedBases.includes(basis));
      let version: AtlasPlannedFindingVersion | null = null;
      // A re-check makes a new version only if it brings sources or a basis (design section 3).
      if (resolved.some(({ familyId }) => !bound.has(familyId)) || newBases.length > 0) {
        const verifiedBases = ATLAS_VERIFIED_BASES.filter((basis) =>
          latest.content.verifiedBases.includes(basis) || payload.verifiedBases.includes(basis));
        version = nextVersion(finding, latest, {
          status: "current",
          content: { ...latest.content, verifiedBases },
          researchCheckedOn: payload.researchCheckedOn,
          madeWith: payload.madeWith,
          cardWordingKey: payload.cardWordingKey,
          acceptedWordingKey: latest.acceptedWordingKey,
          editedAtAcceptance: false,
        });
        const hasBases = verifiedBases.length > 0;
        const rechecked = new Set(resolved.map(({ familyId }) => familyId));
        for (const binding of latest.bindings) {
          if (!rechecked.has(binding.familyId)) copyBinding(version.claimVersionId, binding, hasBases);
        }
        for (const source of resolved) bindResolved(version.claimVersionId, source, hasBases);
        afterFinding(finding.findingId).verifiedBases = [...verifiedBases];
      }
      primary = {
        findingId: finding.findingId,
        version,
        change: {
          changeId: changeId(finding.findingId, "rechecked"),
          findingId: finding.findingId,
          changeKind: "rechecked",
          claimVersionId: version?.claimVersionId ?? null,
          labelBefore: labelBefore(finding.findingId),
          labelAfter: "checked",
          publicNote: null,
          linkId: null,
          researchCheckedOn: payload.researchCheckedOn,
        },
      };
      touched = [finding.findingId];
      break;
    }
    case "revise": {
      const finding = findingFor(intent.publicNumber, "ATLAS_FINDING_MISSING");
      assertWritable(finding, "ATLAS_FINDING_WITHDRAWN");
      assertVersion(finding, payload.version);
      const latest = latestOf(finding);
      const resolved = resolveSources(payload.sources);
      const version = nextVersion(finding, latest, {
        status: "current",
        content: payload.content,
        researchCheckedOn: payload.researchCheckedOn,
        madeWith: payload.madeWith,
        cardWordingKey: null,
        acceptedWordingKey: payload.acceptedWordingKey,
        editedAtAcceptance: false,
      });
      const hasBases = payload.content.verifiedBases.length > 0;
      for (const source of resolved) bindResolved(version.claimVersionId, source, hasBases);
      afterFinding(finding.findingId).verifiedBases = [...payload.content.verifiedBases];
      primary = {
        findingId: finding.findingId,
        version,
        change: {
          changeId: changeId(finding.findingId, payload.changeKind),
          findingId: finding.findingId,
          changeKind: payload.changeKind,
          claimVersionId: version.claimVersionId,
          labelBefore: labelBefore(finding.findingId),
          labelAfter: "checked",
          publicNote: payload.note,
          linkId: null,
          researchCheckedOn: null,
        },
      };
      touched = [finding.findingId];
      break;
    }
    case "withdraw": {
      const finding = findingFor(intent.publicNumber, "ATLAS_FINDING_MISSING");
      assertWritable(finding, "ATLAS_FINDING_WITHDRAWN");
      assertVersion(finding, payload.version);
      const version = statusOnlyVersion(finding, "invalidated");
      afterFinding(finding.findingId).latestStatus = "invalidated";
      primary = {
        findingId: finding.findingId,
        version,
        change: {
          changeId: changeId(finding.findingId, "withdrawn"),
          findingId: finding.findingId,
          changeKind: "withdrawn",
          claimVersionId: version.claimVersionId,
          labelBefore: labelBefore(finding.findingId),
          labelAfter: "withdrawn",
          publicNote: payload.note,
          linkId: null,
          researchCheckedOn: null,
        },
      };
      touched = [finding.findingId];
      break;
    }
    case "link": {
      const from = findingFor(intent.publicNumber, "ATLAS_FINDING_MISSING");
      const to = findingFor(payload.toPublicNumber, "ATLAS_LINK_TARGET_MISSING");
      assertWritable(from, "ATLAS_FINDING_WITHDRAWN");
      assertWritable(to, "ATLAS_LINK_TARGET_WITHDRAWN");
      // A lead takes no part in same_as, narrows or contradicts, and may only be the older side of replaces.
      const isLead = (finding: AtlasStateFinding) => latestOf(finding).content.verifiedBases.length === 0;
      if (isLead(from) || (payload.relation !== "replaces" && isLead(to))) {
        throw new AtlasWriteConflict("ATLAS_LINK_LEAD");
      }
      const pair = (link: AtlasStateLink) =>
        (link.fromFindingId === from.findingId && link.toFindingId === to.findingId) ||
        (link.fromFindingId === to.findingId && link.toFindingId === from.findingId);
      if (state.links.some((link) => !link.withdrawn && pair(link))) throw new AtlasWriteConflict("ATLAS_LINK_PAIR_TAKEN");
      if (state.links.some((link) =>
        link.fromFindingId === from.findingId && link.toFindingId === to.findingId && link.relation === payload.relation)) {
        throw new AtlasWriteConflict("ATLAS_LINK_ALREADY_RECORDED");
      }
      if (payload.relation === "replaces") {
        if (state.replacesLinks === null) throw new Error("ATLAS_REPLACES_GRAPH_NOT_READ");
        // from replaces to: a cycle if to already leads back to from through replaces links.
        const reached = new Set([to.findingId]);
        const queue = [to.findingId];
        while (queue.length > 0) {
          const next = queue.shift()!;
          for (const link of state.replacesLinks) {
            if (link.fromFindingId === next && !reached.has(link.toFindingId)) {
              reached.add(link.toFindingId);
              queue.push(link.toFindingId);
            }
          }
        }
        if (reached.has(from.findingId)) throw new AtlasWriteConflict("ATLAS_LINK_CYCLE");
      }
      linkId = deterministicUuid(`askrigor:atlas-link:${intent.intentId}`);
      plan.links.push({
        linkId,
        fromFindingId: from.findingId,
        relation: payload.relation,
        toFindingId: to.findingId,
        disagreement: payload.disagreement,
        rationale: payload.rationale,
        claimEdge: {
          edgeId: deterministicUuid(`askrigor:atlas-claim-edge:${intent.intentId}`),
          fromClaimVersionId: latestOf(from).claimVersionId,
          toClaimVersionId: latestOf(to).claimVersionId,
          relation: CLAIM_EDGE_RELATIONS[payload.relation],
        },
      });
      after.links.push({
        linkId,
        fromFindingId: from.findingId,
        toFindingId: to.findingId,
        relation: payload.relation,
        withdrawn: false,
      });
      touched = [from.findingId, to.findingId];
      break;
    }
    case "unlink": {
      const from = findingFor(intent.publicNumber, "ATLAS_FINDING_MISSING");
      const to = findingFor(payload.toPublicNumber, "ATLAS_LINK_TARGET_MISSING");
      const symmetric = payload.relation === "same_as" || payload.relation === "contradicts";
      const link = state.links.find((candidate) => !candidate.withdrawn && candidate.relation === payload.relation &&
        ((candidate.fromFindingId === from.findingId && candidate.toFindingId === to.findingId) ||
          (symmetric && candidate.fromFindingId === to.findingId && candidate.toFindingId === from.findingId)));
      if (link === undefined) throw new AtlasWriteConflict("ATLAS_LINK_MISSING");
      linkId = link.linkId;
      plan.linkWithdrawals.push({ linkId: link.linkId, publicNote: payload.note });
      after.links.find((candidate) => candidate.linkId === link.linkId)!.withdrawn = true;
      touched = [from.findingId, to.findingId];
      break;
    }
  }

  // Labels: the findings this intent touched and their contradicts partners, before and after (design section 3).
  const relabel = new Set(touched);
  for (const link of [...before.links, ...after.links]) {
    if (link.relation !== "contradicts" || link.withdrawn) continue;
    if (touched.includes(link.fromFindingId)) relabel.add(link.toFindingId);
    if (touched.includes(link.toFindingId)) relabel.add(link.fromFindingId);
  }
  const labels: Record<string, AtlasLabel> = {};
  const findingsById = new Map(state.findings.map((finding) => [finding.findingId, finding]));
  for (const findingId of relabel) {
    const labelAfter = atlasLabelOf(findingId, after);
    const finding = findingsById.get(findingId);
    labels[finding?.publicNumber ?? intent.publicNumber] = labelAfter;
    if (primary !== null && primary.findingId === findingId) {
      primary.change.labelAfter = labelAfter;
      if (primary.version !== null && payload.kind !== "withdraw") primary.version.status = statusForLabel(labelAfter);
      continue;
    }
    const labelBeforeValue = labelBefore(findingId);
    if (labelBeforeValue === labelAfter || finding === undefined) continue;
    const status = statusForLabel(labelAfter);
    const version = latestOf(finding).status === status ? null : statusOnlyVersion(finding, status);
    plan.changes.push({
      changeId: changeId(findingId, "relabeled"),
      findingId,
      changeKind: "relabeled",
      claimVersionId: version?.claimVersionId ?? null,
      labelBefore: labelBeforeValue,
      labelAfter,
      publicNote: null,
      linkId,
      researchCheckedOn: null,
    });
  }
  if (primary !== null) plan.changes.unshift(primary.change);

  const toNumber = "toPublicNumber" in payload ? { to_public_number: payload.toPublicNumber, relation: payload.relation } : {};
  plan.event = {
    eventId: plan.event.eventId,
    eventKind: `atlas_finding_${payload.kind}`,
    details: { public_number: intent.publicNumber, intent_kind: payload.kind, ...toNumber, labels },
  };
  plan.receipt = atlasWriterReceipt({
    status: "inserted",
    intent: intentIdentity,
    findingIds: [
      ...(plan.finding === null ? [] : [plan.finding.findingId]),
      ...plan.versions.map(({ findingId }) => findingId),
      ...plan.changes.map(({ findingId }) => findingId),
    ],
    claimVersionIds: plan.versions.map(({ claimVersionId }) => claimVersionId),
    changeIds: plan.changes.map(({ changeId: id }) => id),
    linkIds: [...plan.links.map(({ linkId: id }) => id), ...plan.linkWithdrawals.map(({ linkId: id }) => id)],
    sourceFamilyIds: plan.sourceChecks.map(({ familyId }) => familyId),
  });
  return plan;
}

// The owner's review store -------------------------------------------------------------------------------------------

export interface AtlasIntentState {
  intentKind: AtlasIntentKind;
  status: "PENDING" | "COMPLETED" | "FAILED";
  createdAt: string;
  completedAt: string | null;
  failureCode: AtlasFindingPromotionFailureCode | null;
  failedAt: string | null;
  retryOfIntentId: string | null;
}

export interface AtlasDecisionView {
  cardNumber: number;
  itemKind: AtlasCardItemKind;
  itemNumber: number;
  decision: AtlasCardDecision;
  publicNumber: string | null;
  cardSha256: string;
  ownerReason: string | null;
  intentId: string | null;
  decidedAt: string;
  intent: AtlasIntentState | null;
}

export interface AtlasIntentView {
  intentId: string;
  queuePosition: number;
  intentKind: AtlasIntentKind;
  publicNumber: string;
  /** The payload as stored; its wording may have been erased (textsErasedAt), and then its hash no longer matches. */
  payload: AtlasFindingIntent;
  payloadSha256: string;
  ownerReason: string | null;
  status: "PENDING" | "COMPLETED" | "FAILED";
  createdAt: string;
  completedAt: string | null;
  receipt: AtlasFindingPromotionReceipt | null;
  receiptSha256: string | null;
  failureCode: AtlasFindingPromotionFailureCode | null;
  failedAt: string | null;
  retryOfIntentId: string | null;
  textsErasedAt: string | null;
}

export interface AtlasDecideInput {
  cardNumber: number;
  itemKind: AtlasCardItemKind;
  itemNumber: number;
  decision: AtlasCardDecision;
  cardSha256: string;
  ownerReason: string | null;
  decidedAt: string;
  /** Present for every decision but a rejection. */
  intent: { intentId: string; payload: AtlasFindingIntent; payloadSha256: string } | null;
  /** The finding a re-check names. */
  recheckedPublicNumber: string | null;
}

export interface AtlasRecordIntentInput {
  intentId: string;
  intentKind: Exclude<AtlasIntentKind, "accept" | "recheck">;
  publicNumber: string;
  payload: AtlasFindingIntent;
  payloadSha256: string;
  ownerReason: string | null;
  createdAt: string;
  retryOfIntentId: string | null;
}

/** The review role's five functions (migration 0017), in TypeScript. */
export interface AtlasReviewStore {
  inspectCards(cardNumbers: readonly number[]): Promise<AtlasDecisionView[]>;
  decide(input: AtlasDecideInput): Promise<AtlasDecisionView>;
  recordIntent(input: AtlasRecordIntentInput): Promise<AtlasIntentView>;
  /** The intents on these findings, or, given null, every pending intent and every FAILED one not yet retried. */
  inspectIntents(publicNumbers: readonly string[] | null): Promise<AtlasIntentView[]>;
}

export type AtlasReviewErrorCode = "INPUT_INVALID" | "DECISION_CONFLICT" | "FINDING_NOT_FOUND" | "INTENT_CONFLICT";

export class AtlasReviewError extends Error {
  constructor(readonly code: AtlasReviewErrorCode, message: string) {
    super(message);
  }
}

const REVIEW_ERROR_MESSAGES: Record<AtlasReviewErrorCode, string> = {
  INPUT_INVALID: "The Atlas review request is not valid.",
  DECISION_CONFLICT: "The card item already has a different decision.",
  FINDING_NOT_FOUND: "No accepted finding has that number.",
  INTENT_CONFLICT: "That intent ID already names a different intent.",
};

function reviewError(code: AtlasReviewErrorCode): AtlasReviewError {
  return new AtlasReviewError(code, REVIEW_ERROR_MESSAGES[code]);
}

const DESIRED_INTENT_KIND: Record<AtlasCardDecision, "accept" | "recheck" | null> = {
  accepted: "accept",
  accepted_as_lead: "accept",
  rechecked: "recheck",
  rejected: null,
};

/**
 * The exact input checks decide_atlas_card_item() makes, so both stores refuse the same requests. Returns the intent
 * with its payload as parsed, which is what the stores keep.
 */
function validateDecideInput(input: AtlasDecideInput): AtlasDecideInput["intent"] {
  const reasonValid = input.ownerReason === null ||
    (input.ownerReason === input.ownerReason.trim() && input.ownerReason.length >= 1 && input.ownerReason.length <= 2_000);
  const desired = DESIRED_INTENT_KIND[input.decision];
  const itemValid = (input.itemKind === "finding" && input.itemNumber >= 1 && input.itemNumber <= 5) ||
    (input.itemKind === "open_lead" && input.itemNumber >= 1 && input.itemNumber <= 6);
  let valid = Number.isInteger(input.cardNumber) && input.cardNumber >= 1 && Number.isInteger(input.itemNumber) &&
    itemValid && desired !== undefined && !(input.itemKind === "open_lead" && input.decision === "accepted") &&
    /^[a-f0-9]{64}$/u.test(input.cardSha256) && reasonValid && !Number.isNaN(Date.parse(input.decidedAt));
  let intent: AtlasDecideInput["intent"] = null;
  if (desired === null) {
    valid &&= input.ownerReason !== null && input.intent === null && input.recheckedPublicNumber === null;
  } else if (input.intent === null) {
    valid = false;
  } else {
    const prepared = preparedOrInvalid(input.intent.payload, { payloadSha256: input.intent.payloadSha256 });
    intent = { intentId: input.intent.intentId, payload: prepared.payload, payloadSha256: prepared.payloadSha256 };
    valid &&= prepared.payload.kind === desired;
    if (prepared.payload.kind === "accept") {
      valid &&= input.recheckedPublicNumber === null &&
        prepared.payload.entryKind === (input.decision === "accepted" ? "finding" : "lead") &&
        prepared.payload.leadOrigin === (input.decision === "accepted" ? null
          : input.itemKind === "open_lead" ? "open_lead" : "unverified_finding");
    } else if (prepared.payload.kind === "recheck") {
      valid &&= input.recheckedPublicNumber !== null && PUBLIC_NUMBER.test(input.recheckedPublicNumber) &&
        prepared.payload.publicNumber === input.recheckedPublicNumber;
    }
  }
  if (!valid) throw reviewError("INPUT_INVALID");
  return intent;
}

/** The exact input checks record_atlas_finding_intent() makes; returns the payload as parsed, which the stores keep. */
function validateRecordInput(input: AtlasRecordIntentInput): AtlasFindingIntent {
  const reasonValid = input.ownerReason === null ||
    (input.ownerReason === input.ownerReason.trim() && input.ownerReason.length >= 1 && input.ownerReason.length <= 2_000);
  const valid = (["revise", "withdraw", "link", "unlink", "erase"] as string[]).includes(input.intentKind) &&
    PUBLIC_NUMBER.test(input.publicNumber) && reasonValid && !Number.isNaN(Date.parse(input.createdAt));
  if (!valid) throw reviewError("INPUT_INVALID");
  const prepared = preparedOrInvalid(input.payload, {
    kind: input.intentKind,
    publicNumber: input.publicNumber,
    payloadSha256: input.payloadSha256,
  });
  if (prepared.payload.kind === "accept" || prepared.payload.publicNumber !== input.publicNumber) {
    throw reviewError("INPUT_INVALID");
  }
  return prepared.payload;
}

/** A payload the review stores refuse as input, whatever made it unparseable or mismatched. */
function preparedOrInvalid(
  payload: unknown,
  expected: Parameters<typeof prepareAtlasFindingIntent>[1],
): PreparedAtlasFindingIntent {
  try {
    return prepareAtlasFindingIntent(payload, expected);
  } catch {
    throw reviewError("INPUT_INVALID");
  }
}

interface StoredAtlasIntent {
  intentId: string;
  queuePosition: number;
  intentKind: AtlasIntentKind;
  publicNumber: string;
  payload: AtlasFindingIntent;
  payloadSha256: string;
  ownerReason: string | null;
  status: "PENDING" | "COMPLETED" | "FAILED";
  createdAt: string;
  completedAt: string | null;
  receipt: AtlasFindingPromotionReceipt | null;
  receiptSha256: string | null;
  failureCode: AtlasFindingPromotionFailureCode | null;
  failedAt: string | null;
  retryOfIntentId: string | null;
  textsErasedAt: string | null;
}

interface StoredAtlasDecision {
  cardNumber: number;
  itemKind: AtlasCardItemKind;
  itemNumber: number;
  decision: AtlasCardDecision;
  publicNumber: string | null;
  cardSha256: string;
  ownerReason: string | null;
  intentId: string | null;
  decidedAt: string;
}

/**
 * The review store in memory, with the semantics of migration 0017's functions, for tests and the hermetic end-to-end
 * scenario. Its pending intents are also the in-memory runner's queue.
 */
export class InMemoryAtlasReviewStore implements AtlasReviewStore {
  private readonly decisions = new Map<string, StoredAtlasDecision>();
  private readonly intents = new Map<string, StoredAtlasIntent>();
  private nextPublicNumber = 1_001;
  private nextQueuePosition = 1;

  async inspectCards(cardNumbers: readonly number[]): Promise<AtlasDecisionView[]> {
    return [...this.decisions.values()]
      .filter(({ cardNumber }) => cardNumbers.includes(cardNumber))
      .sort((left, right) => left.cardNumber - right.cardNumber || left.itemKind.localeCompare(right.itemKind) ||
        left.itemNumber - right.itemNumber)
      .map((decision) => this.decisionView(decision));
  }

  async decide(raw: AtlasDecideInput): Promise<AtlasDecisionView> {
    const input = { ...raw, intent: validateDecideInput(raw) };
    const key = `${input.cardNumber}\u0000${input.itemKind}\u0000${input.itemNumber}`;
    const desired = DESIRED_INTENT_KIND[input.decision];
    const current = this.decisions.get(key);
    if (current === undefined) {
      let publicNumber: string | null = null;
      if (desired === "recheck" && !this.liveAccept(input.recheckedPublicNumber!)) throw reviewError("FINDING_NOT_FOUND");
      if (desired !== null) {
        publicNumber = desired === "accept" ? `F-${this.nextPublicNumber++}` : input.recheckedPublicNumber!;
        this.insertIntent({
          intentId: input.intent!.intentId,
          intentKind: desired,
          publicNumber,
          payload: input.intent!.payload,
          payloadSha256: input.intent!.payloadSha256,
          ownerReason: null,
          createdAt: input.decidedAt,
          retryOfIntentId: null,
        });
      }
      this.decisions.set(key, {
        cardNumber: input.cardNumber,
        itemKind: input.itemKind,
        itemNumber: input.itemNumber,
        decision: input.decision,
        publicNumber,
        cardSha256: input.cardSha256,
        ownerReason: input.ownerReason,
        intentId: desired === null ? null : input.intent!.intentId,
        decidedAt: input.decidedAt,
      });
    } else if (current.decision !== input.decision) {
      throw reviewError("DECISION_CONFLICT");
    } else if (desired === null) {
      if (current.cardSha256 !== input.cardSha256 || current.ownerReason !== input.ownerReason) {
        throw reviewError("DECISION_CONFLICT");
      }
    } else {
      const stored = this.intents.get(current.intentId!)!;
      if (desired === "recheck" && current.publicNumber !== input.recheckedPublicNumber) {
        throw reviewError("DECISION_CONFLICT");
      }
      if (stored.status === "FAILED") {
        this.insertIntent({
          intentId: input.intent!.intentId,
          intentKind: desired,
          publicNumber: current.publicNumber!,
          payload: input.intent!.payload,
          payloadSha256: input.intent!.payloadSha256,
          ownerReason: null,
          createdAt: input.decidedAt,
          retryOfIntentId: stored.intentId,
        });
        this.decisions.set(key, {
          ...current,
          cardSha256: input.cardSha256,
          ownerReason: input.ownerReason,
          intentId: input.intent!.intentId,
          decidedAt: input.decidedAt,
        });
      } else if (current.cardSha256 !== input.cardSha256 || stored.payloadSha256 !== input.intent!.payloadSha256 ||
        current.ownerReason !== input.ownerReason) {
        throw reviewError("DECISION_CONFLICT");
      }
    }
    return this.decisionView(this.decisions.get(key)!);
  }

  async recordIntent(raw: AtlasRecordIntentInput): Promise<AtlasIntentView> {
    const input = { ...raw, payload: validateRecordInput(raw) };
    const existing = this.intents.get(input.intentId);
    if (existing !== undefined) {
      if (existing.intentKind !== input.intentKind || existing.publicNumber !== input.publicNumber ||
        existing.payloadSha256 !== input.payloadSha256) {
        throw reviewError("INTENT_CONFLICT");
      }
      return intentView(existing);
    }
    const pending = [...this.intents.values()].find((intent) => intent.intentKind === input.intentKind &&
      intent.publicNumber === input.publicNumber && intent.payloadSha256 === input.payloadSha256 &&
      intent.status === "PENDING");
    if (pending !== undefined) return intentView(pending);
    const to = "toPublicNumber" in input.payload ? input.payload.toPublicNumber : null;
    if (!this.liveAccept(input.publicNumber) || (to !== null && !this.liveAccept(to))) {
      throw reviewError("FINDING_NOT_FOUND");
    }
    if (input.retryOfIntentId !== null) {
      const retried = this.intents.get(input.retryOfIntentId);
      if (retried === undefined || retried.status !== "FAILED" || retried.intentKind !== input.intentKind ||
        retried.publicNumber !== input.publicNumber) {
        throw reviewError("INPUT_INVALID");
      }
    }
    return intentView(this.insertIntent(input));
  }

  async inspectIntents(publicNumbers: readonly string[] | null): Promise<AtlasIntentView[]> {
    const intents = [...this.intents.values()];
    return intents
      .filter((intent) => publicNumbers === null
        ? intent.status === "PENDING" ||
          (intent.status === "FAILED" && !intents.some(({ retryOfIntentId }) => retryOfIntentId === intent.intentId))
        : publicNumbers.includes(intent.publicNumber) ||
          ((intent.intentKind === "link" || intent.intentKind === "unlink") &&
            "toPublicNumber" in intent.payload && publicNumbers.includes(intent.payload.toPublicNumber)))
      .slice(0, 200)
      .map(intentView);
  }

  /** The oldest pending intent: the in-memory runner's queue head. */
  oldestPending(): AtlasStoredIntent | undefined {
    const intent = [...this.intents.values()].find(({ status }) => status === "PENDING");
    return intent === undefined ? undefined : {
      intentId: intent.intentId,
      intentKind: intent.intentKind,
      publicNumber: intent.publicNumber,
      payload: structuredClone(intent.payload),
      payloadSha256: intent.payloadSha256,
      createdAt: intent.createdAt,
    };
  }

  completeIntent(intentId: string, receipt: AtlasFindingPromotionReceipt, receiptSha256: string, at: string): void {
    const intent = this.intents.get(intentId);
    if (intent?.status !== "PENDING") throw new Error("ATLAS_PROMOTION_COMPLETION_CONFLICT");
    this.intents.set(intentId, {
      ...intent,
      status: "COMPLETED",
      completedAt: at,
      receipt: structuredClone(receipt),
      receiptSha256,
    });
  }

  failIntent(intentId: string, failureCode: AtlasFindingPromotionFailureCode, at: string): void {
    const intent = this.intents.get(intentId);
    if (intent?.status !== "PENDING") throw new Error("ATLAS_PROMOTION_FAILURE_CONFLICT");
    this.intents.set(intentId, { ...intent, status: "FAILED", failureCode, failedAt: at });
  }

  private liveAccept(publicNumber: string): boolean {
    return [...this.intents.values()].some((intent) =>
      intent.publicNumber === publicNumber && intent.intentKind === "accept" && intent.status !== "FAILED");
  }

  private insertIntent(input: {
    intentId: string;
    intentKind: AtlasIntentKind;
    publicNumber: string;
    payload: AtlasFindingIntent;
    payloadSha256: string;
    ownerReason: string | null;
    createdAt: string;
    retryOfIntentId: string | null;
  }): StoredAtlasIntent {
    if (this.intents.has(input.intentId)) throw reviewError("INTENT_CONFLICT");
    if (input.intentKind === "accept" && this.liveAccept(input.publicNumber)) throw reviewError("DECISION_CONFLICT");
    const stored: StoredAtlasIntent = {
      intentId: input.intentId,
      queuePosition: this.nextQueuePosition++,
      intentKind: input.intentKind,
      publicNumber: input.publicNumber,
      payload: structuredClone(input.payload),
      payloadSha256: input.payloadSha256,
      ownerReason: input.ownerReason,
      status: "PENDING",
      createdAt: isoInstant(input.createdAt),
      completedAt: null,
      receipt: null,
      receiptSha256: null,
      failureCode: null,
      failedAt: null,
      retryOfIntentId: input.retryOfIntentId,
      textsErasedAt: null,
    };
    this.intents.set(stored.intentId, stored);
    return stored;
  }

  private decisionView(decision: StoredAtlasDecision): AtlasDecisionView {
    const intent = decision.intentId === null ? undefined : this.intents.get(decision.intentId);
    return structuredClone({
      ...decision,
      decidedAt: isoInstant(decision.decidedAt),
      intent: intent === undefined ? null : {
        intentKind: intent.intentKind,
        status: intent.status,
        createdAt: intent.createdAt,
        completedAt: intent.completedAt,
        failureCode: intent.failureCode,
        failedAt: intent.failedAt,
        retryOfIntentId: intent.retryOfIntentId,
      },
    });
  }
}

function intentView(intent: StoredAtlasIntent): AtlasIntentView {
  return structuredClone(intent);
}

export interface PostgresAtlasStoreOptions {
  connectionString: string;
  schema?: string;
  ssl?: PoolConfig["ssl"];
  connectionTimeoutMillis?: number;
  queryTimeoutMillis?: number;
  statementTimeoutMillis?: number;
}

export function assertSafeAtlasSchema(schema: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(schema)) throw new Error("INVALID_POSTGRES_SCHEMA");
  return schema;
}

export function atlasPool(options: PostgresAtlasStoreOptions): Pool {
  return new Pool({
    connectionString: options.connectionString,
    ssl: options.ssl,
    connectionTimeoutMillis: options.connectionTimeoutMillis,
    query_timeout: options.queryTimeoutMillis,
    statement_timeout: options.statementTimeoutMillis,
  });
}

/** The review store through the review role's five SECURITY DEFINER functions; it reads no table directly. */
export class PostgresAtlasReviewStore implements AtlasReviewStore {
  readonly schema: string;
  private readonly pool: Pool;

  constructor(options: PostgresAtlasStoreOptions) {
    this.schema = assertSafeAtlasSchema(options.schema ?? "living_evidence");
    this.pool = atlasPool(options);
  }

  async inspectCards(cardNumbers: readonly number[]): Promise<AtlasDecisionView[]> {
    const result = await this.pool.query<DecisionRow>(
      `SELECT * FROM ${this.schema}.inspect_atlas_cards($1::integer[])`,
      [[...cardNumbers]],
    );
    return result.rows.map(decisionFromRow);
  }

  async decide(raw: AtlasDecideInput): Promise<AtlasDecisionView> {
    const input = { ...raw, intent: validateDecideInput(raw) };
    const result = await this.call<DecisionRow>(
      `SELECT * FROM ${this.schema}.decide_atlas_card_item(
         $1::integer, $2::text, $3::integer, $4::text, $5::text, $6::text, $7::timestamptz, $8::uuid, $9::jsonb,
         $10::text, $11::text
       )`,
      [
        input.cardNumber, input.itemKind, input.itemNumber, input.decision, input.cardSha256, input.ownerReason,
        input.decidedAt, input.intent?.intentId ?? null,
        input.intent === null ? null : JSON.stringify(input.intent.payload),
        input.intent?.payloadSha256 ?? null, input.recheckedPublicNumber,
      ],
    );
    if (result.rows.length !== 1) throw new Error("ATLAS_DECISION_RESULT_MISSING");
    return decisionFromRow(result.rows[0]!);
  }

  async recordIntent(raw: AtlasRecordIntentInput): Promise<AtlasIntentView> {
    const input = { ...raw, payload: validateRecordInput(raw) };
    const result = await this.call<IntentRow>(
      `SELECT * FROM ${this.schema}.record_atlas_finding_intent(
         $1::uuid, $2::text, $3::text, $4::jsonb, $5::text, $6::text, $7::timestamptz, $8::uuid
       )`,
      [
        input.intentId, input.intentKind, input.publicNumber, JSON.stringify(input.payload), input.payloadSha256,
        input.ownerReason, input.createdAt, input.retryOfIntentId,
      ],
    );
    if (result.rows.length !== 1) throw new Error("ATLAS_INTENT_RESULT_MISSING");
    return intentFromRow(result.rows[0]!);
  }

  async inspectIntents(publicNumbers: readonly string[] | null): Promise<AtlasIntentView[]> {
    const result = await this.pool.query<IntentRow>(
      `SELECT * FROM ${this.schema}.inspect_atlas_finding_intents($1::text[])`,
      [publicNumbers === null ? null : [...publicNumbers]],
    );
    return result.rows.map(intentFromRow);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async call<Row extends object>(sql: string, values: unknown[]): Promise<{ rows: Row[] }> {
    try {
      return await this.pool.query(sql, values) as unknown as { rows: Row[] };
    } catch (error) {
      throw mapAtlasReviewError(error);
    }
  }
}

interface DecisionRow {
  card_number: number;
  item_kind: AtlasCardItemKind;
  item_number: number;
  decision: AtlasCardDecision;
  public_number: string | null;
  card_sha256: string;
  owner_reason: string | null;
  intent_id: string | null;
  decided_at: Date | string;
  intent_kind: AtlasIntentKind | null;
  intent_status: "PENDING" | "COMPLETED" | "FAILED" | null;
  intent_created_at: Date | string | null;
  intent_completed_at: Date | string | null;
  intent_failure_code: string | null;
  intent_failed_at: Date | string | null;
  intent_retry_of_intent_id: string | null;
}

interface IntentRow {
  intent_id: string;
  queue_position: string | number;
  intent_kind: AtlasIntentKind;
  public_number: string;
  payload_json: unknown;
  payload_sha256: string;
  owner_reason: string | null;
  status: "PENDING" | "COMPLETED" | "FAILED";
  created_at: Date | string;
  completed_at: Date | string | null;
  receipt_json: unknown;
  receipt_sha256: string | null;
  failure_code: string | null;
  failed_at: Date | string | null;
  retry_of_intent_id: string | null;
  texts_erased_at: Date | string | null;
}

const failureCodeSchema = z.enum(ATLAS_FINDING_PROMOTION_FAILURE_CODES);

function nullableInstant(value: Date | string | null): string | null {
  return value === null ? null : isoInstant(value);
}

function decisionFromRow(row: DecisionRow): AtlasDecisionView {
  return {
    cardNumber: Number(row.card_number),
    itemKind: row.item_kind,
    itemNumber: Number(row.item_number),
    decision: row.decision,
    publicNumber: row.public_number,
    cardSha256: row.card_sha256,
    ownerReason: row.owner_reason,
    intentId: row.intent_id,
    decidedAt: isoInstant(row.decided_at),
    intent: row.intent_kind === null || row.intent_status === null || row.intent_created_at === null ? null : {
      intentKind: row.intent_kind,
      status: row.intent_status,
      createdAt: isoInstant(row.intent_created_at),
      completedAt: nullableInstant(row.intent_completed_at),
      failureCode: row.intent_failure_code === null ? null : failureCodeSchema.parse(row.intent_failure_code),
      failedAt: nullableInstant(row.intent_failed_at),
      retryOfIntentId: row.intent_retry_of_intent_id,
    },
  };
}

/**
 * An intent row as the review sees it. Its payload is re-validated against its hash unless its wording was erased,
 * and a completed intent's receipt against the receipt hash.
 */
function intentFromRow(row: IntentRow): AtlasIntentView {
  const textsErasedAt = nullableInstant(row.texts_erased_at);
  const payload = textsErasedAt === null
    ? prepareAtlasFindingIntent(row.payload_json, {
      kind: row.intent_kind,
      publicNumber: row.public_number,
      payloadSha256: row.payload_sha256,
    }).payload
    : row.payload_json as AtlasFindingIntent;
  const receipt = row.receipt_json === null ? null : atlasPromotionReceiptSchema.parse(row.receipt_json);
  if (receipt !== null && sha256(stableJson(receipt)) !== row.receipt_sha256) {
    throw new Error("ATLAS_PROMOTION_RECEIPT_SHA256_MISMATCH");
  }
  return {
    intentId: row.intent_id,
    queuePosition: Number(row.queue_position),
    intentKind: row.intent_kind,
    publicNumber: row.public_number,
    payload,
    payloadSha256: row.payload_sha256,
    ownerReason: row.owner_reason,
    status: row.status,
    createdAt: isoInstant(row.created_at),
    completedAt: nullableInstant(row.completed_at),
    receipt,
    receiptSha256: row.receipt_sha256,
    failureCode: row.failure_code === null ? null : failureCodeSchema.parse(row.failure_code),
    failedAt: nullableInstant(row.failed_at),
    retryOfIntentId: row.retry_of_intent_id,
    textsErasedAt,
  };
}

function mapAtlasReviewError(error: unknown): unknown {
  if (!(error instanceof Error)) return error;
  const mappings: Array<[string, AtlasReviewErrorCode]> = [
    ["ATLAS_REVIEW_INPUT_INVALID", "INPUT_INVALID"],
    ["ATLAS_DECISION_CONFLICT", "DECISION_CONFLICT"],
    ["ATLAS_FINDING_NOT_FOUND", "FINDING_NOT_FOUND"],
    ["ATLAS_INTENT_CONFLICT", "INTENT_CONFLICT"],
  ];
  const matched = mappings.find(([needle]) => error.message.includes(needle));
  return matched === undefined ? error : reviewError(matched[1]);
}

// The canonical store in memory ---------------------------------------------------------------------------------------

/** The canonical writer: applies one owner-decided intent, or replays one it already applied. */
export interface AtlasCanonicalWriter {
  contributeAtlasFinding(intent: AtlasStoredIntent): Promise<AtlasWriterReceipt>;
}

interface InMemoryCanonicalRows {
  applications: Array<{ intentId: string; intentKind: AtlasIntentKind; publicNumber: string; payloadSha256: string;
    runId: string; appliedAt: string }>;
  runs: AtlasWritePlan["run"][];
  topics: Array<{ topicId: string; canonicalKey: string; label: string }>;
  questions: Array<{ questionId: string; topicId: string; normalizedQuestion: string }>;
  claims: Array<{ claimId: string; questionId: string }>;
  findings: Array<NonNullable<AtlasWritePlan["finding"]> & { runId: string }>;
  versions: Array<AtlasPlannedFindingVersion & { runId: string }>;
  bindings: AtlasPlannedBinding[];
  sourceFamilies: AtlasState["sourceFamilies"];
  sourceVersions: AtlasState["sourceVersions"];
  sourceChecks: Array<AtlasWritePlan["sourceChecks"][number] & { runId: string }>;
  links: Array<AtlasWritePlan["links"][number] & { runId: string; decidedAt: string }>;
  linkWithdrawals: Array<AtlasWritePlan["linkWithdrawals"][number] & { runId: string; decidedAt: string }>;
  changes: Array<AtlasPlannedChange & { intentId: string; runId: string; decidedAt: string }>;
  events: Array<AtlasWritePlan["event"] & { runId: string; payloadSha256: string }>;
}

/**
 * The canonical Atlas store in memory, for tests and the hermetic end-to-end scenario: the same planner and the same
 * rows as the PostgreSQL writer, and the reader's view of them (all of it, which every request's state includes).
 */
export class InMemoryAtlasCanonicalStore implements AtlasCanonicalWriter, AtlasStateReader {
  private rows: InMemoryCanonicalRows = {
    applications: [], runs: [], topics: [], questions: [], claims: [], findings: [], versions: [], bindings: [],
    sourceFamilies: [], sourceVersions: [], sourceChecks: [], links: [], linkWithdrawals: [], changes: [], events: [],
  };

  constructor(private readonly runtime: { now?: () => string } = {}) {}

  /** A canonical topic another writer made, for tests. */
  seedTopic(topic: { topicId: string; canonicalKey: string; label: string }): void {
    this.rows.topics.push({ ...topic });
  }

  /** A canonical source family another writer made, for tests. */
  seedSourceFamily(family: AtlasState["sourceFamilies"][number]): void {
    this.rows.sourceFamilies.push(structuredClone(family));
  }

  /** Every stored row, for tests that scan what the Atlas holds. */
  snapshot(): InMemoryCanonicalRows {
    return structuredClone(this.rows);
  }

  async readAtlasState(_request: AtlasStateRequest): Promise<AtlasState> {
    return this.state();
  }

  async contributeAtlasFinding(intent: AtlasStoredIntent): Promise<AtlasWriterReceipt> {
    return this.apply(prepareStoredAtlasIntent(intent), this.runtime.now?.() ?? new Date().toISOString());
  }

  /** Applies a prepared intent atomically: it plans first, and a conflict leaves every row as it was. */
  apply(intent: PreparedAtlasStoredIntent, appliedAt: string): AtlasWriterReceipt {
    const applied = this.rows.applications.find(({ intentId }) => intentId === intent.intentId);
    if (applied !== undefined) {
      if (applied.intentKind !== intent.intentKind || applied.publicNumber !== intent.publicNumber ||
        applied.payloadSha256 !== intent.payloadSha256) {
        throw new AtlasWriteConflict("ATLAS_INTENT_APPLICATION_MISMATCH");
      }
      return this.replayReceipt(intent);
    }
    const plan = planAtlasWrite(intent, this.state());
    const next = structuredClone(this.rows);
    const runId = plan.run.runId;
    next.runs.push(plan.run);
    next.applications.push({ ...plan.intent, runId, appliedAt: isoInstant(appliedAt) });
    if (plan.topic !== null) next.topics.push(plan.topic);
    if (plan.question !== null) next.questions.push(plan.question);
    if (plan.claim !== null) next.claims.push(plan.claim);
    if (plan.finding !== null) next.findings.push({ ...plan.finding, runId });
    for (const family of plan.sourceFamilies) {
      next.sourceFamilies.push({ ...family, identifiers: [] });
    }
    for (const identifier of plan.sourceIdentifiers) {
      next.sourceFamilies.find(({ familyId }) => familyId === identifier.familyId)!.identifiers
        .push({ scheme: identifier.scheme, value: identifier.value });
    }
    for (const family of next.sourceFamilies) family.identifiers.sort(identifierOrder);
    next.sourceVersions.push(...plan.sourceVersions);
    next.sourceChecks.push(...plan.sourceChecks.map((check) => ({ ...check, runId })));
    next.versions.push(...plan.versions.map((version) => ({ ...version, runId })));
    next.bindings.push(...plan.bindings);
    next.links.push(...plan.links.map((link) => ({ ...link, runId, decidedAt: plan.decidedAt })));
    next.linkWithdrawals.push(...plan.linkWithdrawals.map((withdrawal) =>
      ({ ...withdrawal, runId, decidedAt: plan.decidedAt })));
    next.changes.push(...plan.changes.map((change) =>
      ({ ...change, intentId: intent.intentId, runId, decidedAt: plan.decidedAt })));
    next.events.push({ ...plan.event, runId, payloadSha256: intent.payloadSha256 });
    this.rows = next;
    return plan.receipt;
  }

  private replayReceipt(intent: PreparedAtlasStoredIntent): AtlasWriterReceipt {
    const runId = atlasRunId(intent.intentId);
    return atlasWriterReceipt({
      status: "idempotent_replay",
      intent,
      findingIds: [
        ...this.rows.findings.filter((row) => row.runId === runId).map(({ findingId }) => findingId),
        ...this.rows.versions.filter((row) => row.runId === runId).map(({ findingId }) => findingId),
        ...this.rows.changes.filter((row) => row.runId === runId).map(({ findingId }) => findingId),
      ],
      claimVersionIds: this.rows.versions.filter((row) => row.runId === runId).map(({ claimVersionId }) => claimVersionId),
      changeIds: this.rows.changes.filter((row) => row.runId === runId).map(({ changeId }) => changeId),
      linkIds: [
        ...this.rows.links.filter((row) => row.runId === runId).map(({ linkId }) => linkId),
        ...this.rows.linkWithdrawals.filter((row) => row.runId === runId).map(({ linkId }) => linkId),
      ],
      sourceFamilyIds: this.rows.sourceChecks.filter((row) => row.runId === runId).map(({ familyId }) => familyId),
    });
  }

  private state(): AtlasState {
    const rows = this.rows;
    const withdrawn = new Set(rows.linkWithdrawals.map(({ linkId }) => linkId));
    return structuredClone({
      findings: rows.findings.map((finding) => {
        const claim = rows.claims.find(({ claimId }) => claimId === finding.claimId)!;
        const question = rows.questions.find(({ questionId }) => questionId === claim.questionId)!;
        return {
          findingId: finding.findingId,
          publicNumber: finding.publicNumber,
          claimId: finding.claimId,
          questionId: claim.questionId,
          topicId: question.topicId,
          entryKind: finding.entryKind,
          leadOrigin: finding.leadOrigin,
          versions: rows.versions
            .filter(({ findingId }) => findingId === finding.findingId)
            .sort((left, right) => left.versionNumber - right.versionNumber)
            .map((version) => ({
              claimVersionId: version.claimVersionId,
              versionNumber: version.versionNumber,
              status: version.status,
              content: version.content,
              researchCheckedOn: version.researchCheckedOn,
              madeWith: version.madeWith,
              cardWordingKey: version.cardWordingKey,
              acceptedWordingKey: version.acceptedWordingKey,
              editedAtAcceptance: version.editedAtAcceptance,
              bindings: rows.bindings
                .filter(({ claimVersionId }) => claimVersionId === version.claimVersionId)
                .map((binding) => ({
                  sourceVersionId: binding.sourceVersionId,
                  familyId: rows.sourceVersions.find(({ versionId }) => versionId === binding.sourceVersionId)!.familyId,
                  locator: binding.locator,
                  polarity: binding.polarity,
                  capabilityCeiling: binding.capabilityCeiling,
                  limitations: binding.limitations,
                })),
            })),
        };
      }),
      links: rows.links.map((link) => ({
        linkId: link.linkId,
        fromFindingId: link.fromFindingId,
        toFindingId: link.toFindingId,
        relation: link.relation,
        disagreement: link.disagreement,
        withdrawn: withdrawn.has(link.linkId),
      })),
      replacesLinks: rows.links
        .filter((link) => link.relation === "replaces" && !withdrawn.has(link.linkId))
        .map(({ fromFindingId, toFindingId }) => ({ fromFindingId, toFindingId })),
      topics: rows.topics,
      questions: rows.questions,
      sourceFamilies: rows.sourceFamilies,
      sourceVersions: rows.sourceVersions,
    });
  }
}

// The runner ----------------------------------------------------------------------------------------------------------

export interface AtlasFindingPromotionReceipt {
  receiptSchema: "askrigor.atlas-finding-promotion.v1";
  intentId: string;
  intentKind: AtlasIntentKind;
  publicNumber: string;
  payloadSha256: string;
  writerReceipt: AtlasWriterReceipt;
  promotedAt: string;
}

const uuidSchema = z.string().uuid();
const atlasWriterReceiptSchema = z.object({
  receiptSchema: z.literal("askrigor.atlas-writer.v1"),
  status: z.enum(["inserted", "idempotent_replay"]),
  intentId: uuidSchema,
  intentKind: z.enum(ATLAS_INTENT_KINDS),
  publicNumber: publicNumberSchema,
  payloadSha256: sha256Hex,
  runId: uuidSchema,
  eventId: uuidSchema,
  findingIds: z.array(uuidSchema),
  claimVersionIds: z.array(uuidSchema),
  changeIds: z.array(uuidSchema),
  linkIds: z.array(uuidSchema),
  sourceFamilyIds: z.array(uuidSchema),
}).strict();

export const atlasPromotionReceiptSchema = z.object({
  receiptSchema: z.literal("askrigor.atlas-finding-promotion.v1"),
  intentId: uuidSchema,
  intentKind: z.enum(ATLAS_INTENT_KINDS),
  publicNumber: publicNumberSchema,
  payloadSha256: sha256Hex,
  writerReceipt: atlasWriterReceiptSchema,
  promotedAt: z.iso.datetime({ offset: true }),
}).strict();

export interface AtlasFindingPromotionFailure {
  status: "failed";
  intentId: string;
  intentKind: AtlasIntentKind;
  publicNumber: string;
  failureCode: AtlasFindingPromotionFailureCode;
  failedAt: string;
}

export type AtlasFindingPromotionResult =
  | { status: "no_pending_promotion" }
  | { status: "promoted"; receipt: AtlasFindingPromotionReceipt; receiptSha256: string }
  /** Another activation holds the oldest pending intent; it stays pending for that activation. */
  | { status: "atlas_queue_busy" }
  /** The oldest pending intent is of a kind this build does not apply yet; it stays pending, and so does the queue. */
  | { status: "intent_kind_not_applied"; intentId: string; intentKind: AtlasIntentKind }
  | AtlasFindingPromotionFailure;

/** One activation: at most one promotion, after any intents that ended FAILED on the way to it. */
export interface AtlasFindingPromotionRun {
  result:
    | Exclude<AtlasFindingPromotionResult, AtlasFindingPromotionFailure>
    | { status: "failure_limit_reached" };
  failed: AtlasFindingPromotionFailure[];
}

/** One pass over the oldest pending intent, atomic with its canonical write in the PostgreSQL store. */
export interface AtlasPromotionUnit {
  readonly intent: AtlasStoredIntent;
  /** Applies the intent to the canonical store; a thrown error leaves nothing written. */
  apply(intent: PreparedAtlasStoredIntent, appliedAt: string): Promise<AtlasWriterReceipt>;
  complete(receipt: AtlasFindingPromotionReceipt, receiptSha256: string, completedAt: string): Promise<void>;
  fail(failureCode: AtlasFindingPromotionFailureCode, failedAt: string): Promise<void>;
  /** Leaves the intent pending and writes nothing; a no-op after complete or fail. */
  abandon(): Promise<void>;
}

export interface AtlasPromotionStore {
  /** The oldest pending intent, strictly first in, first out: "none", or "busy" when another activation holds it. */
  begin(): Promise<AtlasPromotionUnit | "none" | "busy">;
  close(): Promise<void>;
}

/** An activation stops after this many FAILED intents, so a long backlog of conflicts drains over a few runs. */
export const ATLAS_PROMOTION_FAILURES_PER_ACTIVATION = 20;

/**
 * Promotes owner-decided Atlas intents, oldest first (choice 7: at most one promotion per activation). An intent whose
 * canonical write conflicts deterministically ends FAILED with its code and the next one is tried; a transient error
 * stops the activation and leaves its intent pending.
 */
export class AtlasFindingPromotionRunner {
  private readonly now: () => string;

  constructor(private readonly store: AtlasPromotionStore, runtime: { now?: () => string } = {}) {
    this.now = runtime.now ?? (() => new Date().toISOString());
  }

  async promoteAccepted(options: {
    maximumFailures?: number;
    /** Told of each failure as it is recorded, so it is reported even if a later intent stops the activation. */
    onFailed?: (failure: AtlasFindingPromotionFailure) => void;
  } = {}): Promise<AtlasFindingPromotionRun> {
    const failed: AtlasFindingPromotionFailure[] = [];
    while (failed.length < (options.maximumFailures ?? ATLAS_PROMOTION_FAILURES_PER_ACTIVATION)) {
      const result = await this.promoteNext();
      if (result.status !== "failed") return { result, failed };
      failed.push(result);
      options.onFailed?.(result);
    }
    return { result: { status: "failure_limit_reached" }, failed };
  }

  async promoteNext(): Promise<AtlasFindingPromotionResult> {
    const unit = await this.store.begin();
    if (unit === "none") return { status: "no_pending_promotion" };
    if (unit === "busy") return { status: "atlas_queue_busy" };
    try {
      const stored = unit.intent;
      if (!(ATLAS_INTENT_KINDS_WRITTEN as readonly string[]).includes(stored.intentKind)) {
        await unit.abandon();
        return { status: "intent_kind_not_applied", intentId: stored.intentId, intentKind: stored.intentKind };
      }
      // A stored payload that no longer parses or hashes as recorded is an incident, not a conflict: it stays pending.
      const intent = prepareStoredAtlasIntent(stored);
      let writerReceipt: AtlasWriterReceipt;
      try {
        writerReceipt = await unit.apply(intent, this.now());
      } catch (error) {
        const failureCode = atlasPromotionFailureCode(error);
        if (failureCode === undefined) throw error;
        const failedAt = this.now();
        await unit.fail(failureCode, failedAt);
        return {
          status: "failed",
          intentId: intent.intentId,
          intentKind: intent.intentKind,
          publicNumber: intent.publicNumber,
          failureCode,
          failedAt,
        };
      }
      if (writerReceipt.intentId !== intent.intentId || writerReceipt.payloadSha256 !== intent.payloadSha256 ||
        writerReceipt.publicNumber !== intent.publicNumber) {
        throw new Error("ATLAS_PROMOTION_WRITER_RECEIPT_MISMATCH");
      }
      const promotedAt = this.now();
      const receipt: AtlasFindingPromotionReceipt = {
        receiptSchema: "askrigor.atlas-finding-promotion.v1",
        intentId: intent.intentId,
        intentKind: intent.intentKind,
        publicNumber: intent.publicNumber,
        payloadSha256: intent.payloadSha256,
        writerReceipt,
        promotedAt,
      };
      const receiptSha256 = sha256(stableJson(receipt));
      await unit.complete(receipt, receiptSha256, promotedAt);
      return { status: "promoted", receipt, receiptSha256 };
    } catch (error) {
      await unit.abandon();
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.store.close();
  }
}

/** The runner's queue and canonical store in memory, sharing the review store's intents. */
export class InMemoryAtlasPromotionStore implements AtlasPromotionStore {
  constructor(
    private readonly review: InMemoryAtlasReviewStore,
    private readonly canonical: InMemoryAtlasCanonicalStore,
  ) {}

  async begin(): Promise<AtlasPromotionUnit | "none" | "busy"> {
    const intent = this.review.oldestPending();
    if (intent === undefined) return "none";
    const unit: AtlasPromotionUnit = {
      intent,
      apply: async (prepared, appliedAt) => this.canonical.apply(prepared, appliedAt),
      complete: async (receipt, receiptSha256, completedAt) => {
        this.review.completeIntent(intent.intentId, receipt, receiptSha256, completedAt);
      },
      fail: async (failureCode, failedAt) => {
        this.review.failIntent(intent.intentId, failureCode, failedAt);
      },
      abandon: async () => undefined,
    };
    return unit;
  }

  async close(): Promise<void> {}
}
