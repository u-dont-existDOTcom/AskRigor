import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  COMPLETE_CHECKS_TIP, FINAL_CHECK_PANEL_DIFFERENCE_LEAD, FINAL_CHECK_PANEL_SCOPE, FINAL_CHECK_PANEL_SOURCE_LINES_LEAD,
} from "./final-check-messages.js";

export const FINAL_CHECK_PANEL_URI = "ui://askrigor/final-check.html";
/**
 * ChatGPT's dedicated origin for the panel: the public MCP server's own origin, under OpenAI's own key. ui.domain would
 * carry it for every host, but Claude accepts only its hashed claudemcpcontent.com form there and shows an error
 * instead of the panel otherwise (Claude's MCP Apps troubleshooting guide), so ui.domain stays unset.
 */
export function finalCheckPanelWidgetDomain(env: NodeJS.ProcessEnv = process.env): string | undefined {
  try {
    const url = new URL(env.ASKRIGOR_OAUTH_RESOURCE_URL ?? "");
    return url.protocol === "https:" ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

/** Convert only the bundle's final export list; package changes must fail visibly. */
export function inlineFinalCheckAppBundle(bundle: string): string {
  const statement = /\bexport\s*\{([^{}]*)\};?\s*$/u.exec(bundle);
  if (statement === null) throw new Error("MCP Apps bundle has no final export statement");
  const app = /(?:^|,)\s*([\w$]+)\s+as\s+App\s*(?=,|$)/u.exec(statement[1]!);
  if (app === null) throw new Error("MCP Apps bundle has no App export");
  return `${bundle.slice(0, statement.index)}\nconst App = ${app[1]};\n`;
}

// Plain JavaScript shared verbatim by the page and DOM tests, with no bundle dependencies.
// The verdict line (owner question 108), followed by folded detail under a passing check or the unfinished steps and a
// tip for continuing (owner answer 187). All result text stays plain text in the sandboxed panel.
// A research turn calls the check several times, and the app shows this panel under each call: a not-ready call is
// usually a step on the way to a checked answer, so its line is not a warning (owner, 23 Oct: "on every turn, it says
// completion check failed"). An answer given before the check passed says so in its own last line. A stopped check is
// the turn's final result (owner answer 172a), so its line says it was not checked, and why. The call's notes are
// written for the AI to act on, so they come last, folded under one closed line that opens on a click (owner, 30 Oct:
// "i got this massive askrigor check panel").
// Owner answer 217b (2 Nov: "keep it folded, people can unfold if they want to see how the answer is different (and it
// should briefly explain why it's different), along with limits of checking"): under a passing check the panel no
// longer repeats the checked answer. One closed line opens the note comparing the answer with the quick answer the AI
// wrote down before the research, and another what the check covers and the answer's limits.
// Owner answer 220a (2 Nov): AskRigor never sees the answer the AI writes after the check, so what was checked also
// lists the figures of the checked answer, and a figure in the answer that isn't on that list was written after the
// check. A figure is a number in digits of any script, as written, with its decimal or group separators, a fraction's
// slash and a percent sign. Links, DOIs, PubMed numbers, citation markers, list numbers and the digits of a name such as
// COVID-19, B12 or ARF-0042 are not figures.
// Owner answer 237a (4 Nov): what was checked also lists each key claim's two quotes, looked up word for word in the text
// AskRigor fetched, and where each was found. A quote not found says so here, where the reader can see it.
export const FINAL_CHECK_PANEL_RENDER_SOURCE = String.raw`
const COMPLETE_CHECKS_TIP = ${JSON.stringify(COMPLETE_CHECKS_TIP)};
const CHECK_SCOPE = ${JSON.stringify(FINAL_CHECK_PANEL_SCOPE)};
const DIFFERENCE_LEAD = ${JSON.stringify(FINAL_CHECK_PANEL_DIFFERENCE_LEAD)};
const SOURCE_LINES_LEAD = ${JSON.stringify(FINAL_CHECK_PANEL_SOURCE_LINES_LEAD)};
function sourceLineOutcome(line) {
  const place = line.text === "abstract" ? "the paper's abstract"
    : line.text === "search_copy" ? "a copy the AI supplied, not one AskRigor fetched itself" : "the paper's full text";
  const where = (section) => typeof section === "string" && section !== "" ? " (" + section + ")" : "";
  const quote = (name, outcome, section) => outcome === "found" ? name + " found" + where(section)
    : outcome === "not_found" ? name + " NOT found" : name + " not looked up";
  if (line.reason === "not_a_key_source" || line.reason === "no_text" || line.reason === "text_unavailable") {
    return "not looked up: AskRigor has no text of this paper to look in.";
  }
  if (line.sentence === "found" && line.conclusion === "found" && line.text !== "search_copy") {
    return "\u2713 both quotes are in " + place + where(line.sentence_section) + where(line.conclusion_section) + ".";
  }
  return quote("the paper's sentence", line.sentence, line.sentence_section) + ", " +
    quote("its conclusion", line.conclusion, line.conclusion_section) + ", in " + place + ".";
}
function answerFigures(text) {
  const kept = text
    .replace(/\bhttps?:\/\/\S+|\bwww\.\S+|\b10\.\d{4,9}\/\S+|\bPMID:?\s*\d+/giu, " ")
    .replace(/\[\s*\p{Nd}+(?:\s*[,–-]\s*\p{Nd}+)*\s*\]/gu, " ")
    .replace(/^([ \t]*)\p{Nd}+[.)](?=\s)/gmu, "$1");
  const figure = /(?:(?<=^|[\s(\[])[−-])?(?<![\p{L}\p{Nd}_\/])(?<!\p{L}[-.])\p{Nd}+(?:[.,  ]\p{Nd}+)*(?:\/\p{Nd}+(?:[.,]\p{Nd}+)*)*(?:[   ]?[%‰٪])?/gu;
  const figures = [];
  for (const match of kept.matchAll(figure)) if (!figures.includes(match[0])) figures.push(match[0]);
  return figures;
}
function renderFinalCheck(doc, structuredContent) {
  const root = doc.getElementById("final-check-panel");
  const result = structuredContent && typeof structuredContent === "object" ? structuredContent : {};
  root.replaceChildren();
  const limits = Array.isArray(result.limits) ? result.limits.length : 0;
  let line = "AskRigor's final check could not run here.";
  if (result.status === "ready") line = "\u2713 Checked by AskRigor's final check.";
  if (result.status === "ready_with_limits") {
    line = "\u2713 Checked by AskRigor's final check, with " + limits + (limits === 1 ? " limit below." : " limits below.");
  }
  if (result.status === "not_ready") line = "AskRigor's final check asked for more work on this draft.";
  if (result.status === "stopped") {
    const reason = result.stopped && typeof result.stopped.short_reason === "string" ? result.stopped.short_reason : "";
    line = reason === "" ? "Not checked by AskRigor's final check." : "Not checked: " + reason + ".";
  }
  const paragraph = doc.createElement("p");
  paragraph.textContent = line;
  root.appendChild(paragraph);
  const appendText = (tag, text, parent = root) => {
    const element = doc.createElement(tag);
    element.textContent = text;
    parent.appendChild(element);
    return element;
  };
  const fold = (summary) => {
    const details = doc.createElement("details");
    appendText("summary", summary, details);
    root.appendChild(details);
    return details;
  };
  const strings = (list) => Array.isArray(list) ? list.filter((entry) => typeof entry === "string") : [];
  if (result.status === "ready" || result.status === "ready_with_limits") {
    const noted = typeof result.plain_answer_note === "string" && result.plain_answer_note.trim() !== "";
    if (noted) {
      const difference = fold("How this answer differs from a quick answer");
      appendText("p", DIFFERENCE_LEAD, difference);
      appendText("p", result.plain_answer_note, difference);
    }
    const sources = result.sources && typeof result.sources === "object" ? result.sources : {};
    const community = result.community && typeof result.community === "object" ? result.community : {};
    const checked = fold("What AskRigor checked" +
      (limits > 0 ? ", and this answer's " + limits + (limits === 1 ? " limit" : " limits") : ""));
    appendText("p", CHECK_SCOPE, checked);
    appendText("p", "Key studies whose methods were audited: " + strings(sources.validated).length +
      ". Used only as leads: " + strings(sources.lead_only).length +
      ". Communities searched: " + strings(community.communities_searched).length + ".", checked);
    if (typeof result.checked_answer === "string") {
      const figures = answerFigures(result.checked_answer);
      const other = (noted ? ", apart from the quick-answer note's," : "") + " was added";
      appendText("p", figures.length === 0
        ? "The answer AskRigor checked gives no figures, so any figure in the answer" + other + " after the check."
        : "Figures in the answer AskRigor checked: " + figures.join(" · ") + ". Any other figure in the answer" +
          other + " or changed after the check.", checked);
    }
    const quoted = Array.isArray(result.source_lines) ? result.source_lines.filter((line) => line && typeof line.label === "string") : [];
    if (quoted.length > 0) {
      appendText("p", SOURCE_LINES_LEAD, checked);
      const list = doc.createElement("ul");
      for (const line of quoted) appendText("li", line.label + ": " + sourceLineOutcome(line), list);
      checked.appendChild(list);
    }
    if (limits > 0) {
      const list = doc.createElement("ul");
      for (const limit of strings(result.limits)) appendText("li", limit, list);
      checked.appendChild(list);
    }
  }
  if (result.status === "stopped") {
    const appendSteps = (heading, steps) => {
      const texts = Array.isArray(steps) ? steps.filter((entry) => entry && typeof entry.step === "string") : [];
      if (texts.length === 0) return;
      appendText("h2", heading);
      const list = doc.createElement("ul");
      for (const entry of texts) appendText("li", entry.step, list);
      root.appendChild(list);
    };
    appendSteps("Checks AskRigor could not finish this turn:", result.stopped?.could_not);
    appendSteps("What the next turn can do:", result.stopped?.next_turn);
    appendText("p", COMPLETE_CHECKS_TIP);
  }
  const notes = Array.isArray(result.notes) ? result.notes.filter((note) => typeof note === "string") : [];
  if (notes.length > 0) {
    const details = doc.createElement("details");
    appendText("summary", "Notes for the AI (" + notes.length + ")", details);
    const list = doc.createElement("ul");
    for (const note of notes) appendText("li", note, list);
    details.appendChild(list);
    root.appendChild(details);
  }
}
`;

export const FINAL_CHECK_PANEL_BOOTSTRAP_SOURCE = String.raw`
const render = (structuredContent) => renderFinalCheck(document, structuredContent);
const app = new App({ name: "AskRigor final check", version: "1" });
app.ontoolresult = (r) => render(r?.structuredContent);
app.connect().catch(() => {
  const root = document.getElementById("final-check-panel");
  root.textContent = "AskRigor's final check result is not available here";
});
`;

let cachedHtml: string | undefined;

export function finalCheckPanelHtml(): string {
  if (cachedHtml !== undefined) return cachedHtml;
  const require = createRequire(import.meta.url);
  const bundle = inlineFinalCheckAppBundle(readFileSync(
    require.resolve("@modelcontextprotocol/ext-apps/app-with-deps"), "utf8"
  ));
  cachedHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:">
<title>AskRigor final check</title>
<style>
:root { color-scheme: light dark; font: 14px/1.45 system-ui, sans-serif; color: #20242a; background: #fff; }
body { margin: 0; padding: 10px 16px; }
main { max-width: 72ch; margin: auto; overflow-wrap: anywhere; }
p { margin: 0; white-space: pre-wrap; }
h2 { font-size: 1em; margin: 12px 0 4px; }
summary { margin: 12px 0 4px; cursor: pointer; }
ul { margin: 0 0 12px; padding-left: 20px; white-space: pre-wrap; }
@media (prefers-color-scheme: dark) { :root { color: #e7e9ed; background: #191b20; } }
</style>
</head>
<body>
<main id="final-check-panel"><p>Waiting for AskRigor's final check</p></main>
<script type="module">
${bundle}
${FINAL_CHECK_PANEL_RENDER_SOURCE}
${FINAL_CHECK_PANEL_BOOTSTRAP_SOURCE}
</script>
</body>
</html>`;
  return cachedHtml;
}
