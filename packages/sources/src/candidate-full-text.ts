import { createHash } from "node:crypto";

import { auditableDocumentIndexSchema, type AuditableDocumentBlock, type AuditableDocumentIndex } from "./auditable-document-index.js";
import { admitFullText, compactIdentityText, FULL_TEXT_BODY_MIN_CHARACTERS, INLINE_SECTION_HEADINGS, sourceClassification, sectionKind, titleVariants, verifyArticleIdentity, type CandidateText, type CandidateUrl, type FrozenArticleIdentity, type FullTextCandidate } from "./full-text-admission.js";
import { DiscoveredDocumentError, fetchCandidateDocument, UpstreamHttpError, type DiscoveredDocumentFetchRuntime } from "./http.js";
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
    url: candidate.url, ...sourceClassification(candidate.url, candidate.declared_class, identity.publisher_host),
    retrieval_provider: "direct", state: "CANDIDATE_FOUND_FETCH_BLOCKED", identity_verification: "not_verified",
    sections_observed: [], completeness: "unavailable", retrieved_at: (runtime.now?.() ?? new Date()).toISOString()
  };
  try {
    const fetched = await (runtime.fetchDocument ?? fetchCandidateDocument)(candidate.url, runtime.documentFetchRuntime);
    record = { ...record, url: fetched.finalUrl,
      ...sourceClassification(fetched.finalUrl, candidate.declared_class, identity.publisher_host) };
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
        completeness: admission.completeness, identity_verification: index.source.identity_verification === "pii_exact" ? "pii_exact" : index.source.identity_verification === "doi_exact" ? "doi_exact" : "title_match" };
      return { candidate: record, ...(admission.state === "FULL_TEXT_READABLE"
        ? { index: { ...index, source: { ...index.source, provider: "direct_candidate" } } } : {}) };
    }
    const type = fetched.contentType?.split(";")[0]?.trim().toLowerCase();
    if (!["text/html", "application/xhtml+xml", "text/plain"].includes(type ?? "")) {
      throw new DiscoveredDocumentError("unsupported_content", "Candidate content type is unsupported");
    }
    const charset = fetched.contentType?.match(/;\s*charset\s*=\s*["']?([^;"'\s]+)/iu)?.[1] ?? "utf-8";
    let decoder: TextDecoder;
    try { decoder = new TextDecoder(charset, { fatal: false }); } catch { decoder = new TextDecoder("utf-8", { fatal: false }); }
    const raw = decoder.decode(fetched.bytes)
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, "");
    const isHtml = type !== "text/plain";
    const extracted = isHtml ? extractHtmlText(raw) : { text: raw };
    return inspectCandidateText(record, identity, extracted, hash, isHtml ? "html_text" : "plain_text", isHtml ? raw : undefined);
  } catch (error) {
    const status = error instanceof UpstreamHttpError ? error.status : undefined;
    const state = status === 401 || status === 402 ? "PAYWALL_OR_LOGIN_REQUIRED"
      : status === 404 || status === 410 ? "NO_COPY_FOUND_AFTER_EXPANDED_SEARCH"
        : status === 429 || status !== undefined && status >= 500 || error instanceof DiscoveredDocumentError && error.code === "transport" ? "PROVIDER_UNAVAILABLE" : "CANDIDATE_FOUND_FETCH_BLOCKED";
    return { candidate: { ...record, state } };
  }
}

/** Client search-index text is inspected locally; its URL is provenance only. */
export function acquireSuppliedCandidateFullText(
  supplied: CandidateText,
  identity: FrozenArticleIdentity,
  abstractText: string | undefined,
  runtime: Pick<CandidateFullTextRuntime, "now"> = {}
): { candidate: FullTextCandidate; index?: AuditableDocumentIndex } {
  const record: FullTextCandidate = {
    url: supplied.url, ...sourceClassification(supplied.url, undefined, identity.publisher_host),
    retrieval_provider: "client_search_index", state: "IDENTITY_MISMATCH", identity_verification: "not_verified",
    sections_observed: [], completeness: "unavailable", retrieved_at: (runtime.now?.() ?? new Date()).toISOString()
  };
  // The first 300 compact characters of the abstract, or all of a shorter one, must appear in the copy. An abstract
  // under 80 compact characters is too short to identify a paper, so the check is skipped and the result says so.
  const abstract = compactIdentityText(extractHtmlText(abstractText ?? "").text);
  const abstractCheckable = abstract.length >= 80;
  if (abstractCheckable && !compactIdentityText(supplied.text).includes(abstract.slice(0, 300))) {
    return { candidate: { ...record, limitations: [
      "The supplied text does not contain the study's abstract (its first 300 compact normalized characters, or all of a shorter one); the exact abstract cross-check failed."
    ] } };
  }
  let checked: { candidate: FullTextCandidate; index?: AuditableDocumentIndex };
  try {
    checked = inspectCandidateText(record, identity, { text: supplied.text },
      createHash("sha256").update(supplied.text, "utf8").digest("hex"), "plain_text");
  } catch {
    checked = { candidate: { ...record, state: "CANDIDATE_FOUND_FETCH_BLOCKED",
      limitations: ["The supplied text could not be indexed within the document's structural limits."] } };
  }
  if (!abstractCheckable) {
    checked.candidate.limitations = [...(checked.candidate.limitations ?? []), abstract.length === 0
      ? "The exact abstract cross-check was skipped because the existing Europe PMC DOI-search record carries no abstract."
      : "The exact abstract cross-check was skipped because the study's abstract is too short to identify it."];
  }
  return checked;
}

function inspectCandidateText(
  record: FullTextCandidate,
  identity: FrozenArticleIdentity,
  extracted: { text: string; title?: string; doi?: string },
  hash: string,
  format: "html_text" | "plain_text",
  html?: string
): { candidate: FullTextCandidate; index?: AuditableDocumentIndex } {
  let verification = verifyArticleIdentity(identity, extracted.text, extracted.title,
    extracted.doi === undefined ? {} : { citation_doi: extracted.doi });
  let blocks = textBlocks(extracted.text);
  let admission = admitFullText(blocks);
  // Whole-page inspection retains the original identity and admission rules.
  if (verification === undefined || admission.state !== "FULL_TEXT_READABLE") {
    const embedded = uniqueEmbeddedBlock(extracted.text, identity);
    if (embedded !== undefined) {
      const text = splitInlineHeadings(embedded);
      verification = verifyArticleIdentity(identity, text);
      blocks = textBlocks(text);
      admission = admitFullText(blocks);
      record = { ...record, extraction: "embedded_block", limitations: [
        "Inline heading extraction recognizes structural labels in English, French, Spanish, Portuguese, German and Italian; other forms remain partial."
      ] };
    }
  }
  // Access structures explain failure only after both possible inspections.
  const accessState = verification === undefined || admission.state !== "FULL_TEXT_READABLE"
    ? html === undefined ? undefined : htmlAccessState(html, extracted.text) : undefined;
  record = { ...record, state: accessState ?? (verification === undefined ? "IDENTITY_MISMATCH" : admission.state),
    identity_verification: verification ?? "not_verified",
    ...(verification === undefined ? {} : { sections_observed: admission.sections_observed, completeness: admission.completeness }) };
  if (verification === undefined || record.state !== "FULL_TEXT_READABLE") return { candidate: record };
  const index = auditableDocumentIndexSchema.parse({
    source: { provider: record.retrieval_provider === "client_search_index" ? "client_supplied" : "direct_candidate",
      primary_identifier: identity.doi, canonical_url: record.url,
      doi: identity.doi, ...(identity.pmid === undefined ? {} : { pmid: identity.pmid }),
      ...(identity.title === undefined ? {} : { title: identity.title }), format,
      content_sha256: hash, document_completeness: "full_text_with_body", identity_verification: verification },
    blocks, section_paths: [...new Map(blocks.map((block) => [JSON.stringify(block.section_path), block.section_path])).values()]
  });
  return { candidate: record, index };
}

function uniqueEmbeddedBlock(text: string, identity: FrozenArticleIdentity): string | undefined {
  const identifiers = [compactIdentityText(identity.doi),
    ...(compactIdentityText(identity.pii ?? "").length >= 10 ? [compactIdentityText(identity.pii!)] : []),
    ...titleVariants(identity.title, ...(identity.title_variants ?? [])).map(compactIdentityText).filter((title) => title.length >= 24)];
  let selected: string | undefined;
  for (const line of textLines(text)) {
    if (line.length < FULL_TEXT_BODY_MIN_CHARACTERS) continue;
    const front = compactIdentityText(line.slice(0, 2_000));
    if (!identifiers.some((identifier) => front.includes(identifier))) continue;
    if (selected !== undefined) return undefined;
    selected = line;
  }
  return selected;
}

const inlineHeadingPattern = new RegExp(`(?<!\\p{L})(?:${INLINE_SECTION_HEADINGS
  .map((heading) => heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("|")})(?!\\p{L})`, "giu");
function splitInlineHeadings(text: string): string {
  return text.replace(inlineHeadingPattern, (heading: string, offset: number) => {
    const caps = heading === heading.toUpperCase();
    if (caps) return `\n${heading}\n`;
    const sentenceCase = heading === heading[0]!.toUpperCase() + heading.slice(1).toLowerCase();
    const titleCase = heading.split(" ").every((word) =>
      word === word[0]!.toUpperCase() + word.slice(1).toLowerCase() || ["and", "et", "y", "e", "und", "&"].includes(word));
    let previous = offset - 1;
    while (previous >= 0 && /\s/u.test(text[previous]!)) previous -= 1;
    while (previous >= 0 && /["'”’)]/u.test(text[previous]!)) previous -= 1;
    const afterSentence = previous >= 0 && /\p{STerm}/u.test(text[previous]!);
    const beforeCapital = /^\s*[:.]?\s*\p{Lu}/u.test(text.slice(offset + heading.length));
    return (sentenceCase || titleCase) && afterSentence && beforeCapital ? `\n${heading}\n` : heading;
  });
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
export function extractHtmlText(html: string): { text: string; title?: string; doi?: string } {
  const meta = new Map<string, string>();
  for (const tag of html.matchAll(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/giu)) {
    const attributes = new Map<string, string>();
    for (const attribute of tag[0].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gsu)) {
      attributes.set(attribute[1]!.toLowerCase(), attribute[3]!);
    }
    const name = attributes.get("name")?.toLowerCase();
    const content = attributes.get("content");
    if (name !== undefined && content !== undefined) meta.set(name, content);
  }
  const citationTitle = meta.get("citation_title");
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/iu)?.[1];
  const title = citationTitle ?? (h1 === undefined ? undefined : h1.replace(/<[^>]*>/gu, " "));
  // Removal repeats until nothing changes, so nested or split markup cannot reassemble a comment or script.
  const visible = removeAll(removeAll(html, /<!--[\s\S]*?-->/gu), /<(script|style|template|noscript|nav|footer)\b[^>]*>[\s\S]*?<\/\1\s*>/giu)
    .replace(/<([a-z][\w:-]*)\b[^>]*(?:\shidden(?:\s|=|>)|aria-hidden\s*=\s*["']true["']|style\s*=\s*["'][^"']*display\s*:\s*none)[^>]*>[\s\S]*?<\/\1\s*>/giu, "")
    .replace(/<\/?(?:h[1-6]|p|div|section|article|li|tr|br|title|strong|b)\b[^>]*>/giu, "\n")
    .replace(/<[^>]*>/gu, " ");
  return { text: decodeEntities(visible).replace(/[ \t\f\v]+/gu, " ").replace(/\s*\n\s*/gu, "\n").trim(),
    ...(title === undefined ? {} : { title: decodeEntities(title).replace(/\s+/gu, " ").trim() }),
    ...(meta.get("citation_doi") === undefined ? {} : { doi: decodeEntities(meta.get("citation_doi")!) }) };
}
function removeAll(text: string, pattern: RegExp): string {
  let previous: string;
  let current = text;
  do {
    previous = current;
    current = current.replace(pattern, "");
  } while (current !== previous);
  return current;
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
      /<(?:div|form|iframe)\b[^>]*(?:id|class|src)\s*=\s*["'][^"']*(?:cf-challenge|challenge-form|g-recaptcha|h-captcha|challenges\.cloudflare\.com)[^"']*["']/iu.test(html) ||
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
