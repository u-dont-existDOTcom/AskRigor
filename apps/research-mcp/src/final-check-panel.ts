import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

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
// One line for the reader (owner question 108): whether AskRigor's final check passed on this answer, in AskRigor's own
// words. The limits are in the answer itself, which the check made sure of.
// A research turn calls the check several times, and the app shows this panel under each call: a not-ready call is
// usually a step on the way to a checked answer, so its line is not a warning (owner, 23 Oct: "on every turn, it says
// completion check failed"). An answer given before the check passed says so in its own last line.
export const FINAL_CHECK_PANEL_RENDER_SOURCE = String.raw`
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
  const paragraph = doc.createElement("p");
  paragraph.textContent = line;
  root.appendChild(paragraph);
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
