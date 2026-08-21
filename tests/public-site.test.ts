import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { validatePublicSite } from "../scripts/validate-public-site.mts";

const rootFile = (file: string) =>
  pathToFileURL(resolve(fileURLToPath(new URL("../", import.meta.url)), file));

const pages = [
  ["site/index.html", "AskRigor | Evidence-first research retrieval", "https://askrigor.com/"],
  ["site/privacy/index.html", "Privacy | AskRigor", "https://askrigor.com/privacy"],
  ["site/terms/index.html", "Terms | AskRigor", "https://askrigor.com/terms"],
  ["site/support/index.html", "Support | AskRigor", "https://askrigor.com/support"]
] as const;

const pageHtml = async (file: string) => readFile(rootFile(file), "utf8");

describe("AskRigor public site", () => {
  it("ships exactly four complete public pages", async () => {
    const result = await validatePublicSite(rootFile("site/"));
    expect(result.errors).toEqual([]);
    expect(result.pages).toBe(4);
    expect(result.internalLinks).toBeGreaterThanOrEqual(16);
  });

  it("counts only same-origin anchor navigation links", async () => {
    const result = await validatePublicSite(rootFile("site/"));
    expect(result.internalLinks).toBe(35);
  });

  it("discloses the Custom GPT research Action as the same transient retrieval path", async () => {
    const privacy = await pageHtml("site/privacy/index.html");
    expect(privacy).toContain("Custom GPT Actions");
    expect(privacy).toContain("same transient research retrieval path");
    expect(privacy).toContain("search terms and public identifiers");
    expect(privacy).toContain("public provider metadata, comment text, and caption segments");
    expect(privacy).toContain("Custom GPT-only read");
    expect(privacy).toContain("caption segments");
    expect(privacy).toContain("transcript cursors are client-carried and stateless");
    expect(privacy).toContain("no transcript text is retained between requests");
    expect(privacy).toContain("does not log full request or response bodies");
    expect(privacy).toContain("Direct MCP continuation and Custom GPT transcript cursors are client-carried and stateless");
    expect(privacy).toContain("Custom GPT comment-audit continuation");
    expect(privacy).toContain("process memory");
    expect(privacy).toContain("no longer than one hour");
    expect(privacy).toContain("2,048 handles");
    expect(privacy).toContain("16 MiB");
    expect(privacy).toContain("no comment or reply text");
    expect(privacy).toContain("never written to disk or application logs");
    expect(privacy).toContain("restart, expiry, or capacity eviction");
    expect(privacy).toContain("restart from the video identifier");
    expect(privacy).toContain("single application replica");
    expect(privacy).toContain("must not be horizontally scaled");
    expect(privacy).toContain("separately consented lesson-feedback path");
  });

  it.each(pages)("gives %s its exact identity", async (file, title, canonical) => {
    const html = await pageHtml(file);
    expect(html).toContain(`<title>${title}</title>`);
    expect(html).toContain(`<link rel="canonical" href="${canonical}">`);
    expect(html).toContain("joel@askrigor.com");
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/support"');
  });

  it.each(pages)("makes %s a complete accessible document", async (file) => {
    const html = await pageHtml(file);
    expect(html).toMatch(/<html lang="en">/i);
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(html).toMatch(/<meta name="description" content="[^"]+">/i);
    expect(html.match(/<main\b/gi)).toHaveLength(1);
    expect(html.match(/<h1\b/gi)).toHaveLength(1);
    expect(html).toContain('class="skip-link" href="#content"');
    expect(html).toContain("<header");
    expect(html).toContain("<footer");
    expect(html).toContain('aria-label="Primary navigation"');
    expect(html).toContain('aria-label="Footer navigation"');
  });

  it.each(pages)("keeps %s static and free of unsafe placeholders", async (file) => {
    const html = await pageHtml(file);
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/<form\b/i);
    expect(html).not.toContain("http://");
    expect(html).not.toMatch(/https?:\/\/[^\s"']+\.(?:css|woff2?|ttf|png|jpe?g|gif|svg|webp)/i);
    expect(html).not.toMatch(/\b(?:TBD|TODO)\b/);
    expect(html).not.toMatch(/\{\{[^}]+\}\}|<%[^%]+%>/);
    expect(html).not.toMatch(/(?:google-analytics|gtag\(|segment\.io|mixpanel|tracking pixel)/i);
    expect(html).not.toMatch(/(?:api[_-]?key|secret|token)\s*[:=]\s*["'][^"']{8,}/i);
  });

  it("discloses the complete privacy processing boundary", async () => {
    const html = await pageHtml("site/privacy/index.html");
    for (const fragment of [
      "public YouTube author/channel IDs", "display names", "comment and reply text",
      "public caption text", "automatically generated", "unofficial YouTube interface",
      "NCBI/PubMed", "Europe PMC", "ClinicalTrials.gov", "Crossref", "YouTube Data API v3",
      "active request", "does not persist", "connected client", "operational metadata",
      "Infrastructure providers may retain",
      "access, correction, or deletion",
      "joel@askrigor.com"
    ]) expect(html).toContain(fragment);

    expect(html).toContain(
      "The application does not emit or store request-body logs, response-body logs, candidate-content logs, or a dedicated application access log.",
    );
    expect(html).toContain(
      "Only four aggregate budget data values are retained in that ledger: UTC month, fixed monthly limit, charged nano-USD total, and update time.",
    );
    expect(html).toContain("A non-content schema marker is also stored.");
    expect(html).toContain("The budget ledger contains no candidate or request content.");
    expect(html).toContain(
      "This log boundary does not change the separately disclosed storage of accepted generalized candidate fields and anonymous occurrence metadata in a private GitHub issue, or the aggregate budget ledger.",
    );
    expect(html).not.toContain("does not persist operational metadata");
    expect(html).not.toContain("Application and reverse-proxy operational logs omit");
    expect(html).not.toContain(
      "The application persists no request or response body, candidate content, or access log.",
    );
  });

  it("separates transient research from optional private lesson feedback", async () => {
    const html = await pageHtml("site/privacy/index.html");
    for (const fragment of [
      "Effective August 21, 2026",
      "Optional lesson feedback",
      "separate consent",
      "generalized structured fields",
      "not the raw chat",
      "deterministic screening",
      "fixed OpenAI privacy check",
      "before GitHub",
      "private review candidate",
      "anonymous occurrence count",
      "No user account, conversation ID, medical history, upload, or raw quotation",
      "deletion-eligible only after more than 90 complete days from terminal review",
      "Deletion is not automatic; a maintainer must act, so it may occur later.",
      "ARL-####",
      "request earlier deletion",
      "OpenAI, GitHub, ChatGPT, and infrastructure providers",
      "does not emit or store request-body logs, response-body logs, candidate-content logs",
    ]) expect(html).toContain(fragment);

    expect(html).not.toContain("AskRigor-lessons");
    expect(html).not.toContain("github.com/");
    expect(html).not.toContain("deletion-eligible 90 days after terminal review");
  });

  it("states the home research boundary", async () => {
    const html = await pageHtml("site/index.html");
    for (const fragment of [
      "does not diagnose", "does not treat or prescribe", "not a substitute for professional advice",
      "provider data may be incomplete, delayed, or unavailable"
    ]) expect(html).toContain(fragment);
  });

  it("states the terms boundary", async () => {
    const html = await pageHtml("site/terms/index.html");
    for (const fragment of [
      "read-only", "lawful use", "no medical, legal, or financial advice", "rate limits",
      "third-party", "as available", "applicable law", "joel@askrigor.com",
      "expressly approved lesson Action", "private feedback"
    ]) expect(html).toContain(fragment);
  });

  it("offers complete support guidance", async () => {
    const html = await pageHtml("site/support/index.html");
    for (const fragment of [
      "accessibility", "security", "Do not email API keys", "emergency", "local emergency services",
      "joel@askrigor.com"
    ]) expect(html).toContain(fragment);
  });

  it("ships accessible responsive styles", async () => {
    const css = await readFile(rootFile("site/assets/site.css"), "utf8");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("prefers-color-scheme: dark");
    expect(css).toContain("max-width");
    expect(css).toMatch(/@media\s*\([^)]*(?:48rem|[0-4]?\d(?:\.\d+)?rem)[^)]*\)/);
  });
});
