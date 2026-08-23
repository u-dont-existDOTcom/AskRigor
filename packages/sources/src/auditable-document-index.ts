import { z } from "zod";

import {
  jatsStudyIndexSchema,
  type JatsStudyIndex
} from "./jats-study-index.js";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

export const auditableDocumentBlockSchema = z.object({
  block_id: z.string().regex(/^(?:jats|pdf)_[0-9]{6}_[a-f0-9]{12}$/u),
  kind: z.enum([
    "abstract",
    "paragraph",
    "table",
    "figure_caption",
    "list_item",
    "page_text"
  ]),
  section_path: z.array(z.string().min(1).max(500)).max(20),
  page_number: z.number().int().positive().optional(),
  text: z.string().min(1).max(200_000),
  text_sha256: sha256Schema
}).strict();

export const auditableDocumentIndexSchema = z.object({
  source: z.object({
    provider: z.enum(["europe_pmc", "unpaywall_open_location"]),
    primary_identifier: z.string().min(1).max(2_048),
    canonical_url: z.string().url(),
    pmcid: z.string().regex(/^PMC[1-9]\d{0,15}$/u).optional(),
    pmid: z.string().optional(),
    doi: z.string().optional(),
    title: z.string().optional(),
    version: z.string().optional(),
    format: z.enum(["jats_xml", "pdf_text"]),
    content_sha256: sha256Schema,
    document_completeness: z.literal("full_text_with_body"),
    identity_verification: z.enum(["pmcid_exact", "doi_exact", "title_match"])
  }).strict(),
  section_paths: z.array(z.array(z.string().min(1).max(500)).max(20)).max(10_000),
  blocks: z.array(auditableDocumentBlockSchema).min(1).max(100_000)
}).strict();

export type AuditableDocumentBlock = z.output<typeof auditableDocumentBlockSchema>;
export type AuditableDocumentIndex = z.output<typeof auditableDocumentIndexSchema>;

export function toAuditableDocumentIndex(
  rawIndex: JatsStudyIndex
): AuditableDocumentIndex {
  const index = jatsStudyIndexSchema.parse(rawIndex);
  if (index.source.document_completeness !== "full_text_with_body") {
    throw new Error("Auditable document requires complete full text");
  }
  return auditableDocumentIndexSchema.parse({
    source: {
      provider: "europe_pmc",
      primary_identifier: index.source.pmcid,
      canonical_url: `https://europepmc.org/articles/${index.source.pmcid}`,
      pmcid: index.source.pmcid,
      ...(index.source.pmid === undefined ? {} : { pmid: index.source.pmid }),
      ...(index.source.doi === undefined ? {} : { doi: index.source.doi }),
      ...(index.source.title === undefined ? {} : { title: index.source.title }),
      format: "jats_xml",
      content_sha256: index.source.content_sha256,
      document_completeness: "full_text_with_body",
      identity_verification: "pmcid_exact"
    },
    section_paths: index.section_paths,
    blocks: index.blocks
  });
}
