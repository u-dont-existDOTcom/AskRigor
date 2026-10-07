import { createHash } from "node:crypto";

import { auditableDocumentIndexSchema, type AuditableDocumentBlock, type AuditableDocumentIndex } from "./auditable-document-index.js";
import { admitFullText, classifySource, sectionKind, verifyArticleIdentity, type CandidateUrl, type FrozenArticleIdentity, type FullTextCandidate } from "./full-text-admission.js";
import { fetchCandidateDocument, UpstreamHttpError, type DiscoveredDocumentFetchRuntime } from "./http.js";
import { extractAuditablePdf } from "./unpaywall-full-text.js";

export interface CandidateFullTextRuntime {
  fetchDocument?: typeof fetchCandidateDocument;
  documentFetchRuntime?: DiscoveredDocumentFetchRuntime;
  extractPdf?: typeof extractAuditablePdf;
  now?: () => Date;
}
export async function acquireCandidateFullText(
  candidate: CandidateUrl,
  identity: FrozenArticleIdentity,
  runtime: CandidateFullTextRuntime = {}
): Promise<{ candidate: FullTextCandidate; index?: AuditableDocumentIndex }> {
  let record: FullTextCandidate = {
    url: candidate.url, source_class: classifySource(candidate.url, candidate.declared_class, identity.publisher_host),
    retrieval_provider: "direct", state: "CANDIDATE_FOUND_FETCH_BLOCKED", identity_verification: "not_verified",
    sections_observed: [], completeness: "unavailable", retrieved_at: (runtime.now?.() ?? new Date()).toISOString()
  };
  try {
    const fetched = await (runtime.fetchDocument ?? fetchCandidateDocument)(candidate.url, runtime.documentFetchRuntime);
    record = { ...record, url: fetched.finalUrl,
      source_class: classifySource(fetched.finalUrl, candidate.declared_class, identity.publisher_host) };
    const hash = createHash("sha256").update(fetched.bytes).digest("hex");
    if (new TextDecoder("ascii").decode(fetched.bytes.slice(0, 5)) === "%PDF-") {
      const index = await (runtime.extractPdf ?? extractAuditablePdf)({
        doi: identity.doi, title: identity.title, identity, canonicalUrl: fetched.finalUrl, bytes: fetched.bytes,
        onInspection: (inspection) => {
          record = { ...record, state: inspection.state, sections_observed: inspection.sections_observed,
            completeness: inspection.completeness };
        },
        onIdentity: (verification) => { record.identity_verification = verification; }
      });
      if (index === undefined) {
        if (record.completeness === "unavailable") record.state = "IDENTITY_MISMATCH";
        return { candidate: record };
      }
      const admission = admitFullText(index.blocks);
      record = { ...record, state: admission.state, sections_observed: admission.sections_observed,
        completeness: admission.completeness, identity_verification: index.source.identity_verification === "doi_exact" ? "doi_exact" : "title_match" };
      return { candidate: record, ...(admission.state === "FULL_TEXT_READABLE"
        ? { index: { ...index, source: { ...index.source, provider: "direct_candidate" } } } : {}) };
    }
    const type = fetched.contentType?.split(";")[0]?.trim().toLowerCase();
    if (!["text/html", "application/xhtml+xml", "text/plain"].includes(type ?? "")) return { candidate: record };
    const charset = fetched.contentType?.match(/;\s*charset\s*=\s*["']?([^;"'\s]+)/iu)?.[1] ?? "utf-8";
    const raw = new TextDecoder(charset, { fatal: true }).decode(fetched.bytes)
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, "");
    const isHtml = type !== "text/plain";
    const extracted = isHtml ? extractHtmlText(raw) : { text: raw };
    // These are exact access-control structures/labels, not scientific or
    // free-prose semantic judgments. Unknown short pages remain abstract-only.
    const accessState = isHtml ? htmlAccessState(raw, extracted.text) : undefined;
    if (accessState !== undefined) return { candidate: { ...record, state: accessState } };
    const verification = verifyArticleIdentity(identity, extracted.text, extracted.title);
    if (verification === undefined) return { candidate: { ...record, state: "IDENTITY_MISMATCH" } };
    const blocks = textBlocks(extracted.text);
    const admission = admitFullText(blocks);
    record = { ...record, state: admission.state, identity_verification: verification,
      sections_observed: admission.sections_observed, completeness: admission.completeness };
    if (admission.state !== "FULL_TEXT_READABLE") return { candidate: record };
    const index = auditableDocumentIndexSchema.parse({
      source: { provider: "direct_candidate", primary_identifier: identity.doi, canonical_url: fetched.finalUrl,
        doi: identity.doi, ...(identity.pmid === undefined ? {} : { pmid: identity.pmid }),
        ...(identity.title === undefined ? {} : { title: identity.title }), format: isHtml ? "html_text" : "plain_text",
        content_sha256: hash, document_completeness: "full_text_with_body", identity_verification: verification },
      blocks, section_paths: [...new Map(blocks.map((block) => [JSON.stringify(block.section_path), block.section_path])).values()]
    });
    return { candidate: record, index };
  } catch (error) {
    const status = error instanceof UpstreamHttpError ? error.status : undefined;
    const state = status === 401 || status === 402 ? "PAYWALL_OR_LOGIN_REQUIRED"
      : status === 404 || status === 410 ? "NO_COPY_FOUND_AFTER_EXPANDED_SEARCH"
        : status !== undefined && status >= 500 ? "PROVIDER_UNAVAILABLE" : "CANDIDATE_FOUND_FETCH_BLOCKED";
    return { candidate: { ...record, state } };
  }
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    agrave: "à", aacute: "á", acirc: "â", atilde: "ã", auml: "ä", aring: "å", aelig: "æ", ccedil: "ç",
    egrave: "è", eacute: "é", ecirc: "ê", euml: "ë", igrave: "ì", iacute: "í", icirc: "î", iuml: "ï",
    ntilde: "ñ", ograve: "ò", oacute: "ó", ocirc: "ô", otilde: "õ", ouml: "ö", oslash: "ø",
    ugrave: "ù", uacute: "ú", ucirc: "û", uuml: "ü", yacute: "ý", yuml: "ÿ", szlig: "ß",
    rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…",
    alpha: "α", beta: "β", gamma: "γ", delta: "δ", mu: "μ", pi: "π", sigma: "σ", omega: "ω", minus: "−"
  };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]{2,12});/giu, (whole, entity: string) => {
    if (!entity.startsWith("#")) {
      const decoded = named[entity.toLowerCase()];
      return decoded === undefined ? whole : entity[0] === entity[0]?.toUpperCase() ? decoded.toUpperCase() : decoded;
    }
    const code = entity.toLowerCase().startsWith("#x") ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : "";
  });
}
/** Small static extractor: block tags preserve heading/paragraph boundaries.
 * Scripts, templates, hidden blocks and navigation never supply article text.
 * No script execution, subresource requests, cookies, or browser rendering. */
export function extractHtmlText(html: string): { text: string; title?: string } {
  const citationTitle = html.match(/<meta\b[^>]*name\s*=\s*["']citation_title["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>/iu)?.[1]
    ?? html.match(/<meta\b[^>]*content\s*=\s*["']([^"']+)["'][^>]*name\s*=\s*["']citation_title["'][^>]*>/iu)?.[1];
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/iu)?.[1];
  const title = citationTitle ?? (h1 === undefined ? undefined : h1.replace(/<[^>]*>/gu, " "));
  const visible = html.replace(/<!--[\s\S]*?-->/gu, "")
    .replace(/<(script|style|template|noscript|nav|footer)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, "")
    .replace(/<([a-z][\w:-]*)\b[^>]*(?:\shidden(?:\s|=|>)|aria-hidden\s*=\s*["']true["']|style\s*=\s*["'][^"']*display\s*:\s*none)[^>]*>[\s\S]*?<\/\1\s*>/giu, "")
    .replace(/<\/?(?:h[1-6]|p|div|section|article|li|tr|br|title|strong|b)\b[^>]*>/giu, "\n")
    .replace(/<[^>]*>/gu, " ");
  return { text: decodeEntities(visible).replace(/[ \t\f\v]+/gu, " ").replace(/\s*\n\s*/gu, "\n").trim(),
    ...(title === undefined ? {} : { title: decodeEntities(title).replace(/\s+/gu, " ").trim() }) };
}
function htmlAccessState(html: string, text: string): "PAYWALL_OR_LOGIN_REQUIRED" | "CANDIDATE_FOUND_FETCH_BLOCKED" | undefined {
  const loginLabels = ["sign in to read", "log in to read", "login required", "subscription required", "purchase access", "subscribe to read", "paywall", "accès réservé aux abonnés", "iniciar sesión para leer", "acesso restrito", "anmeldung erforderlich", "accesso riservato"];
  if (/<input\b[^>]*type\s*=\s*["']password["']/iu.test(html)) return "PAYWALL_OR_LOGIN_REQUIRED";
  const blockedLabels = ["just a moment...", "just a moment", "verify you are human", "checking your browser", "enable javascript", "please enable javascript", "javascript is required", "access denied", "captcha"];
  let blocked = false;
  for (const line of textLines(text)) {
    const label = line.trim().toLowerCase();
    if (loginLabels.includes(label)) return "PAYWALL_OR_LOGIN_REQUIRED";
    if (blockedLabels.includes(label)) blocked = true;
  }
  if (blocked ||
      /<(?:div|form|iframe)\b[^>]*(?:id|class|src)\s*=\s*["'][^"']*(?:cf-challenge|challenge-form|g-recaptcha|h-captcha|challenges.cloudflare.com)[^"']*["']/iu.test(html) ||
      (/<script\b/iu.test(html) && text.length < 100)) return "CANDIDATE_FOUND_FETCH_BLOCKED";
  return undefined;
}
function textBlocks(text: string): AuditableDocumentBlock[] {
  const blocks: AuditableDocumentBlock[] = [];
  let path: string[] = [];
  for (const raw of textLines(text)) {
    const line = raw.trim();
    if (!line) continue;
    if (sectionKind(line) !== undefined) { path = [line]; continue; }
    for (let offset = 0; offset < line.length; offset += 190_000) {
      if (blocks.length >= 100_000) throw new Error("Candidate exceeds the document block limit");
      const chunk = line.slice(offset, offset + 190_000);
      const hash = createHash("sha256").update(chunk).digest("hex");
      blocks.push({ block_id: `direct_${String(blocks.length + 1).padStart(6, "0")}_${hash.slice(0, 12)}`,
        kind: sectionKind(path[0] ?? "") === "abstract" ? "abstract" : "paragraph", section_path: path,
        text: chunk, text_sha256: hash });
    }
  }
  return blocks;
}

// A capped response with millions of short lines must not create millions of
// strings/blocks before the document schema can enforce its cardinality cap.
function* textLines(text: string): Generator<string> {
  let offset = 0;
  while (offset <= text.length) {
    const end = text.indexOf("\n", offset);
    if (end === -1) { yield text.slice(offset); return; }
    yield text.slice(offset, end);
    offset = end + 1;
  }
}
