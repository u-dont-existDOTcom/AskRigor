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

  it("discloses connected research and the bounded legacy checkpoint", async () => {
    const privacy = await pageHtml("site/privacy/index.html");
    expect(privacy).toContain("Connected-account research requires the mode choice");
    expect(privacy).toContain("Free AskRigor use requires an explicit agreement");
    expect(privacy).toContain("screened, de-identified population-level research target");
    expect(privacy).toContain("performs low-level public-source retrieval and automated Gemini scouting");
    expect(privacy).toContain("Signed state and work receipts");
    expect(privacy).toContain("Requests and responses are not written to application logs");
    expect(privacy).toContain("Direct MCP continuation remains client-carried and stateless");
    expect(privacy).toContain("encrypted single-host checkpoint");
    expect(privacy).toContain("72 hours without use");
    expect(privacy).toContain("seven days after creation");
    expect(privacy).toContain("Raw chat, provider bodies, transcripts, comments");
    expect(privacy).toContain("excluded from backups");
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
    expect(html).toContain("AskRigor is a product operated by Mayan Roots LLC.");
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
      "NCBI/PubMed", "Europe PMC", "Unpaywall", "ClinicalTrials.gov", "Crossref", "YouTube Data API v3",
      "During research", "does not create user accounts", "connected client", "operational metadata",
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

  it("publishes the required YouTube API privacy and terms links", async () => {
    const privacy = await pageHtml("site/privacy/index.html");
    expect(privacy).toContain("AskRigor uses YouTube API Services");
    expect(privacy).toContain("acknowledge and agree to this Privacy Notice before using");
    expect(privacy).toContain(
      '<a href="https://policies.google.com/privacy">Google Privacy Policy</a>',
    );
    expect(privacy).toContain("does not require Google or YouTube sign-in");
    for (const fragment of [
      "creates no Google/YouTube account connection or authorization grant",
      "does not direct users to a Google consent screen",
      "request YouTube OAuth scopes",
      "receive user access or refresh tokens",
      "Each new YouTube search, metadata lookup, or comment/reply retrieval starts a fresh read from YouTube",
      "Direct MCP continuation state is returned to the connected client and expires after one hour",
      "is swept within one hour after expiry",
      "released immediately after successful report finalization",
      "hourly sweep removes expired files",
      "does not contain raw comment or reply text",
      "do not log YouTube queries, URLs, identifiers, comment text, request or response bodies, provider bodies, or credentials"
    ]) expect(privacy).toContain(fragment);

    const terms = await pageHtml("site/terms/index.html");
    expect(terms).toContain(
      '<a href="https://www.youtube.com/t/terms">YouTube Terms of Service</a>',
    );
    expect(terms).toContain("agree to be bound by the YouTube Terms of Service");
  });

  // Owner answer 173 (2026-10-25): AskRigor keeps the summary it wrote of what YouTube commenters said, for its owner's
  // review, for the 30 days YouTube's Developer Policies allow (III.E.4), then deletes it. Its words await the owner's
  // approval with the release (question 175), in the page's typographic apostrophes; the effective date stays.
  it("says in its YouTube storage section what is kept of what commenters said, and that it goes after 30 days", async () => {
    const privacy = await pageHtml("site/privacy/index.html");
    const paragraph = "<p>When a finished research answer reports what YouTube commenters said, AskRigor may keep " +
      "the summary it wrote of that, with the answer\u2019s research question, for its owner\u2019s review: no comment " +
      "text, commenter names, channel, comment or video IDs, or links. It is never published and is deleted 30 days " +
      "after it was saved, or sooner on request.</p>";
    const start = privacy.indexOf("<section><h2>YouTube refresh, storage, and deletion</h2>");
    const section = privacy.slice(start, privacy.indexOf("</section>", start));
    expect(section.endsWith(paragraph)).toBe(true);
    expect(privacy.split(paragraph)).toHaveLength(2);
    expect(privacy).not.toContain("answer's research question");
    expect(privacy).not.toContain("owner's review");
    expect(privacy).toContain("Effective October 22, 2026");
  });

  it("separates transient research from optional private lesson feedback", async () => {
    const html = await pageHtml("site/privacy/index.html");
    for (const fragment of [
      "Effective October 22, 2026",
      "AskRigor may also read a study from its operator's own study library: for the operator's own research, and for a free or paying account only while the same study is publicly available elsewhere. The library receives only the study's DOI, with no question, health detail, or account information.",
      "Optional lesson feedback",
      "separate consent",
      "generalized structured fields",
      "not the raw chat",
      "screens the generalized candidate on its own server before GitHub; no other AI provider receives it.",
      "The AI app used (ChatGPT or Claude) handles the surrounding conversation",
      "before GitHub",
      "private review candidate",
      "anonymous occurrence count",
      // Owner question 154 (2026-10-21): a detailed report only when the person turned detailed lesson reports on.
      "a deduplication marker, plus a detailed report of the failure when the person has turned on detailed lesson " +
        "reports in AskRigor’s settings.",
      "No user account, conversation ID, medical history, upload, or raw quotation",
      "temporarily enables provider storage",
      "requests deletion immediately after consuming each interaction",
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
    // Production's lesson path makes no OpenAI call (owner-approved wording, 2026-09-30).
    expect(html).not.toContain("fixed OpenAI privacy check");
  });

  it("describes the findings library as approved for its go-live", async () => {
    const privacy = await pageHtml("site/privacy/index.html");
    for (const fragment of [
      "for each finished research answer a findings card",
      "Findings cards are saved automatically, pass the same screening as lesson feedback",
      "Cards are not linked to the account, so revoking access does not withdraw them",
      "To request deletion of a findings card, send its <code>ARF-####</code> id to the same address.",
      "Paid private mode submits no research progress except, when the person accepts it for that answer, that research’s map (its searches, the studies found and the leads left open, never the chat) for review; it saves an answer’s findings card or lesson feedback only when the person accepts saving it for that answer",
      "a short language code (such as es or pt-BR)",
    ]) expect(privacy).toContain(fragment);
    const terms = await pageHtml("site/terms/index.html");
    for (const fragment of [
      "Effective October 22, 2026",
      "for each finished research answer a findings card",
      "or a findings card saved under it",
      "saves an answer’s findings card or lesson feedback only when you accept saving it for that answer",
    ]) expect(terms).toContain(fragment);
  });

  // Owner answer 171 (2026-10-25): the exact free/paid publication and comments wording.
  // Page apostrophes follow the existing typography; the release changes the effective dates.
  it("says free cards publish on save, paid findings wait for acceptance, and how votes and comments work", async () => {
    const privacy = await pageHtml("site/privacy/index.html");
    for (const fragment of [
      "<p>Findings cards saved in free contributor mode are published in AskRigor’s public Atlas as soon as they are saved, written without the person and marked “Not checked by supervisors yet” until AskRigor’s owner has reviewed them. Findings from a paid private card are published only after AskRigor’s owner accepts them. An accepted finding stays while it is valid: it is corrected or taken down when someone shows it is wrong, and rewritten or removed if it could identify anyone.</p></section>",
      "Paid private mode sends no research contribution to that path. Findings cards saved in free contributor mode are published in AskRigor’s public Atlas as soon as they are saved, written without the person and marked “Not checked by supervisors yet” until AskRigor’s owner has reviewed them. Findings from a paid private card are published only after AskRigor’s owner accepts them.",
      "<section><h2>Votes and comments in the Atlas</h2><p>To vote on a finding or comment on it, you sign in with an AskRigor account. AskRigor stores each vote and comment with a key derived from the account, never its email address. Votes are shown only as totals. A comment is public and is shown with the display name you choose, so don’t post contact details or anything that identifies you or someone else. AskRigor checks comments for contact details and links before showing them, and its owner may hide or remove any comment. You can delete your own votes and comments at any time.</p></section>",
      "To request deletion of a findings card, send its <code>ARF-####</code> id to the same address. No reason is " +
        "needed. Deletion removes the card and everything that ties it to you; findings from the card that " +
        "AskRigor’s owner has already accepted are written without you, so they stay while they are valid, as " +
        "described above.",
      "Effective October 22, 2026",
    ]) expect(privacy).toContain(fragment);
    const terms = await pageHtml("site/terms/index.html");
    for (const fragment of [
      "rather than silently rewritten. Findings cards saved in free contributor mode are published in AskRigor’s public Atlas as soon as they are saved, written without you and marked “Not checked by supervisors yet” until AskRigor’s owner has reviewed them. Findings from a paid private card are published only after AskRigor’s owner accepts them. If you ask to delete a findings card, everything that ties it to you is removed, and the card leaves the Atlas unless AskRigor’s owner has already accepted its findings; no reason is needed. An accepted finding stays while it is valid: it is corrected or taken down when someone shows it is wrong, and rewritten or removed if it could identify anyone.</p></section>",
      "<section><h2>Comments in the Atlas</h2><p>Comments in the Atlas must be about the finding. Your own experiences are welcome, and comments are not medical advice. Don’t post contact details, personal information about anyone else, advertising or harassment. AskRigor may hide or remove any comment and stop an account from commenting. By posting a comment you let AskRigor show it in the Atlas, and you can delete it at any time.</p></section>",
      "does not promise attribution, publication, compensation, or a particular outcome",
      "Effective October 22, 2026",
    ]) expect(terms).toContain(fragment);
  });

  it("says what Gemini receives when a video is checked, and what the daily ledger holds", async () => {
    // "Check this video" (AskRigor#248), wording proposed for the owner's approval (owner questions page, question 26).
    const privacy = await pageHtml("site/privacy/index.html");
    for (const fragment of [
      "Google Gemini then receives only that video’s public YouTube address, rebuilt from its video ID, and AskRigor’s fixed reading instructions",
      "a follow-up about one moment adds only that time",
      "Gemini never receives the person’s question, words, health details, or identity.",
      "is a list of claims to check, not evidence",
      "A video reading is likewise stored at Google only while Gemini reads",
      "It holds only the day, the limit, the seconds counted, and the update time: no video, request, report, or person.",
      "Google Gemini also processes the public video address and fixed instructions of a video reading.",
    ]) expect(privacy).toContain(fragment);
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

  it("states reciprocal free use and the paid-private alternative accurately", async () => {
    const privacy = await pageHtml("site/privacy/index.html");
    const terms = await pageHtml("site/terms/index.html");
    for (const document of [privacy, terms]) {
      expect(document.toLowerCase()).toContain("free contributor");
      expect(document.toLowerCase()).toContain("paid private");
      expect(document.toLowerCase()).toContain("deidentified structured research progress");
      expect(document.toLowerCase()).toContain("raw chat");
      expect(document).toContain("no public price or checkout");
    }
    expect(privacy).toContain("Each submission first enters a private pending-review inbox");
    expect(privacy).toContain("Revoking research access stops later research calls and withdraws still-pending proposals");
    expect(terms).toContain("eligible deidentified structured research progress from your use may be submitted");
    expect(terms).toContain("Paid private mode contributes nothing to the shared repository");
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
