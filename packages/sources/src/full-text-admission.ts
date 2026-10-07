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
export const fullTextCandidateSchema = z.object({
  url: z.string().url(),
  source_class: sourceClassSchema,
  retrieval_provider: z.literal("direct"),
  state: acquisitionStateSchema.exclude(["PRIMARY_OA_ROUTES_EXHAUSTED"]),
  identity_verification: z.enum(["doi_exact", "title_match", "not_verified"]),
  sections_observed: z.array(z.enum(["methods", "results", "discussion"])),
  completeness: z.enum(["full_text", "partial_text", "abstract_only", "unavailable"]),
  retrieved_at: z.string().datetime()
}).strict();
export type FullTextCandidate = z.output<typeof fullTextCandidateSchema>;
export interface FrozenArticleIdentity {
  doi: string;
  pmid?: string;
  title?: string;
  first_author?: string;
  year?: string;
  journal?: string;
  pii?: string;
  publisher_host?: string;
}

// Exact block/line titles only. These are structural labels, not a judgment
// about whether prose actually describes methods or scientific findings.
const FORMS = {
  methods: ["methods", "method", "materials", "materials and methods", "materials & methods", "method and materials", "subjects", "patients", "patients and methods", "subjects and methods", "case report", "experimental procedures", "experimental methods", "methodology", "méthodologie", "méthodes", "matériel et méthodes", "matériels et méthodes", "patients et méthodes", "métodos", "materiales y métodos", "material y métodos", "pacientes y métodos", "materiais e métodos", "material e métodos", "methoden", "material und methoden", "patienten und methoden", "metodi", "materiali e metodi", "pazienti e metodi"],
  results: ["results", "result", "résultats", "resultados", "ergebnisse", "risultati"],
  discussion: ["discussion", "discussions", "conclusion", "conclusions", "discussion and conclusions", "discussion et conclusion", "discussion et conclusions", "discusión", "discusión y conclusiones", "conclusiones", "discussão", "conclusão", "conclusões", "diskussion", "schlussfolgerung", "schlussfolgerungen", "fazit", "discussione", "conclusioni"]
} as const;
const ABSTRACT = ["abstract", "summary", "résumé", "resumen", "resumo", "zusammenfassung", "riassunto"];
const IDENTITY_BODY_BOUNDARIES = ["introduction", "background", "introducción", "introdução", "einleitung", "introduzione", "contexte"];
const REFERENCES = ["references", "bibliography", "références", "referencias", "referências", "literatur", "literaturverzeichnis", "bibliografia", "reference list"];
export const FULL_TEXT_BODY_MIN_CHARACTERS = 6_000;
export function normalizedHeading(value: string): string {
  return value.normalize("NFKC").toLowerCase().trim()
    .replace(/^(?:\d+(?:\.\d+)*[.)]?|[ivx]+[.)])\s+/u, "")
    .replace(/[:.\s]+$/u, "");
}
export function sectionKind(value: string): "methods" | "results" | "discussion" | "abstract" | "references" | undefined {
  const heading = normalizedHeading(value);
  for (const key of ["methods", "results", "discussion"] as const) {
    if ((FORMS[key] as readonly string[]).includes(heading)) return key;
  }
  if (ABSTRACT.includes(heading)) return "abstract";
  if (REFERENCES.includes(heading)) return "references";
  return undefined;
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
  let current: ReturnType<typeof sectionKind>;
  for (const block of blocks) {
    if (block.kind === "abstract") continue;
    // Paths establish scope for JATS/HTML; PDF page paths preserve line scope.
    const pathKinds = block.section_path.map(sectionKind);
    if (pathKinds.includes("abstract") || pathKinds.includes("references")) continue;
    const pathKind = pathKinds.findLast((kind) => kind !== undefined);
    if (pathKind !== undefined) current = pathKind;
    for (const line of block.text.split(/\r?\n/u)) {
      const heading = sectionKind(line);
      if (heading !== undefined) { current = heading; continue; }
      if (current === "abstract" || current === "references") continue;
      const length = line.trim().length;
      // Front matter, navigation and metadata don't inflate the body floor.
      if (current === undefined) unsectionedCharacters += length;
      if (current === "methods" || current === "results" || current === "discussion") {
        bodyCharacters += length;
        counts[current] += length;
      }
    }
  }
  const sections = (["methods", "results", "discussion"] as const).filter((key) => counts[key] >= 100);
  const state = sections.length === 3 && bodyCharacters >= FULL_TEXT_BODY_MIN_CHARACTERS
    ? "FULL_TEXT_READABLE" : bodyCharacters > 0 || unsectionedCharacters >= FULL_TEXT_BODY_MIN_CHARACTERS ? "PARTIAL_TEXT_READABLE" : "ABSTRACT_ONLY";
  return { state, sections_observed: sections, body_characters: bodyCharacters,
    completeness: state === "FULL_TEXT_READABLE" ? "full_text" : state === "PARTIAL_TEXT_READABLE" ? "partial_text" : "abstract_only" };
}
export function normalizeIdentityText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/gu, " ");
}
export function verifyArticleIdentity(identity: FrozenArticleIdentity, text: string, ownTitle?: string): "doi_exact" | "title_match" | undefined {
  if (ownTitle !== undefined && identity.title !== undefined &&
      normalizeIdentityText(ownTitle) !== normalizeIdentityText(identity.title)) return undefined;
  // Only the document's identity area counts: a citation in a review's body
  // or references is not the review's identity. PDF line breaks are retained.
  const lines = text.slice(0, 8_000).split(/\r?\n/u);
  const boundary = lines.findIndex((line) => sectionKind(line) !== undefined || IDENTITY_BODY_BOUNDARIES.includes(normalizedHeading(line)));
  const front = (boundary < 0 ? text : lines.slice(0, boundary).join("\n")).slice(0, 8_000);
  const escaped = identity.doi.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  if (new RegExp(`(?:^|[^a-z0-9/])${escaped}(?=$|[\\s<>.,;)])`, "u").test(front.toLowerCase())) return "doi_exact";
  if (identity.title === undefined) return undefined;
  const normalized = ` ${normalizeIdentityText(front)} `;
  const title = normalizeIdentityText(identity.title);
  const surname = identity.first_author?.split(",")[0]?.trim().replace(/\s+(?:[\p{Lu}]\.?){1,5}$/u, "");
  const supporting = surname !== undefined && normalized.includes(` ${normalizeIdentityText(surname)} `) ||
    identity.year !== undefined && normalized.includes(` ${identity.year} `);
  return title.length > 0 && normalized.includes(` ${title} `) && supporting ? "title_match" : undefined;
}

// Optional www is enumerated, rather than trusting arbitrary suffix matches.
export const RESEARCHER_UPLOAD_HOSTS = ["academia.edu", "www.academia.edu", "researchgate.net", "www.researchgate.net"];
export const REPOSITORY_HOSTS = ["europepmc.org", "www.europepmc.org", "ncbi.nlm.nih.gov", "www.ncbi.nlm.nih.gov", "pmc.ncbi.nlm.nih.gov", "arxiv.org", "www.arxiv.org", "biorxiv.org", "www.biorxiv.org", "medrxiv.org", "www.medrxiv.org", "zenodo.org", "www.zenodo.org", "figshare.com", "www.figshare.com", "hal.science", "www.hal.science", "core.ac.uk", "www.core.ac.uk"];
export const PUBLISHER_HOSTS = ["sciencedirect.com", "www.sciencedirect.com", "link.springer.com", "nature.com", "www.nature.com", "onlinelibrary.wiley.com", "academic.oup.com", "journals.sagepub.com", "tandfonline.com", "www.tandfonline.com", "journals.plos.org", "mdpi.com", "www.mdpi.com", "frontiersin.org", "www.frontiersin.org", "bmj.com", "www.bmj.com"];
export function classifySource(url: string, declared: SourceClass | undefined, publisherHost?: string): SourceClass {
  const host = new URL(url).hostname.toLowerCase();
  if (RESEARCHER_UPLOAD_HOSTS.includes(host)) return "researcher_upload";
  if (REPOSITORY_HOSTS.includes(host)) return "repository";
  if (PUBLISHER_HOSTS.includes(host) || host === publisherHost) return "publisher";
  return declared ?? "other";
}
export function sourceClassRank(value: SourceClass): number {
  return { publisher: 4, repository: 4, author_copy: 3, researcher_upload: 2, other: 1 }[value];
}
export function hasFailedFullTextAcquisition(body: { discovery_attempts?: readonly { result?: string }[]; acquisition_state?: string; candidates?: readonly { state?: string }[] }): boolean {
  return body.discovery_attempts?.some(({ result }) => result === "error") === true ||
    [body.acquisition_state, ...(body.candidates ?? []).map(({ state }) => state)]
      .some((state) => state === "CANDIDATE_FOUND_FETCH_BLOCKED" || state === "PROVIDER_UNAVAILABLE");
}
