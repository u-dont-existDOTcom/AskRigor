import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { COMPLETE_CHECKS_TIP } from "./final-check-messages.js";

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
// The verdict line (owner question 108), followed by the exact checked answer or the unfinished steps and a tip
// for continuing (owner answer 187). All result text stays plain text in the sandboxed panel.
// A research turn calls the check several times, and the app shows this panel under each call: a not-ready call is
// usually a step on the way to a checked answer, so its line is not a warning (owner, 23 Oct: "on every turn, it says
// completion check failed"). An answer given before the check passed says so in its own last line. A stopped check is
// the turn's final result (owner answer 172a), so its line says it was not checked, and why.
export const FINAL_CHECK_PANEL_RENDER_SOURCE = String.raw`
const COMPLETE_CHECKS_TIP = ${JSON.stringify(COMPLETE_CHECKS_TIP)};
function renderFinalCheck(doc, structuredContent) {
  const root = doc.getElementById("final-check-panel");
  const result = structuredContent && typeof structuredContent === "object" ? structuredContent : {};
  root.replaceChildren();
  const limits = Array.isArray(result.limits) ? result.limits.length : 0;
  let line = "AskRigor's final check could not run here.";
  if (result.status === "ready") line = "\u2713 Checked by AskRigor's final check.";
  if (result.status === "ready_with_limits") {
    line = "\u2713 Checked by AskRigor's final check. The answer states its " + limits + (limits === 1 ? " limit." : " limits.");
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
  if ((result.status === "ready" || result.status === "ready_with_limits") && typeof result.checked_answer === "string") {
    appendText("h2", "The answer as AskRigor checked it:");
    appendText("p", result.checked_answer);
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
