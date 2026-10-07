import { z } from "zod";

import type { AuditableDocumentBlock } from "./auditable-document-index.js";

export const acquisitionStateSchema = z.enum([
  "FULL_TEXT_READABLE", "PARTIAL_TEXT_READABLE", "ABSTRACT_ONLY",
  "CANDIDATE_FOUND_FETCH_BLOCKED", "PAYWALL_OR_LOGIN_REQUIRED",
  "NO_COPY_FOUND_AFTER_EXPANDED_SEARCH", "PROVIDER_UNAVAILABLE",
  "IDENTITY_MISMATCH", "PRIMARY_OA_ROUTES_EXHAUSTED"
]);
export type AcquisitionState = z.output<typeof acquisitionStateSchema>;
export const sourceClassSchema = z.enum(["publisher", "repository", "author_copy", "researcher_upload", "other"]);
export type SourceClass = z.output<typeof sourceClassSchema>;
export const candidateUrlsSchema = z.array(z.object({
  url: z.string().url().max(4_000).refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port;
  }, "Candidate URLs require HTTPS without credentials or custom ports"),
  declared_class: sourceClassSchema.optional()
}).strict()).min(1).max(5);
export type CandidateUrl = z.output<typeof candidateUrlsSchema>[number];
export const publicCopySearchSchema = z.object({
  queries: z.array(z.string().trim().min(3).max(400)).min(2).max(12)
}).strict();
export const publicCopySearchResultSchema = z.object({
  status: z.enum(["declared", "not_declared", "missing_exact_identifiers"]),
  missing: z.array(z.enum(["doi", "title"])).optional(),
  query_count: z.number().int().min(0).max(12)
}).strict();
export type PublicCopySearch = z.output<typeof publicCopySearchSchema>;
export type PublicCopySearchResult = z.output<typeof publicCopySearchResultSchema>;
export const fullTextCandidateSchema = z.object({
  url: z.string().url(),
  source_class: sourceClassSchema,
  source_class_basis: z.enum(["known_host", "metadata_publisher_host", "declared", "unrecognized_host"]),
  retrieval_provider: z.literal("direct"),
  state: acquisitionStateSchema.exclude(["PRIMARY_OA_ROUTES_EXHAUSTED"]),
  identity_verification: z.enum(["doi_exact", "pii_exact", "title_match", "not_verified"]),
  sections_observed: z.array(z.enum(["methods", "results", "discussion"])),
  completeness: z.enum(["full_text", "partial_text", "abstract_only", "unavailable"]),
  retrieved_at: z.string().datetime()
}).strict();
export type FullTextCandidate = z.output<typeof fullTextCandidateSchema>;
export interface FrozenArticleIdentity {
  doi: string;
  pmid?: string;
  title?: string;
  title_variants?: readonly string[];
  first_author?: string;
  year?: string;
  journal?: string;
  pii?: string;
  publisher_host?: string;
}

// Exact block/line titles only. These are structural labels, not a judgment
// about whether prose actually describes methods or scientific findings.
const FORMS = {
  methods: ["methods", "method", "materials", "materials and methods", "materials & methods", "method and materials", "methods and materials", "experimental", "experimental section", "subjects", "patients", "patients and methods", "subjects and methods", "case report", "experimental procedures", "experimental methods", "methodology", "méthodologie", "méthodes", "matériel et méthodes", "matériels et méthodes", "patients et méthodes", "métodos", "materiales y métodos", "material y métodos", "pacientes y métodos", "materiais e métodos", "material e métodos", "methoden", "material und methoden", "patienten und methoden", "metodi", "materiali e metodi", "pazienti e metodi"],
  results: ["results", "result", "résultats", "resultados", "ergebnisse", "risultati"],
  discussion: ["discussion", "discussions", "conclusion", "conclusions", "discussion and conclusions", "discussion and conclusion", "discussion et conclusion", "discussion et conclusions", "discusión", "discusión y conclusiones", "conclusiones", "discussão", "conclusão", "conclusões", "diskussion", "schlussfolgerung", "schlussfolgerungen", "fazit", "discussione", "conclusioni"]
} as const;
const COMBINED_RESULTS_DISCUSSION = ["results and discussion", "résultats et discussion", "resultados y discusión", "resultados e discussão", "ergebnisse und diskussion", "risultati e discussione"];
const CASE_REPORTS = ["case report", "case presentation", "case description", "case history", "présentation du cas", "observation", "cas clinique", "caso clínico", "presentación del caso", "relato de caso", "fallbericht", "kasuistik", "caso clinico", "presentazione del caso"];
const ABSTRACT = ["abstract", "summary", "résumé", "resumen", "resumo", "zusammenfassung", "riassunto"];
const IDENTITY_BODY_BOUNDARIES = ["introduction", "background", "introducción", "introdução", "einleitung", "introduzione", "contexte"];
const REFERENCES = ["references", "bibliography", "références", "referencias", "referências", "literatur", "literaturverzeichnis", "bibliografia", "reference list"];
export const FULL_TEXT_BODY_MIN_CHARACTERS = 6_000;
export function normalizedHeading(value: string): string {
  return value.normalize("NFKC").toLowerCase().trim()
    .replace(/^(?:\d+(?:\.\d+)*[.)]?|[ivx]+[.)])\s+/u, "")
    .replace(/[:.\s]+$/u, "");
}
type SectionKind = "methods" | "results" | "discussion" | "abstract" | "references";
export function sectionKinds(value: string): SectionKind[] {
  const heading = normalizedHeading(value);
  if (COMBINED_RESULTS_DISCUSSION.includes(heading)) return ["results", "discussion"];
  if (CASE_REPORTS.includes(heading)) return ["methods", "results"];
  const kinds: SectionKind[] = (["methods", "results", "discussion"] as const)
    .filter((key) => (FORMS[key] as readonly string[]).includes(heading));
  if (ABSTRACT.includes(heading)) kinds.push("abstract");
  if (REFERENCES.includes(heading)) kinds.push("references");
  return kinds;
}
export function sectionKind(value: string): SectionKind | undefined {
  return sectionKinds(value)[0];
}
export interface FullTextAdmission {
  state: "FULL_TEXT_READABLE" | "PARTIAL_TEXT_READABLE" | "ABSTRACT_ONLY";
  sections_observed: FullTextCandidate["sections_observed"];
  completeness: "full_text" | "partial_text" | "abstract_only";
  body_characters: number;
}
export function admitFullText(blocks: readonly Pick<AuditableDocumentBlock, "text" | "kind" | "section_path">[]): FullTextAdmission {
  const counts = { methods: 0, results: 0, discussion: 0 };
  let bodyCharacters = 0;
  let unsectionedCharacters = 0;
  let current: SectionKind[] = [];
  for (const block of blocks) {
    if (block.kind === "abstract") continue;
    // Paths establish scope for JATS/HTML; PDF page paths preserve line scope.
    const pathKinds = block.section_path.map(sectionKinds);
    if (pathKinds.some((kinds) => kinds.includes("abstract") || kinds.includes("references"))) continue;
    const pathKind = pathKinds.findLast((kinds) => kinds.length > 0);
    if (pathKind !== undefined) current = pathKind;
    for (const line of block.text.split(/\r?\n/u)) {
      const heading = sectionKinds(line);
      if (heading.length > 0) { current = heading; continue; }
      if (current.includes("abstract") || current.includes("references")) continue;
      const length = line.trim().length;
      // Front matter, navigation and metadata don't inflate the body floor.
      if (current.length === 0) unsectionedCharacters += length;
      if (current.length > 0) {
        bodyCharacters += length;
        for (const kind of current) {
          if (kind === "methods" || kind === "results" || kind === "discussion") counts[kind] += length;
        }
      }
    }
  }
  const sections = (["methods", "results", "discussion"] as const).filter((key) => counts[key] >= 1_000);
  const state = sections.length === 3 && bodyCharacters >= FULL_TEXT_BODY_MIN_CHARACTERS
    ? "FULL_TEXT_READABLE" : bodyCharacters > 0 || unsectionedCharacters >= FULL_TEXT_BODY_MIN_CHARACTERS ? "PARTIAL_TEXT_READABLE" : "ABSTRACT_ONLY";
  return { state, sections_observed: sections, body_characters: bodyCharacters,
    completeness: state === "FULL_TEXT_READABLE" ? "full_text" : state === "PARTIAL_TEXT_READABLE" ? "partial_text" : "abstract_only" };
}
export function normalizeIdentityText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/gu, " ");
}
export function compactIdentityText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}
export function titleVariants(...titles: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  return titles.filter((title): title is string => {
    if (title === undefined) return false;
    const normalized = normalizeIdentityText(title);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}
export function checkPublicCopySearch(identity: FrozenArticleIdentity, search?: PublicCopySearch): PublicCopySearchResult {
  if (search === undefined) return { status: "not_declared", query_count: 0 };
  const missing: Array<"doi" | "title"> = [];
  if (!search.queries.some((query) => query.toLowerCase().includes(identity.doi.toLowerCase()))) missing.push("doi");
  const titles = titleVariants(identity.title, ...(identity.title_variants ?? []));
  if (titles.length > 0 && !search.queries.some((query) =>
    titles.some((title) => normalizeIdentityText(query).includes(normalizeIdentityText(title)))
  )) missing.push("title");
  return { status: missing.length === 0 ? "declared" : "missing_exact_identifiers",
    ...(missing.length === 0 ? {} : { missing }), query_count: search.queries.length };
}
export function verifyArticleIdentity(
  identity: FrozenArticleIdentity,
  text: string,
  ownTitle?: string,
  options: { pdf?: boolean; citation_doi?: string } = {}
): "doi_exact" | "pii_exact" | "title_match" | undefined {
  const titles = titleVariants(identity.title, ...(identity.title_variants ?? []));
  if (ownTitle !== undefined && titles.length > 0 &&
      !titles.some((title) => compactIdentityText(ownTitle) === compactIdentityText(title))) return undefined;
  if (options.citation_doi !== undefined) {
    const doi = options.citation_doi.trim().toLowerCase().replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/iu, "");
    return doi === identity.doi.toLowerCase() ? "doi_exact" : undefined;
  }
  // PDFs supply pages one and two, including footers, up to references. Other
  // formats retain the front area so quotations in a review cannot verify it.
  const area = options.pdf ? text : text.slice(0, 8_000);
  const lines = area.split(/\r?\n/u);
  const boundary = lines.findIndex((line) => options.pdf
    ? sectionKind(line) === "references"
    : sectionKind(line) !== undefined || IDENTITY_BODY_BOUNDARIES.includes(normalizedHeading(line)));
  const front = boundary < 0 ? area : lines.slice(0, boundary).join("\n");
  const escaped = identity.doi.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  if (new RegExp(`(?:^|[^a-z0-9/])${escaped}(?=$|[\\s<>.,;)])`, "u").test(front.toLowerCase())) return "doi_exact";
  const compact = compactIdentityText(front);
  const pii = compactIdentityText(identity.pii ?? "");
  if (pii.length >= 10 && compact.includes(pii)) return "pii_exact";
  const normalized = ` ${normalizeIdentityText(front)} `;
  const surname = identity.first_author?.split(",")[0]?.trim().replace(/\s+(?:[\p{Lu}]\.?){1,5}$/u, "");
  const supporting = surname !== undefined && normalized.includes(` ${normalizeIdentityText(surname)} `) ||
    identity.year !== undefined && normalized.includes(` ${identity.year} `);
  return titles.some((title) => {
    const target = compactIdentityText(title);
    return target.length >= 24 && compact.includes(target);
  }) && supporting ? "title_match" : undefined;
}

// Optional www is enumerated, rather than trusting arbitrary suffix matches.
export const RESEARCHER_UPLOAD_HOSTS = ["academia.edu", "www.academia.edu", "researchgate.net", "www.researchgate.net"];
export const REPOSITORY_HOSTS = ["europepmc.org", "www.europepmc.org", "ncbi.nlm.nih.gov", "www.ncbi.nlm.nih.gov", "pmc.ncbi.nlm.nih.gov", "arxiv.org", "www.arxiv.org", "biorxiv.org", "www.biorxiv.org", "medrxiv.org", "www.medrxiv.org", "zenodo.org", "www.zenodo.org", "figshare.com", "www.figshare.com", "hal.science", "www.hal.science", "core.ac.uk", "www.core.ac.uk"];
export const PUBLISHER_HOSTS = ["sciencedirect.com", "www.sciencedirect.com", "link.springer.com", "nature.com", "www.nature.com", "onlinelibrary.wiley.com", "academic.oup.com", "journals.sagepub.com", "tandfonline.com", "www.tandfonline.com", "journals.plos.org", "mdpi.com", "www.mdpi.com", "frontiersin.org", "www.frontiersin.org", "bmj.com", "www.bmj.com"];
export function sourceClassification(url: string, declared: SourceClass | undefined, publisherHost?: string): Pick<FullTextCandidate, "source_class" | "source_class_basis"> {
  const host = new URL(url).hostname.toLowerCase();
  if (RESEARCHER_UPLOAD_HOSTS.includes(host)) return { source_class: "researcher_upload", source_class_basis: "known_host" };
  if (REPOSITORY_HOSTS.includes(host)) return { source_class: "repository", source_class_basis: "known_host" };
  if (PUBLISHER_HOSTS.includes(host)) return { source_class: "publisher", source_class_basis: "known_host" };
  if (host === publisherHost) return { source_class: "publisher", source_class_basis: "metadata_publisher_host" };
  if (declared === "author_copy" || declared === "repository") return { source_class: declared, source_class_basis: "declared" };
  return { source_class: "other", source_class_basis: "unrecognized_host" };
}
export function classifySource(url: string, declared: SourceClass | undefined, publisherHost?: string): SourceClass {
  return sourceClassification(url, declared, publisherHost).source_class;
}
export function sourceClassRank(value: SourceClass): number {
  return { publisher: 4, repository: 4, author_copy: 3, researcher_upload: 2, other: 1 }[value];
}
export function hasFailedFullTextAcquisition(body: { discovery_attempts?: readonly { result?: string }[]; acquisition_state?: string; candidates?: readonly { state?: string }[] }): boolean {
  return body.discovery_attempts?.some(({ result }) => result === "error") === true ||
    [body.acquisition_state, ...(body.candidates ?? []).map(({ state }) => state)]
      .some((state) => state === "PROVIDER_UNAVAILABLE");
}
export function canSignFullTextLead(body: Parameters<typeof hasFailedFullTextAcquisition>[0] & { public_copy_search?: { status?: string } }): boolean {
  return !hasFailedFullTextAcquisition(body) && body.public_copy_search?.status === "declared";
}
