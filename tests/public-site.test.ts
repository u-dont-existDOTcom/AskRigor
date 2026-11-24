import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { validatePublicSite, validateRobots, validateWhatsNew } from "../scripts/validate-public-site.mts";

const rootFile = (file: string) =>
  pathToFileURL(resolve(fileURLToPath(new URL("../", import.meta.url)), file));

const pages = [
  ["site/index.html", "AskRigor | Evidence-first research retrieval", "https://askrigor.com/"],
  ["site/privacy/index.html", "Privacy | AskRigor", "https://askrigor.com/privacy"],
  ["site/terms/index.html", "Terms | AskRigor", "https://askrigor.com/terms"],
  ["site/support/index.html", "Support | AskRigor", "https://askrigor.com/support"],
  ["site/how-to-research/index.html", "How to research | AskRigor", "https://askrigor.com/how-to-research"]
] as const;

const pageHtml = async (file: string) => readFile(rootFile(file), "utf8");

describe("AskRigor public site", () => {
  it("ships exactly nine complete public pages", async () => {
    const result = await validatePublicSite(rootFile("site/"));
    expect(result.errors).toEqual([]);
    expect(result.pages).toBe(9);
    expect(result.internalLinks).toBeGreaterThanOrEqual(16);
  });

  it("needs a What's new fold for every production release record (the owner, 6 Nov 2026)", () => {
    const roadmap = [
      '<section id="whats-new">',
      "<details open><summary>4 November 2026</summary><ul><li>A change people notice.</li></ul></details>",
      "<!-- Releases people wouldn't notice: 2026-10-11 -->",
      "</section>"
    ].join("");
    expect(validateWhatsNew(roadmap, [
      "2026-11-04-owner-answer-240a-production-release.md",
      "2026-10-11-maintenance-production-release.md",
      "2026-11-03-owner-regressions-394-judgment.md"
    ])).toEqual([]);
    const missing = validateWhatsNew(roadmap, ["2026-11-06-next-build-production-release.md"]);
    expect(missing).toHaveLength(1);
    expect(missing[0]).toContain("docs/audits/2026-11-06-next-build-production-release.md");
    expect(missing[0]).toContain("<summary>6 November 2026</summary>");
    expect(validateWhatsNew("<main></main>", [])[0]).toContain("is missing its \"What's new\" section");
  });

  it("counts only same-origin anchor navigation links", async () => {
    const result = await validatePublicSite(rootFile("site/"));
    // 105 since 16 Nov 2026: the new inositol Atlas overview link in the roadmap adds one to the previous 104.
    // 106 since 21 Nov 2026: the home page footer's "User count" link to the public user count's text page.
    // 126 since the How to research page (owner answer 365 1a): its own 12 links (brand, menu, footer) and its menu
    // item on the eight other pages add 20.
    // 128 since the 21 Nov 2026 release record: the roadmap's "What's new" links the user count page and the privacy notice.
    // 131 since release b's record: its roadmap lines link the privacy notice, the terms and the How to research page.
    expect(result.internalLinks).toBe(131);
  });

  it("puts the approved cautions on the How to research page, linked from every page's menu (owner answer 365 1a)", async () => {
    const page = await pageHtml("site/how-to-research/index.html");
    // The draft's page text only: its review notes and sources table stay with the draft.
    for (const note of ["Draft for", "owner library", "Not used, because", "this session"]) expect(page).not.toContain(note);
    // Every in-page link lands on a part of the page.
    const ids = [...page.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]);
    const targets = [...page.matchAll(/href="#([^"]+)"/gu)].map((match) => match[1]);
    expect(targets).toHaveLength(6);
    for (const target of targets) expect(ids).toContain(target);
    // Each number's source is linked, over HTTPS: the draft's 35 links (the canonical <link> is not one).
    const external = [...page.matchAll(/<a href="(https?:[^"]+)"/gu)].map((match) => match[1]);
    expect(external).toHaveLength(35);
    for (const url of external) expect(url).toMatch(/^https:\/\//u);
    for (const file of ["site/index.html", "site/roadmap/index.html", "site/compare/free-chatgpt/index.html"]) {
      expect(await pageHtml(file)).toContain('<li><a href="/how-to-research">How to research</a></li>');
    }
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
  // review, until it is deleted on request or because YouTube asks (the owner's rule, 25 Oct: "don't delete the
  // summaries unless YT tells us to do that"). The owner's words, in the page's typographic apostrophes; the effective
  // date stays.
  it("says in its YouTube storage section what is kept of what commenters said, and that it goes on request or if YouTube asks", async () => {
    const privacy = await pageHtml("site/privacy/index.html");
    const paragraph = "<p>When a finished research answer reports what YouTube commenters said, AskRigor may keep " +
      "the summary it wrote of that, with the answer\u2019s research question, for its owner\u2019s review: no comment " +
      "text, commenter names, channel, comment or video IDs, or links. It is never published, and it is deleted on " +
      "request, or if YouTube asks AskRigor to delete it.</p>";
    // Owner answer 307b (15 November 2026): the section then says, in a paragraph of its own, the one thing of a
    // video a saved card may hold: the link of a video that a person named.
    const named = "<p>A saved findings card, and its page in the public Atlas, may link a YouTube video that a " +
      "person named themselves. The link is the address that person gave: it is not taken from YouTube API " +
      "Services, and no YouTube API Data is stored with it or shown beside it.</p>";
    const start = privacy.indexOf("<section><h2>YouTube refresh, storage, and deletion</h2>");
    const section = privacy.slice(start, privacy.indexOf("</section>", start));
    expect(section.endsWith(paragraph + named)).toBe(true);
    expect(privacy.split(paragraph)).toHaveLength(2);
    expect(privacy.split(named)).toHaveLength(2);
    expect(privacy).not.toContain("answer's research question");
    expect(privacy).not.toContain("owner's review");
    expect(privacy).toContain("Effective November 21, 2026");
    expect(privacy).toContain("public forum websites (the page’s link), Reddit (a thread’s link or deidentified search words");
  });

  // AskRigor#477 stage 1 (owner answer 329a, 16 Nov 2026): notice v6 covers a private research dossier; the page
  // describes it in wording only, adding nothing the shared path did not already include.
  it("describes the private research dossier inside the free shared path, never shown and erased with its card", async () => {
    const privacy = await pageHtml("site/privacy/index.html");
    const start = privacy.indexOf("<section><h2>Research access and shared learning</h2>");
    const section = privacy.slice(start, privacy.indexOf("</section>", start));
    expect(section).toContain("When a research run would save a later reader substantial work, these parts of it are " +
      "kept together as one private research dossier: the question in general terms, the searches, the studies and how " +
      "each was read, their results with numbers, the conclusions and how certain they are, what was covered, what " +
      "communities reported as a findings card summarizes it, what is still open, and the AI’s own statement of the " +
      "work it saves.");
    expect(section).toContain("A dossier holds nothing this paragraph excludes; only AskRigor’s owner can read it, it is " +
      "never shown on a page, revoking access withdraws it while it waits for review, and deleting a findings card of " +
      "the same research, or asking with the dossier’s ARD-#### id, erases it.");
    // Owner answer 334a (16 Nov 2026: the release turns the AI privacy reading on): the owner's sentence, word for word
    // in the page's typographic apostrophes, right after the dossier's, the effective date unchanged.
    expect(section).toContain("erases it. Before a research dossier is stored, its text (never your chat or anything " +
      "about you) is checked for personal details by an AI model from Anthropic, on AskRigor’s own account. Each " +
      "submission first enters");
    // Two AI readings by Anthropic, each disclosed once: this one, and Atlas Release B's reading for claims about named
    // people (design of 19 Nov 2026, section 6; Codex's red team: "Anthropic also receives that memory"); and, once,
    // the Claude session that reads disputes for the owner (Fable's recheck of B, change 5).
    expect(privacy.match(/Anthropic/gu)).toHaveLength(3);
    expect(privacy).toContain("AskRigor’s operator handles disputes with Claude, an AI model from Anthropic, which reads " +
      "disputes, with any link and email address given with them, for AskRigor’s owner.");
    expect(privacy).toContain("To find claims about people, AskRigor sends each finding’s text, the sentences it quotes " +
      "from its sources and any taken-off claims about the names in it to an AI model from Anthropic, on AskRigor’s own " +
      "account.");
    expect(privacy).toContain("Effective November 21, 2026");
    // After the exclusions it relies on, and before the paid private sentence, which it does not change.
    expect(section.indexOf("private research dossier")).toBeGreaterThan(section.indexOf("It excludes raw chat"));
    expect(section.indexOf("private research dossier")).toBeLessThan(section.indexOf("Paid private mode submits"));
  });

  it("separates transient research from optional private lesson feedback", async () => {
    const html = await pageHtml("site/privacy/index.html");
    for (const fragment of [
      "Effective November 21, 2026",
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
      // November 21, 2026: Atlas Release B's "Claims about people in the Atlas" (owner answer 366b).
      "Effective November 21, 2026",
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
      "<p>Findings cards saved in free contributor mode are published in AskRigor’s public Atlas as soon as they are saved, written without the person and marked “Not checked by supervisors yet” until AskRigor’s owner has reviewed them. Findings from a paid private card are published only after AskRigor’s owner accepts them. An accepted finding stays while it is valid: it is corrected or taken down when someone shows it is wrong, and rewritten or removed if it could identify the person who asked. Findings may name other people, such as study authors, sellers and people who make public health claims; see “People named in the Atlas” below.</p></section>",
      "Paid private mode sends no research contribution to that path. Findings cards saved in free contributor mode are published in AskRigor’s public Atlas as soon as they are saved, written without the person and marked “Not checked by supervisors yet” until AskRigor’s owner has reviewed them. Findings from a paid private card are published only after AskRigor’s owner accepts them.",
      "<section><h2>Votes and comments in the Atlas</h2><p>To vote on a finding or comment on it, you sign in with an AskRigor account. AskRigor stores each vote and comment with a key derived from the account, never its email address. Votes are shown only as totals. A comment is public and is shown with the display name you choose, so don’t post contact details or anything that identifies you or someone else. AskRigor checks comments for contact details and links before showing them, and its owner may hide or remove any comment. You can delete your own votes and comments at any time.</p></section>",
      "To request deletion of a findings card, send its <code>ARF-####</code> id to the same address. No reason is " +
        "needed. Deletion removes the card and everything that ties it to you; findings from the card that " +
        "AskRigor’s owner has already accepted are written without you, so they stay while they are valid, as " +
        "described above.",
      "Effective November 21, 2026",
    ]) expect(privacy).toContain(fragment);
    const terms = await pageHtml("site/terms/index.html");
    for (const fragment of [
      "rather than silently rewritten. Findings cards saved in free contributor mode are published in AskRigor’s public Atlas as soon as they are saved, written without you and marked “Not checked by supervisors yet” until AskRigor’s owner has reviewed them. Findings from a paid private card are published only after AskRigor’s owner accepts them. If you ask to delete a findings card, everything that ties it to you is removed, and the card leaves the Atlas unless AskRigor’s owner has already accepted its findings; no reason is needed. An accepted finding stays while it is valid: it is corrected or taken down when someone shows it is wrong, and rewritten or removed if it could identify the person who asked. Findings may name other people, such as study authors, sellers and people who make public health claims; see “Claims about people in the Atlas” below and the privacy notice.</p></section>",
      "<section><h2>Comments in the Atlas</h2><p>Comments in the Atlas must be about the finding. Your own experiences are welcome, and comments are not medical advice. Don’t post contact details, personal information about anyone else, advertising or harassment. AskRigor may hide or remove any comment and stop an account from commenting. By posting a comment you let AskRigor show it in the Atlas, and you can delete it at any time.</p></section>",
      "does not promise attribution, publication, compensation, or a particular outcome",
      "Effective November 21, 2026",
    ]) expect(terms).toContain(fragment);
  });

  // Owner answer 200a (2026-10-30): a de-identified copy, sent only on the person's confirmation, kept apart from the
  // account, read only by the owner, deleted after 90 days or sooner with its code.
  it("says how a shared question and answer is sent, kept and deleted", async () => {
    const privacy = await pageHtml("site/privacy/index.html");
    for (const fragment of [
      "<section><h2>Shared questions and answers</h2>",
      "Nothing is sent unless you say yes and then confirm the exact copy the AI shows you.",
      "AskRigor’s server checks it only for contact details and access tokens, not that it is de-identified, so read it before you confirm.",
      "apart from your account: it does not store which account sent it.",
      "It is never published, and only AskRigor’s owner reads it, to make test cases and fixes.",
      "It is deleted after 90 days, or sooner when you ask AskRigor to delete it with the code it gives you when you send it.",
      "To delete a shared question and answer sooner, ask AskRigor to delete it with the code it gave you when you sent it",
    ]) expect(privacy).toContain(fragment);
    const support = await pageHtml("site/support/index.html");
    expect(support).toContain("<section><h2>Shared questions and answers</h2><p>If you sent AskRigor a de-identified " +
      "copy of a question and its answer, ask AskRigor in the same app to delete it, with the code it gave you when " +
      "you sent it.");
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

  it("points crawlers to the sitemap of reviewed findings and lets them read every finding page's noindex", async () => {
    const robots = await readFile(rootFile("site/robots.txt"), "utf8");
    expect(validateRobots(robots)).toEqual([]);
    expect(robots).toContain("Sitemap: https://askrigor.com/atlas/sitemap.xml");
    for (const blocked of ["Disallow: /", "Disallow: /atlas/findings", "Disallow: /atlas/topics/", "Disallow: /atlas"]) {
      expect(validateRobots(`User-agent: *\n${blocked}\nDisallow: /atlas/search\nSitemap: https://askrigor.com/atlas/sitemap.xml\n`),
        blocked).toHaveLength(1);
    }
    expect(validateRobots("User-agent: *\n")).toHaveLength(2);
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

describe("the phone page's folder (owner answer 385b)", () => {
  const sha256 = (content: string | Buffer) => createHash("sha256").update(content).digest("hex");
  const sums = (files: Map<string, string | Buffer>) =>
    [...files].map(([name, content]) => `${sha256(content)}  ${name}\n`).join("");
  const goodIndex = [
    "<!doctype html>",
    '<html lang="en">',
    '<head><meta charset="utf-8"><link rel="stylesheet" href="app.css"><link rel="manifest" href="manifest.webmanifest">',
    '<script src="app.js" defer></script><script type="module" src="./link.js"></script></head>',
    '<body><main id="app"></main><script src="link.js"></script></body>',
    "</html>",
    ""
  ].join("\n");
  const phoneFiles = (index = goodIndex) => new Map<string, string | Buffer>([
    ["index.html", index],
    ["app.css", "body { margin: 0; }\n"],
    ["app.js", "export const app = 1;\n"],
    ["link.js", "export const link = 2;\n"],
    ["manifest.webmanifest", '{"name":"AskRigor"}\n'],
    ["icon-192.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 1])],
    ["icon-512.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 2])],
    ["BUILD.json", '{"built":"test"}\n']
  ]);

  /** A copy of the real site with a phone folder (or none), validated as a whole. */
  async function validateWith(phone?: { files: Map<string, string | Buffer>; sums?: string },
    change?: (site: string) => Promise<void>): Promise<string[]> {
    const fixture = await mkdtemp(join(tmpdir(), "askrigor-phone-site-"));
    try {
      const site = join(fixture, "site");
      const realSite = fileURLToPath(rootFile("site"));
      await cp(realSite, site, { recursive: true, filter: (source) => !source.startsWith(join(realSite, "phone")) });
      if (phone !== undefined) {
        await mkdir(join(site, "phone"));
        for (const [name, content] of phone.files) await writeFile(join(site, "phone", name), content);
        await writeFile(join(site, "phone", "SHA256SUMS"), phone.sums ?? sums(phone.files));
      }
      await change?.(site);
      return (await validatePublicSite(pathToFileURL(`${site}/`))).errors;
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  }

  it("accepts a site without the folder and a complete folder with its right hashes", async () => {
    expect(await validateWith()).toEqual([]);
    expect(await validateWith({ files: phoneFiles() })).toEqual([]);
  });

  it("refuses inline script in the phone page", async () => {
    for (const script of ["<script>alert(1)</script>", '<script src="app.js">alert(1)</script>']) {
      const errors = await validateWith({ files: phoneFiles(goodIndex.replace("</body>", `${script}</body>`)) });
      expect(errors, script).toContain("phone/index.html: must not contain inline script");
    }
    const handler = await validateWith({ files: phoneFiles(goodIndex.replace("<body>", '<body onload="go()">')) });
    expect(handler).toEqual(["phone/index.html: must not contain inline script: onload"]);
    const url = await validateWith({ files: phoneFiles(goodIndex.replace('<main id="app">', '<a href="javascript:go()">x</a><main id="app">')) });
    expect(url).toEqual(["phone/index.html: must not contain javascript: URLs"]);
    const unclosed = await validateWith({ files: phoneFiles(goodIndex.replace("</body>", '<script src="app.js"></body>')) });
    expect(unclosed).toContain("phone/index.html: has a script tag that is not a whole <script src></script>");
  });

  it("refuses a script from another origin or another folder", async () => {
    for (const source of ["https://cdn.example.com/app.js", "//cdn.example.com/app.js", "/phone/app.js", "../assets/app.js",
      "missing.js", "data:text/javascript,1"]) {
      const errors = await validateWith({ files: phoneFiles(goodIndex.replace('src="link.js"', `src="${source}"`)) });
      expect(errors, source).toEqual([`phone/index.html: may load script only from its own folder: ${source}`]);
    }
  });

  it("refuses a wrong hash, a missing file and an extra file", async () => {
    const files = phoneFiles();
    const listed = sums(files);
    files.set("app.js", "export const app = 666;\n");
    expect(await validateWith({ files, sums: listed })).toEqual(["phone/SHA256SUMS: has the wrong SHA-256 for app.js"]);

    const missing = phoneFiles();
    const missingSums = sums(missing);
    missing.delete("icon-512.png");
    expect(await validateWith({ files: missing, sums: missingSums })).toEqual([
      "phone/icon-512.png: required file is missing",
      "phone/SHA256SUMS: lists icon-512.png, which is not one of the folder's other files"
    ]);

    const unlisted = phoneFiles();
    const unlistedSums = sums(new Map([...unlisted].filter(([name]) => name !== "BUILD.json")));
    expect(await validateWith({ files: unlisted, sums: unlistedSums })).toEqual(["phone/SHA256SUMS: does not list BUILD.json"]);

    const extra = phoneFiles();
    extra.set("extra.js", "export {};\n");
    expect(await validateWith({ files: extra })).toEqual(["phone/extra.js: unexpected file"]);
    const nested = await validateWith({ files: phoneFiles() }, async (site) => {
      await mkdir(join(site, "phone", "more"));
      await writeFile(join(site, "phone", "more", "x.js"), "1");
    });
    expect(nested).toContain("phone/more/x.js: unexpected file");
    expect(nested).toContain("phone/SHA256SUMS: does not list more/x.js");
  });

  it("reads SHA256SUMS strictly: sha256sum's lines, each file once, never itself", async () => {
    const files = phoneFiles();
    const listed = sums(files);
    const [first] = listed.split("\n");
    for (const [sumsText, error] of [
      [listed.replace("  ", " "), "has a line that is not"],
      [listed.replace(first, first.toUpperCase().replace("  INDEX.HTML", "  index.html")), "has a line that is not"],
      [listed.replaceAll("\n", "\r\n"), "has a line that is not"],
      [`${listed}\n`, "has a line that is not"],
      [`${listed}${first}\n`, "lists index.html twice"],
      [`${listed}${sha256("x")}  SHA256SUMS\n`, "lists SHA256SUMS, which is not one of the folder's other files"]
    ] as const) {
      const errors = await validateWith({ files, sums: sumsText });
      expect(errors.some((entry) => entry.startsWith("phone/SHA256SUMS: ") && entry.includes(error)), error).toBe(true);
    }
    // sha256sum's own output, with or without its last newline, is accepted.
    expect(await validateWith({ files, sums: listed.slice(0, -1) })).toEqual([]);
  });

  it("keeps the no-script rule on every other page", async () => {
    const errors = await validateWith({ files: phoneFiles() }, async (site) => {
      const page = join(site, "index.html");
      await writeFile(page, (await readFile(page, "utf8")).replace("</body>", '<script src="phone/app.js"></script></body>'));
    });
    expect(errors).toEqual(["index.html: must not contain scripts"]);
  });
});
