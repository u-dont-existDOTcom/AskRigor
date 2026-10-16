import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

export const FINAL_CHECK_PANEL_URI = "ui://askrigor/final-check.html";

/** Convert only the bundle's final export list; package changes must fail visibly. */
export function inlineFinalCheckAppBundle(bundle: string): string {
  const statement = /\bexport\s*\{([^{}]*)\};?\s*$/u.exec(bundle);
  if (statement === null) throw new Error("MCP Apps bundle has no final export statement");
  const app = /(?:^|,)\s*([\w$]+)\s+as\s+App\s*(?=,|$)/u.exec(statement[1]!);
  if (app === null) throw new Error("MCP Apps bundle has no App export");
  return `${bundle.slice(0, statement.index)}\nconst App = ${app[1]};\n`;
}

// Plain JavaScript shared verbatim by the page and DOM tests, with no bundle dependencies.
export const FINAL_CHECK_PANEL_RENDER_SOURCE = String.raw`
function renderFinalCheck(doc, structuredContent) {
  const root = doc.getElementById("final-check-panel");
  const result = structuredContent && typeof structuredContent === "object" ? structuredContent : {};
  root.replaceChildren();
  function add(parent, tag, text) {
    const element = doc.createElement(tag);
    if (text !== undefined) element.textContent = text;
    parent.appendChild(element);
    return element;
  }
  function items(value) { return Array.isArray(value) ? value : []; }
  function list(parent, title, value, heading = "h2") {
    const entries = items(value);
    if (entries.length === 0) return;
    add(parent, heading, title);
    const ul = add(parent, "ul");
    entries.slice(0, 40).forEach((entry) => add(ul, "li", String(entry)));
    if (entries.length > 40) add(ul, "li", "and " + (entries.length - 40) + " more");
  }
  let heading = "AskRigor's final check could not run here";
  if (result.status === "ready") heading = "Checked by AskRigor's final check";
  if (result.status === "ready_with_limits") heading = "Checked by AskRigor's final check, with " + items(result.limits).length + " limit(s)";
  if (result.status === "not_ready") heading = "Not checked yet: " + items(result.next_steps).length + " step(s) left";
  add(root, "h1", heading);
  if (typeof result.check_line === "string") add(root, "p", result.check_line);
  list(root, "What the answer must say", result.caveats);
  list(root, "What the answer reports", result.must_report);
  if (items(result.sources?.validated).length || items(result.sources?.lead_only).length) {
    const studies = add(root, "section");
    add(studies, "h2", "Studies checked");
    list(studies, "Validated", result.sources.validated, "h3");
    list(studies, "Leads only", result.sources.lead_only, "h3");
  }
  list(root, "Communities searched", result.community?.communities_searched);
  if (typeof result.findings_card?.status === "string") {
    add(root, "h2", "Findings card");
    add(root, "p", result.findings_card.status);
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
body { margin: 0; padding: 16px; }
main { max-width: 72ch; margin: auto; overflow-wrap: anywhere; }
h1 { font-size: 1.15rem; margin: 0 0 12px; }
h2 { font-size: 1rem; margin: 16px 0 6px; }
h3 { font-size: .95rem; margin: 10px 0 4px; }
p { margin: 6px 0; white-space: pre-wrap; }
ul { margin: 4px 0; padding-left: 22px; }
li { margin: 4px 0; white-space: pre-wrap; }
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
