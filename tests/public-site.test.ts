import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { validatePublicSite } from "../scripts/validate-public-site.mts";

const rootFile = (file: string) =>
  pathToFileURL(resolve(new URL("../", import.meta.url).pathname, file));

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
      "NCBI/PubMed", "Europe PMC", "ClinicalTrials.gov", "Crossref", "YouTube Data API v3",
      "active request", "does not persist", "connected client", "operational metadata",
      "joel@askrigor.com"
    ]) expect(html).toContain(fragment);
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
      "third-party", "as available", "applicable law", "joel@askrigor.com"
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
