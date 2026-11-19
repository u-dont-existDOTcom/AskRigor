/**
 * Atlas Release B: "Is something here wrong about a person? Tell AskRigor" (design 4.6). A short form with no sign-in:
 * the sentence, what is wrong, an optional source link and an optional email address for a reply, and whether it is a
 * legal notice or a request about the sender's personal data (Fable 4.7). The server makes no model call on a dispute;
 * a missed-claim report is read again by its sentence's key, never the sender's words (Fable 4.6c).
 */
import { createHash, randomBytes } from "node:crypto";

import type { AtlasPersonDisputeInput, AtlasPersonDisputeOutcome } from "@askrigor/evidence-repository";

import type { ShownFinding } from "./page-data.js";
import { findingPath, html, page, type AtlasPageReader } from "./pages.js";
import {
  PERSON_DISPUTE_LINK,
  PERSON_LEGAL_WORDS,
  personDisputeWanted,
  type PersonViewSentence,
} from "./person-claims.js";

export const personDisputePath = (publicationNumber: string) => `${findingPath(publicationNumber)}/person`;
export const PERSON_DISPUTE_ROUTE = /^\/atlas\/findings\/(P-[1-9][0-9]{3,})\/person$/u;
export const newPersonDisputeToken = () => randomBytes(18).toString("base64url");
const MAX_WHAT = 2_000;

/** What the form offers: every sentence the page shows, the marked ones first; a taken-off or left-out one is gone. */
export function disputableSentences(finding: ShownFinding): PersonViewSentence[] {
  const order = (sentence: PersonViewSentence) =>
    sentence.verdict === "unverified" ? 0 : sentence.verdict === "sourced" ? 1 : 2;
  return (finding.personClaims?.sentences ?? [])
    .filter(({ verdict }) => verdict === "unverified" || verdict === "sourced" || verdict === "plain")
    .sort((left, right) => order(left) - order(right));
}

const optionText = (sentence: PersonViewSentence) => {
  const prefix = sentence.verdict === "unverified" ? "[Unverified claim] " : sentence.verdict === "sourced"
    ? "[A source supports it] " : "";
  const text = `${prefix}${sentence.text}`;
  return text.length <= 180 ? text : `${text.slice(0, 179).trimEnd()}…`;
};

export function renderAtlasPersonDispute(finding: ShownFinding, token: string, reader?: AtlasPageReader): string {
  const sentences = disputableSentences(finding);
  const body = html`<p class="breadcrumbs"><a href="/atlas">Atlas</a> › <a href="${findingPath(finding.publicationNumber)}">${finding.publicationNumber}</a></p>
<h1>${PERSON_DISPUTE_LINK}</h1>
<p>If a sentence in ${finding.publicationNumber} says something wrong about you or someone else, or names a person and isn’t marked, tell AskRigor here. You don’t need to sign in. Nobody else sees what you write.</p>
<ul>
<li>A claim about a named person that no source AskRigor could open supports comes off the pages at once, unless it speaks in the person’s favour, or more than 20 have come off across the Atlas that day; then AskRigor’s operator reads your report first.</li>
<li>A claim a source supports stays, marked as disputed, while AskRigor rechecks it against what you send.</li>
<li>AskRigor deletes your message, link and email address after 90 days. It keeps a short record: the date, the sentence and what was done.</li>
</ul>
<form method="post" action="${personDisputePath(finding.publicationNumber)}" class="person-dispute-form">
<input type="hidden" name="token" value="${token}">
<p><label for="person-sentence">The sentence</label><br>
<select id="person-sentence" name="sentence" required>
${sentences.map((sentence) => html`<option value="${sentence.key}">${optionText(sentence)}</option>
`)}</select></p>
<p><label for="person-what">What is wrong</label><br>
<textarea id="person-what" name="what" rows="5" maxlength="${MAX_WHAT}" required></textarea></p>
<p><label for="person-link">A link to a source, if you have one (optional)</label><br>
<input id="person-link" name="link" type="url" maxlength="500"></p>
<p><label for="person-email">Your email address, if you want a reply (optional)</label><br>
<input id="person-email" name="email" type="email" maxlength="200"></p>
<p><input id="person-legal" name="legal" type="checkbox" value="yes"> <label for="person-legal">This is a legal notice, or a request about my personal data (to see, correct or erase it)</label></p>
<p><button type="submit">Send to AskRigor</button></p>
</form>
<p class="aside">You can also write to <a href="mailto:joel@askrigor.com">joel@askrigor.com</a>.</p>`;
  return page({ path: null, noindex: true, noReferrer: true, reader, body,
    title: `${PERSON_DISPUTE_LINK} | AskRigor Atlas`,
    description: "Tell AskRigor about a sentence that is wrong about a named person." });
}

export type PersonDisputeProblem = "token" | "sentence" | "what" | "link" | "email";
export const PERSON_DISPUTE_PROBLEMS: Readonly<Record<PersonDisputeProblem, string>> = {
  token: "The form was incomplete. Nothing was sent: go back and try again.",
  sentence: "That sentence isn’t on the finding’s page any more, or the form didn’t name one. Nothing was sent.",
  what: `Say what is wrong, in at most ${MAX_WHAT} characters. Nothing was sent.`,
  link: "The link should be a web address starting with https:// or http://. Nothing was sent.",
  email: "That doesn’t look like an email address. Leave it empty if you don’t want a reply. Nothing was sent.",
};

const clean = (text: string) => text.replace(/[\p{Cc}\p{Cf}]+/gu, " ").replace(/\s+/gu, " ").trim();

/** The dispute a form asks for, checked against the sentences the page shows now. */
export function personDisputeOf(form: URLSearchParams, finding: ShownFinding, addressKey: string, now: Date):
  { ok: true; input: AtlasPersonDisputeInput } | { ok: false; problem: PersonDisputeProblem } {
  const token = form.get("token") ?? "";
  if (!/^[A-Za-z0-9_-]{16,64}$/u.test(token)) return { ok: false, problem: "token" };
  const sentence = disputableSentences(finding).find(({ key }) => key === form.get("sentence"));
  if (sentence === undefined) return { ok: false, problem: "sentence" };
  const what = clean(form.get("what") ?? "");
  if (what === "" || what.length > MAX_WHAT) return { ok: false, problem: "what" };
  const rawLink = clean(form.get("link") ?? "");
  let link: string | null = null;
  if (rawLink !== "") {
    try {
      const url = new URL(rawLink);
      if ((url.protocol !== "https:" && url.protocol !== "http:") || rawLink.length > 500) throw new Error("link");
      link = url.toString();
    } catch {
      return { ok: false, problem: "link" };
    }
  }
  const rawEmail = clean(form.get("email") ?? "");
  if (rawEmail !== "" && (rawEmail.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(rawEmail))) {
    return { ok: false, problem: "email" };
  }
  const { kind, wanted } = personDisputeWanted(sentence);
  const day = now.toISOString().slice(0, 10);
  return { ok: true, input: {
    idempotencyKey: token, publicationNumber: finding.publicationNumber, sentenceKey: sentence.key, kind, wanted,
    legal: form.get("legal") === "yes" || PERSON_LEGAL_WORDS.test(what),
    // A key for the day's limits only: the address itself is never stored, and days can't be linked.
    addressKey: createHash("sha256").update(`atlas-person-dispute\n${day}\n${addressKey}`).digest("hex"),
    foldedNames: sentence.foldedNames, sentence: sentence.text, whatIsWrong: what, sourceLink: link,
    email: rawEmail === "" ? null : rawEmail, at: now.toISOString(),
    readingDigest: finding.personClaims?.readingDigest ?? null,
  } };
}

const AFTER = " A copy someone fetched earlier may still show it for a while; the pages themselves change within a minute.";
const PRIVATE_NOTE = " Nobody else sees your message, and AskRigor deletes it, with any email address, after 90 days.";

/** The reply, by what the dispute did; a legal notice or data request also says it goes to the owner. */
export function personDisputeReply(outcome: AtlasPersonDisputeOutcome, legal: boolean, missed: boolean):
  { status: number; title: string; text: string } {
  const owner = legal ? " Because it reads as a legal notice or a request about personal data, it goes to AskRigor’s owner." : "";
  switch (outcome) {
    case "taken_off":
      return { status: 200, title: "Taken off the Atlas", text: `Thank you. That sentence is off the Atlas pages now, and ` +
        `it comes back only if a source supports it.${AFTER}${owner}${PRIVATE_NOTE}` };
    case "marked_disputed":
      return { status: 200, title: "Marked as disputed", text: "Thank you. A source AskRigor could open supports that " +
        `sentence, so it now shows as disputed while AskRigor rechecks it against what you sent.${owner}${PRIVATE_NOTE}` };
    case "queued":
    case "over_ceiling":
      return { status: 200, title: "Received", text: `Thank you. ${missed
        ? "AskRigor will check that sentence again for claims about people, and read your report."
        : "AskRigor’s operator will read your report and decide what to do with that sentence; it keeps its mark until then."}` +
        `${owner}${PRIVATE_NOTE}` };
    case "limited":
      return { status: 429, title: "Too many reports today", text: "AskRigor has had as many reports today as it takes " +
        "from one address, about one sentence or about one person. Nothing was sent: please try again tomorrow, or " +
        "write to joel@askrigor.com." };
  }
}
