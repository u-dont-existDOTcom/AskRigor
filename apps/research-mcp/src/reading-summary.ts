import { z } from "zod";

/**
 * How much of the research AskRigor read, in one sentence with exact counts (the owner, 6 November 2026: "make sure we
 * get it working so it tells you to what extent it read the studies"). Two ChatGPT answers made with AskRigor that
 * morning named some studies' readings and not others, and neither said how many studies the research found against
 * how many it read. HRP StudyReadDepthDisclosure already asks the answer to say beside each supporting study what was
 * read; this adds the research-wide count, from the verified receipts alone.
 *
 * A study is one by its identifiers as the receipts tie them: a PubMed record ties its PMID, DOI and PMC copy; a
 * full-text reading or audit ties the copy's identifiers; a Europe PMC search's record ties its own (the receipt's
 * record groups, rg, since 6 November 2026). Each study counts once, at the deepest reading its receipts show: its
 * methods audited, its full text read, part of it readable, its abstract, or its record alone. A study only a search
 * listed counts among the records listed and not read, and only when every search receipt names its records exactly: a
 * PubMed search's identifiers are its records' PMIDs, one each, and a Europe PMC search's records are grouped from
 * 6 November 2026 on; an older Europe PMC receipt that listed records leaves that count out, rather than estimate it.
 * They are named records, not studies (the review of #422): a search lists books, theses and patents too, which no
 * record's identifiers tell apart. ClinicalTrials.gov's registrations are not counted: nothing ties a registration to
 * its paper exactly. Every research receipt passed counts, earlier research in the same chat included. Exact, the same
 * in any language: identifiers are forms, not meanings. A paper listed under one identifier and read under another that
 * no receipt ties counts in both.
 */

/** A verified research receipt, as the counts read it. */
export interface SummaryReceipt { kind: string; claims: Readonly<Record<string, string | string[]>> }

/** How deep each study was read, deepest first. */
const DEPTHS = ["audited", "full_text", "part_text", "abstract", "record", "listed"] as const;
type Depth = typeof DEPTHS[number];
const DEPTH_ORDER: Readonly<Record<Depth, number>> = { audited: 6, full_text: 5, part_text: 4, abstract: 3, record: 2, listed: 1 };

export const readingSummarySchema = z.object({
  audited: z.number().int().nonnegative(),
  audited_from_ai_copies: z.number().int().nonnegative(),
  full_text: z.number().int().nonnegative(),
  full_text_from_ai_copies: z.number().int().nonnegative(),
  part_text: z.number().int().nonnegative(),
  abstract_only: z.number().int().nonnegative(),
  record_only: z.number().int().nonnegative(),
  listed_not_read: z.number().int().nonnegative().optional()
    .describe("Records the searches listed that no receipt shows read (books, theses and patents among them, which " +
      "the records don't tell apart); left out when a search receipt doesn't name its records exactly."),
  sentence: z.string()
}).strict();
export type ReadingSummary = z.output<typeof readingSummarySchema>;

const KEYS = ["id", "doi", "pmid", "pmcid"] as const;
const text = (value: string | string[] | undefined): string => typeof value === "string" ? value : "";
const list = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : typeof value === "string" ? [value] : value;

/** One paper's identifiers across receipts, joined as each receipt ties them. */
class StudyGroups {
  private readonly parent = new Map<string, string>();

  add(ids: readonly string[]): string | undefined {
    if (ids.length === 0) return undefined;
    for (const id of ids) if (!this.parent.has(id)) this.parent.set(id, id);
    for (const id of ids.slice(1)) {
      const left = this.root(ids[0]!);
      const right = this.root(id);
      if (left !== right) this.parent.set(right, left);
    }
    return ids[0];
  }

  root(id: string): string {
    if (!this.parent.has(id)) return id;
    let root = id;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    // Each identifier on the way points at the root, so later lookups are short.
    for (let at = id; at !== root;) {
      const next = this.parent.get(at)!;
      this.parent.set(at, root);
      at = next;
    }
    return root;
  }
}

/**
 * The research-wide counts and their sentence, from this call's verified receipts, or undefined when none is a
 * research receipt. normalize is the final check's identifier normalizer (a DOI in lower case without its resolver,
 * a PMID's digits, a PMCID in capitals).
 */
export function researchReadingSummary(
  receipts: readonly SummaryReceipt[],
  normalize: (value: string) => string
): ReadingSummary | undefined {
  const research = receipts.filter(({ kind }) => !NOT_RESEARCH.has(kind));
  if (research.length === 0) return undefined;
  const groups = new StudyGroups();
  // Each reading, by an identifier of the study it read, and whether the copy read was one the AI found.
  const readings: Array<{ id: string; depth: Depth; aiCopy: boolean }> = [];
  const identifiers = (claims: SummaryReceipt["claims"], keys: readonly string[]) => [...new Set(keys
    .map((key) => text(claims[key])).filter((value) => value !== "").map(normalize))];
  let listedExact = true;
  for (const { kind, claims } of research) {
    const aiCopy = claims.retrieval_provider === "client_search_index";
    if (kind === "study_audit" || kind === "review_audit" || kind === "full_text_read") {
      const id = groups.add(identifiers(claims, KEYS));
      if (id !== undefined) readings.push({ id, depth: kind === "full_text_read" ? "full_text" : "audited", aiCopy });
    } else if (kind === "pubmed_record") {
      const id = groups.add(identifiers(claims, ["pmid", "doi", "pmcid"]));
      if (id !== undefined) readings.push({ id, depth: claims.abs === "0" ? "record" : "abstract", aiCopy: false });
    } else if (kind === "doi_resolution") {
      const id = groups.add(identifiers(claims, ["doi"]));
      if (id !== undefined) readings.push({ id, depth: "record", aiCopy: false });
    } else if (kind === "full_text_lead") {
      // A lead's identifiers are those the AI asked for, which no copy confirmed, so they tie nothing: its reading goes
      // to one of them. Only a copy whose abstract or part of whose text was readable was read at all.
      const depth = claims.state === "ABSTRACT_ONLY" ? "abstract" as const
        : claims.state === "PARTIAL_TEXT_READABLE" ? "part_text" as const : undefined;
      const id = identifiers(claims, ["doi", "pmid", "pmcid"])[0];
      if (depth !== undefined && id !== undefined) readings.push({ id: groups.add([id])!, depth, aiCopy: false });
    } else if (kind === "literature_search") {
      const records = searchRecords(claims, normalize);
      if (records === undefined) {
        listedExact = false;
        continue;
      }
      for (const record of records) {
        const id = groups.add(record);
        if (id !== undefined) readings.push({ id, depth: "listed", aiCopy: false });
      }
    }
  }
  // Each study's deepest reading, and for a full text or an audit, whether every such reading was of the AI's copy.
  const studies = new Map<string, { depth: Depth; aiCopy: boolean }>();
  for (const { id, depth, aiCopy } of readings) {
    const root = groups.root(id);
    const known = studies.get(root);
    if (known === undefined || DEPTH_ORDER[depth] > DEPTH_ORDER[known.depth]) {
      studies.set(root, { depth, aiCopy });
    } else if (depth === known.depth && !aiCopy) {
      known.aiCopy = false;
    }
  }
  const count = (depth: Depth, aiCopy?: boolean) => [...studies.values()]
    .filter((study) => study.depth === depth && (aiCopy === undefined || study.aiCopy === aiCopy)).length;
  const counts = {
    audited: count("audited"),
    audited_from_ai_copies: count("audited", true),
    full_text: count("full_text"),
    full_text_from_ai_copies: count("full_text", true),
    part_text: count("part_text"),
    abstract_only: count("abstract"),
    record_only: count("record"),
    ...(listedExact ? { listed_not_read: count("listed") } : {})
  };
  return { ...counts, sentence: readingSummarySentence(counts) };
}

// A plain answer registered before research, a filed research map and a finalization receipt are not research.
const NOT_RESEARCH: ReadonlySet<string> = new Set(["plain_answer", "research_map", "finalization"]);

/**
 * The records a literature search's receipt names, each as its identifiers, or undefined when the receipt doesn't
 * name them exactly. A PubMed search's records carry their PMIDs alone, one each. A Europe PMC search's receipt groups
 * each record's identifiers (rg: the places of its DOI, PMID and PMCID in ids, or, for a record with none of them, its
 * source and the place of its own id), from 6 November 2026; an older one that returned records names them only as one
 * list. ClinicalTrials.gov's registrations are left out.
 */
export function searchRecords(
  claims: SummaryReceipt["claims"],
  normalize: (value: string) => string
): string[][] | undefined {
  const ids = list(claims.ids);
  const source = text(claims.src);
  if (source === "ctgov") return [];
  if (source === "pubmed") return ids.map((id) => [normalize(id)]);
  // Owner answer 283a: OpenAlex records are grouped as Europe PMC's are, their own ids kept apart by their source.
  if (source !== "europepmc" && source !== "openalex") return undefined;
  if (claims.rg === undefined) return text(claims.ret) === "0" || ids.length === 0 ? [] : undefined;
  const records: string[][] = [];
  for (const group of list(claims.rg)) {
    const own = /^([A-Z]{2,8}):(\d+)$/u.exec(group);
    if (own !== null) {
      const id = ids[Number(own[2])];
      if (id === undefined) return undefined;
      records.push([`${source}:${own[1]}:${id}`]);
      continue;
    }
    if (!/^\d+(?:\.\d+)*$/u.test(group)) return undefined;
    const record = group.split(".").map((place) => ids[Number(place)]);
    if (record.some((id) => id === undefined)) return undefined;
    records.push([...new Set((record as string[]).map(normalize))]);
  }
  return records;
}

/**
 * Europe PMC search records grouped for the receipt (rg): for each record, the places in ids of its DOI, PMID and PMCID,
 * joined by "."; a record with none of them gives its source and the place of its own id ("AGR:12"). ids is the
 * receipt's list, in its order.
 */
export function europePmcRecordGroups(records: readonly Record<string, unknown>[], ids: readonly string[]): string[] {
  const place = new Map(ids.map((id, index) => [id, index]));
  return records.map((record) => {
    const typed = ["doi", "pmid", "pmcid"].flatMap((key) => {
      const value = record[key];
      const at = typeof value === "string" ? place.get(value) : undefined;
      return at === undefined ? [] : [at];
    });
    if (typed.length > 0) return [...new Set(typed)].join(".");
    const at = typeof record.id === "string" ? place.get(record.id) : undefined;
    const source = typeof record.source === "string" && /^[A-Z]{2,8}$/u.test(record.source) ? record.source : "X";
    return at === undefined ? "" : `${source}:${at}`;
  });
}

const studies = (count: number) => count === 1 ? "study" : "studies";

/**
 * The sentence, from the counts: "AskRigor read 3 studies in full and checked their methods, and 3 more only as
 * abstracts; its searches listed 41 other records it didn't read." Each count is exact; one left out stays out.
 */
export function readingSummarySentence(counts: Omit<ReadingSummary, "sentence">): string {
  const parts: string[] = [];
  const lead = (count: number) => `${count} ${parts.length === 0 ? studies(count) : "more"}`;
  const fromAiCopies = (all: number, ai: number) => ai === 0 ? ""
    : ai === all ? all === 1 ? " (from a copy the AI found)" : " (all from copies the AI found)"
      : ` (${ai} of them from copies the AI found)`;
  if (counts.audited > 0) {
    parts.push(`${lead(counts.audited)} in full and checked ${counts.audited === 1 ? "its" : "their"} methods` +
      fromAiCopies(counts.audited, counts.audited_from_ai_copies));
  }
  if (counts.full_text > 0) {
    parts.push(`${lead(counts.full_text)} in full${fromAiCopies(counts.full_text, counts.full_text_from_ai_copies)}`);
  }
  if (counts.part_text > 0) parts.push(`${lead(counts.part_text)} only in part`);
  if (counts.abstract_only > 0) {
    parts.push(`${lead(counts.abstract_only)} only as ${counts.abstract_only === 1 ? "an abstract" : "abstracts"}`);
  }
  if (counts.record_only > 0) {
    parts.push(`${lead(counts.record_only)} only by ${counts.record_only === 1 ? "its title and record"
      : "their titles and records"}`);
  }
  const read = parts.length === 0 ? "AskRigor read no studies"
    : `AskRigor read ${parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`}`;
  const listed = counts.listed_not_read ?? 0;
  const records = listed === 1 ? "record" : "records";
  return listed === 0 ? `${read}.`
    : `${read}; its searches listed ${listed} ${parts.length === 0 ? records : `other ${records}`} it didn't read.`;
}
