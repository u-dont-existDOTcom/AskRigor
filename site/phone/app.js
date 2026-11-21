// The runner's own page script (app/page.html at runner b2e7f17203d2), with api() handed to the phone link.

"use strict";
const $ = (id) => document.getElementById(id);
let state = null;            // the app's state: settings, choices, runs going, the plan's meter
let selected = null;         // {kind: "job", id} or {kind: "run", source, folder}
const jobs = {};             // id -> {events, next, view}
let clockOffset = 0;         // server time minus this browser's time, in ms
let armed = null;            // a Stop pressed once: {id, until}; a second press within 4 s stops the run

// ---- talking to the app -------------------------------------------------------------------------------
async function api(path, body) {
  return window.PhoneLink.request(path, body);
}

// ---- words and numbers --------------------------------------------------------------------------------
function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function duration(seconds) {
  seconds = Math.max(0, Math.round(seconds));
  if (seconds < 60) return seconds + " s";
  const m = Math.floor(seconds / 60), s = seconds % 60;
  if (m < 60) return m + " min " + String(s).padStart(2, "0") + " s";
  return Math.floor(m / 60) + " h " + String(m % 60).padStart(2, "0") + " min";
}
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function when(iso, withDay) {
  const d = typeof iso === "number" ? new Date(iso) : new Date(iso);
  if (isNaN(d)) return "";
  const hm = String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0");
  return (withDay ? DAYS[d.getUTCDay()] + " " : "") + d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + ", " + hm + " UTC";
}
function clockTime(iso) {
  const d = new Date(iso);
  return isNaN(d) ? "" : String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0") + " UTC";
}
// The runner's own version, apart from AskRigor's protocol versions: "Runner 2026.11.17.1 (da4567a)".
function runnerWords(r) {
  if (!r || !r.version) return "";
  return "Runner " + r.version + (r.commit ? " (" + r.commit + (r.modified ? ", modified" : "") + ")" : "");
}
function nameOf(list, id) { const hit = (list || []).find((x) => x.id === id); return hit ? hit.name : id; }
function settingsWords(s) {
  if (!s || !state) return "";
  const level = { low: "low", medium: "medium", high: "high", xhigh: "extra high", max: "max" }[s.effort] || "medium";
  const parts = [nameOf(state.models, s.model), level + " thinking",
    s.workers + (s.workers === 1 ? " worker" : " workers") + " at once",
    s.minutes ? s.minutes + " min" : "no time limit", s.plan_share ? s.plan_share + "% of the week" : "no plan-share limit",
    s.ask ? "may ask you" : "won't ask you", s.askrigor_tools ? "AskRigor's tools" : "web tools only"]
    .concat(s.compare ? ["compared with plain ChatGPT"] : []);
  return parts.join(" · ");
}

// ---- markdown, safely: everything is escaped first; only http(s) links become links ------------------
function safeUrl(url) {
  try { const u = new URL(url); return u.protocol === "https:" || u.protocol === "http:" ? u.href : null; }
  catch (e) { return null; }
}
function inline(raw, noLinks) {
  const slots = [];
  const keep = (html) => { slots.push(html); return "\u0000" + (slots.length - 1) + "\u0000"; };
  const link = (url, label) => keep('<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + label + "</a>");
  let s = String(raw).replace(/\u0000/g, "");
  s = s.replace(/`([^`\n]+)`/g, (_, code) => keep("<code>" + esc(code) + "</code>"));
  if (!noLinks) {
    s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s()]*(?:\([^\s()]*\)[^\s()]*)*)\)/g, (m, label, url) => {
      const u = safeUrl(url); return u ? link(u, inline(label, true)) : m; });
    s = s.replace(/<(https?:\/\/[^\s<>]+)>/g, (m, url) => { const u = safeUrl(url); return u ? link(u, esc(url)) : m; });
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"])/g, (m, pre, url) => {
      const u = safeUrl(url); return u ? pre + link(u, esc(url)) : m; });
  }
  s = esc(s);
  s = s.replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*\w])\*(?=\S)([^*\n]*?\S)\*(?![\w*])/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?!\w)/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, n) => slots[Number(n)]);
}
const indentOf = (line) => line.match(/^ */)[0].length;
const isItem = (line) => /^\s*(?:[-*+]|\d{1,3}[.)])\s+/.test(line);
const isRule = (line) => /^\s*(?:-\s*){3,}$|^\s*(?:\*\s*){3,}$|^\s*(?:_\s*){3,}$/.test(line);
const isTableRow = (line) => /^\s*\|.*\|\s*$/.test(line);
const isTableRule = (line) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
function startsBlock(lines, i) {
  const line = lines[i];
  return /^#{1,6}\s/.test(line) || /^\s*```/.test(line) || /^\s*>/.test(line) || isItem(line) || isRule(line) ||
    (isTableRow(line) && i + 1 < lines.length && isTableRule(lines[i + 1]));
}
function table(lines, i) {
  const cells = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const head = cells(lines[i]);
  const align = cells(lines[i + 1]).map((c) => (/^:-+:$/.test(c) ? "al-c" : /-+:$/.test(c) ? "al-r" : ""));
  const cls = (k) => (align[k] ? ' class="' + align[k] + '"' : "");
  let html = '<div class="table"><table><thead><tr>' + head.map((c, k) => "<th" + cls(k) + ">" + inline(c) + "</th>").join("") + "</tr></thead><tbody>";
  i += 2;
  while (i < lines.length && isTableRow(lines[i])) {
    html += "<tr>" + cells(lines[i]).map((c, k) => "<td" + cls(k) + ">" + inline(c) + "</td>").join("") + "</tr>";
    i++;
  }
  return [html + "</tbody></table></div>", i];
}
function list(lines, i) {
  const base = indentOf(lines[i]);
  const ordered = /^\s*\d/.test(lines[i]);
  const first = ordered ? parseInt(lines[i].trim(), 10) : 1;
  const items = [];
  while (i < lines.length && isItem(lines[i]) && indentOf(lines[i]) >= base && indentOf(lines[i]) < base + 2) {
    const marker = lines[i].match(/^(\s*)([-*+]|\d{1,3}[.)])(\s+)/);
    const inner = marker[0].length;
    const body = [lines[i].slice(inner)];
    i++;
    while (i < lines.length) {
      const line = lines[i];
      if (/^\s*$/.test(line)) {
        let j = i + 1;
        while (j < lines.length && /^\s*$/.test(lines[j])) j++;
        if (j < lines.length && indentOf(lines[j]) >= base + 2) { while (i < j) { body.push(""); i++; } continue; }
        break;
      }
      if (indentOf(line) < base + 2) {
        if (!isItem(line) && !startsBlock(lines, i) && body[body.length - 1] !== "" && indentOf(line) >= base) {
          body.push(line.trim()); i++; continue;   // a line that only carries on the item's text
        }
        break;
      }
      body.push(line.slice(Math.min(inner, indentOf(line))));
      i++;
    }
    items.push(body.join("\n"));
  }
  const tag = ordered ? "ol" : "ul";
  let html = "<" + tag + (ordered && first !== 1 ? ' start="' + first + '"' : "") + ">";
  for (const item of items) {
    let inner = markdown(item);
    const one = inner.match(/^<p>([\s\S]*?)<\/p>([\s\S]*)$/);
    if (one && !one[2].startsWith("<p>")) inner = one[1] + one[2];
    html += "<li>" + inner + "</li>";
  }
  return [html + "</" + tag + ">", i];
}
function markdown(source) {
  const lines = String(source || "").replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
  let html = "", i = 0;
  while (i < lines.length) {
    const line = lines[i];
    let m;
    if (/^\s*$/.test(line)) { i++; continue; }
    if (/^\s*```/.test(line)) {
      const code = []; i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
      i++;
      html += "<pre><code>" + esc(code.join("\n")) + "</code></pre>";
      continue;
    }
    if ((m = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) {
      const level = Math.min(6, m[1].length + 1);   // the page's own title is the h1
      html += "<h" + level + ">" + inline(m[2]) + "</h" + level + ">"; i++; continue;
    }
    if (isRule(line)) { html += "<hr>"; i++; continue; }
    if (/^\s*>/.test(line)) {
      const quoted = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) quoted.push(lines[i++].replace(/^\s*> ?/, ""));
      html += "<blockquote>" + markdown(quoted.join("\n")) + "</blockquote>";
      continue;
    }
    if (isTableRow(line) && i + 1 < lines.length && isTableRule(lines[i + 1])) { const [h, n] = table(lines, i); html += h; i = n; continue; }
    if (isItem(line)) { const [h, n] = list(lines, i); html += h; i = n; continue; }
    const para = [line.trim()]; i++;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !startsBlock(lines, i)) para.push(lines[i++].trim());
    html += "<p>" + para.map((p) => inline(p)).join(" ") + "</p>";
  }
  return html;
}

// ---- the final check, folded (begin: tests/app-tests runs this part) -------------------------------------------
// The program's final check under an answer is shown folded: one click opens it. A line of it that is a safety warning
// (Claude's safeguards stopped a reply) stays outside the fold, so it is seen without opening anything.
const CHECK_MARK = "\n---\n\n**Final check by the runner's program**";
const SAFETY_LINE = /^- \*\*Claude's safeguards stopped a reply\*\*/;
function checkFold(text) {
  text = String(text || "");
  const at = text.indexOf(CHECK_MARK);
  if (at < 0) return { answer: text, head: null, warnings: [], check: null, flagged: 0 };
  const lines = text.slice(at + "\n---\n\n".length).split("\n");
  const head = lines.shift();
  const warnings = [], kept = [];
  for (let i = 0; i < lines.length; i++) {
    if (SAFETY_LINE.test(lines[i])) {
      warnings.push(lines[i]);
      while (i + 1 < lines.length && /^\s+- /.test(lines[i + 1])) warnings.push(lines[++i]);
    } else kept.push(lines[i]);
  }
  const flagged = kept.filter((line) => /\bNOT\b|treat as unverified/.test(line)).length;
  return { answer: text.slice(0, at).trimEnd(), head, warnings, check: kept.join("\n").trim(), flagged };
}
// The limits of the answer (R15), which the program writes from its own record between the answer and its final
// check: the lines that could change the answer stay visible under it; how each source was read is in an HTML details
// element, which the page folds (one click opens it; printing opens it).
const LIMITS_MARK = "\n\n**Limits of this answer**";
function limitsFold(text) {
  text = String(text || "");
  const at = text.lastIndexOf(LIMITS_MARK);
  if (at < 0) return { answer: text, limits: null, summary: null, folded: null };
  const block = text.slice(at + 2);
  const open = block.indexOf("\n<details>");
  if (open < 0) return { answer: text.slice(0, at).trimEnd(), limits: block.trim(), summary: null, folded: null };
  const rest = block.slice(open + "\n<details>".length);
  const title = rest.match(/<summary>([^<\n]*)<\/summary>/);
  const from = title ? rest.indexOf(title[0]) + title[0].length : 0;
  const close = rest.lastIndexOf("</details>");
  return { answer: text.slice(0, at).trimEnd(), limits: block.slice(0, open).trim(),
    summary: title ? title[1] : "What was read, and what was not", folded: rest.slice(from, close < 0 ? rest.length : close).trim() };
}
// ---- the final check, folded (end) -----------------------------------------------------------------------------
// The first screen (design v2 of 19 Nov 2026 with the owner's choices 1a 2a 3a, and its v3 delta): the box the runner
// built and checked (presentation.json's glance), drawn by code. Each row's grade is a word; a range strip under each
// row with a range, on its own table's one scale, with a "no difference" line and the band of differences too small to
// matter for a comparison; an unknown row is patterned and gets no strip; the Dig deeper row last, with its buttons.
let boxContext = null;   // the run the box on screen belongs to: {source, folder, dig, done}
function num(v) { return Number(v).toLocaleString("en-US", { maximumFractionDigits: 6 }); }
function stripSvg(row, scale) {
  const e = row.estimate;
  if (!e || e.low == null || e.high == null || !scale || row.state || !(scale.high > scale.low)) return "";
  const W = 300, H = 30, pad = 8;
  const x = (v) => (pad + (v - scale.low) / (scale.high - scale.low) * (W - 2 * pad)).toFixed(1);
  const size = row.size_value && e.shape === "difference" ? row.size_value.value : null;
  let s = '<svg class="strip" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(row.what + ": " + num(e.low) + " to " + num(e.high)) + '">';
  if (size != null) s += '<rect class="zone" x="' + x(-size) + '" y="2" width="' + (x(size) - x(-size)).toFixed(1) + '" height="16"></rect>';
  if (scale.zero_line) s += '<line class="zero" x1="' + x(0) + '" x2="' + x(0) + '" y1="0" y2="20"></line>';
  s += '<rect class="bar" x="' + x(e.low) + '" y="7" width="' + Math.max(2, x(e.high) - x(e.low)).toFixed(1) + '" height="6"></rect>';
  if (e.value != null) s += '<circle class="est" cx="' + x(e.value) + '" cy="10" r="3.5"></circle>';
  s += '<text x="' + x(scale.low) + '" y="29">' + esc(num(Number(scale.low.toPrecision(3)))) + "</text>";
  s += '<text x="' + (W - pad) + '" y="29" text-anchor="end">' + esc(num(Number(scale.high.toPrecision(3)))) + (e.unit ? " " + esc(e.unit) : "") + "</text>";
  return s + "</svg>";
}
function glanceTableHtml(t) {
  const head = [];
  if (t.base) head.push(esc((t.base.counts || "counted") + " per " + num(t.base.per || 0)));
  for (const k of ["people", "exposure", "time", "design", "figure_kind", "source"]) if (t[k]) head.push(k === "source" ? inline(t[k]) : esc(t[k]));
  if (t.read) head.push("read: " + esc(t.read));
  let h = '<div class="gblock"><div class="gbh"><b>' + esc(t.title) + "</b>" + (head.length ? " <small>" + head.join(" · ") + "</small>" : "") + "</div>";
  h += '<table class="gtable"><colgroup><col class="gw28"><col class="gw47"><col class="gw25"></colgroup><tr><th>What</th><th>How much</th><th>Grade</th></tr>';
  let ranged = false;
  for (const r of t.rows || []) {
    const how = r.state ? "<i>" + esc(r.state) + "</i>" : inline(r.text || "");
    const label = r.label ? ' <span class="ggrade">' + esc(r.label) + "</span>" : "";
    const known = (r.known ? "<br><small>" + esc(r.known) + "</small>" : "") +
      (!r.state && r.estimate && r.estimate.range_type ? "<br><small>range: " + esc(r.estimate.range_type) + "</small>" : "");
    const grade = r.grade ? '<span class="ggrade">' + esc(r.grade) + "</span>" + (r.grade_why ? " <small>" + esc(r.grade_why) + "</small>" : "") : "";
    h += '<tr class="' + (r.state ? "gunknown" : "") + '"><td>' + esc(r.what || "") + (r.unchecked ? ' <small class="muted">(not fully checked)</small>' : "") + "</td><td>" + how + label + known + "</td><td>" + grade + "</td></tr>";
    const strip = stripSvg(r, t.scale);
    if (strip) { ranged = true; h += '<tr class="gstrip"><td colspan="3">' + strip + "</td></tr>"; }
  }
  h += "</table></div>";
  if (ranged) h += '<details class="grange"><summary>What is this range?</summary><p class="muted">The bar runs from the lowest to the highest figure the source gives, the dot is its estimate, and the kind of range is named in the row: a study\'s margin of error, the spread between people, or a range across studies or samples. For a comparison, the line is "no difference" and the shaded band holds differences too small to matter, as the plan set them before the research.</p></details>';
  return h;
}
function glanceHtml(g, marks) {
  if (!g || !g.box) return "";
  const labels = g.labels || {};
  const mark = (line) => boxMark(marks, line);   // Codex's review of 50860a7, point 8: the quiet mark on a box line
  let h = '<section class="glance" aria-label="The answer at a glance">';
  const warn = g.warning ? '<p class="gwarn"><b>Warning:</b> ' + inline(g.warning) + mark("warning") + "</p>" : "";
  if (g.warning_first !== false) h += warn;   // owner 382a: after the takeaway unless the writer put it first
  if (g.takeaway) h += '<p class="gtake">' + inline(g.takeaway) + mark("takeaway") + "</p>";
  if (g.warning_first === false) h += warn;
  // Fable's recheck of round D, item 4: what the run assumed when it could not ask, right under the takeaway
  if (g.assumed) h += '<p class="gline muted">' + esc(g.assumed) + "</p>";
  // Fable's check of the box (20 Nov 2026), items 1 and 4: what was not fully checked, in plain words, under the
  // takeaway (never a mark above the warning); the approaches people report most, with the program's counts
  // Round E (both audits): the question the run could not ask, the step the person can take and what a safety stop or
  // a research step left out come next, on a phone's first screen; what was not fully checked comes after them
  if (g.question) h += '<p class="gline"><b>The question I could not ask you first:</b> ' + esc(g.question) + "</p>";
  if (g.you_can) h += '<p class="gline"><b>You can:</b> ' + inline(g.you_can) + mark("you_can") + "</p>";
  for (const line of g.left_out_lines || []) { const at = line.indexOf(": "); h += '<p class="gline"><b>' + esc(at > 0 ? line.slice(0, at) : line) + ":</b> " + esc(at > 0 ? line.slice(at + 2) : "") + "</p>"; }
  if (g.most_reported && g.most_reported.length) h += '<p class="gline"><b>Most reported</b> <small>(described, not tested)</small>: ' + g.most_reported.map((m) => esc(m.method) + " (" + (m.note ? esc(m.note) : num(m.reports)) + ")").join("; ") + ".</p>";
  if (g.unchecked && g.unchecked.length) h += '<p class="gline muted">Not fully checked: ' + esc(g.unchecked.join("; ")) + ".</p>";
  if (g.other_side) h += '<p class="gline"><b>' + esc(labels.other_side || "Other side") + ":</b> " + inline(g.other_side) + mark("other_side") + "</p>";
  if (g.tested) h += '<p class="gline"><b>' + esc(labels.tested || "What was tested") + ":</b> " + inline(g.tested) + mark("tested") + "</p>";
  if (g.not_known) h += '<p class="gline"><b>Not known:</b> ' + inline(g.not_known) + mark("not_known") + "</p>";
  h += '<p class="gt2">More detail</p>';
  const based = (g.tables || []).filter((t) => t.base);
  for (const t of g.tables || []) h += glanceTableHtml(t);
  if (based.length > 1) h += '<p class="gline muted">Each table counts its own people over its own time. Don\'t add or subtract across tables.</p>';
  if (g.methods && g.methods.length) {
    const unit = (g.reports && g.reports.unit) === "people" ? ["person", "people"] : ["report", "reports"];
    h += '<div class="gblock"><div class="gbh"><b>What people report trying, by what each needs beyond what you have</b> <small>· described, not recommended' + (g.reports_caution ? " · " + esc(g.reports_caution) : "") + '</small></div>';
    h += '<table class="gtable"><colgroup><col class="gw34"><col class="gw66"></colgroup><tr><th>Needs</th><th>Approaches reported</th></tr>';
    for (const m of g.methods) h += "<tr><td>" + esc(m.needs) + "</td><td>" + m.methods.map((x) => esc(x.method) + (x.reports ? ' <small class="muted">(' + num(x.reports) + " " + (x.reports === 1 ? unit[0] : unit[1]) + ")</small>" : "")).join("; ") + "</td></tr>";
    h += "</table>" + (g.methods_note ? '<p class="gnote">' + esc(g.methods_note) + "</p>" : "") + (g.method_order_why ? '<p class="gnote"><b>Why this order:</b> ' + esc(g.method_order_why) + "</p>" : "") + "</div>";
  }
  if (g.options_table) h += '<div class="answer">' + markdown(g.options_table) + "</div>";
  const o = g.official;
  if (o && o.who) h += '<p class="gline"><b>Official advice</b> (' + esc(o.who) + ", " + esc(o.when || "date not given") + "): " + esc(o.advice || "") + " <b>This evidence:</b> " + esc(o.evidence || "") + "</p>";
  const trust = [];
  if (g.doubt) trust.push("<li><b>My main doubt:</b> " + inline(g.doubt) + "</li>");
  if (g.couldnt_check && g.couldnt_check.length) trust.push("<li><b>Couldn't check:</b> " + g.couldnt_check.map((c) => inline(c)).join("; ") + "</li>");
  if (trust.length) h += '<ul class="gtrust">' + trust.join("") + "</ul>";
  if (g.dig_deeper) {
    const sw = (state && state.switches) || {};
    const ctx = boxContext || {};
    h += '<div class="gdig"><p><b>Dig deeper:</b> ' + esc(g.dig_deeper.text) + "</p>" + (g.dig_deeper.status ? '<p class="muted">' + esc(g.dig_deeper.status) + "</p>" : "") + "<div class=\"row\">";
    if (ctx.folder && ctx.done) h += '<button class="primary" id="digBtn">Dig deeper with my AI</button>';
    if (sw.own_reports) h += '<button id="knowBtn">Add what I know</button>';
    if (sw.atlas_send && ctx.dig && ctx.done) h += '<button id="atlasBtn">Send to the Atlas</button>';
    h += '<span class="err" id="digNote"></span></div>';
    if (sw.own_reports) h += '<div class="gknow" id="knowForm" hidden><p class="muted">Goes to the Atlas as your own report, checked before it shows. No names, contact details or other people\'s health details: they are never published.</p>' +
      '<input id="knowTried" maxlength="300" placeholder="What you tried or saw"><input id="knowLong" maxlength="200" placeholder="For how long">' +
      '<textarea id="knowWhat" rows="3" maxlength="3000" placeholder="What happened"></textarea><input id="knowSide" maxlength="1000" placeholder="Any side effects">' +
      '<input id="knowLinks" maxlength="1000" placeholder="Links (optional)"><div class="row"><button class="primary" id="knowSend">Send my report</button></div></div>';
    h += "</div>";
  }
  return h + "</section>";
}
function wireBox() {
  const ctx = boxContext || {};
  const note = (t) => { if ($("digNote")) $("digNote").textContent = t; };
  const dig = $("digBtn");
  if (dig) dig.addEventListener("click", async () => {
    dig.disabled = true; note("Starting…");
    try {
      const view = await api("/api/dig-deeper", { source: ctx.source, folder: ctx.folder, settings: formSettings() });
      jobs[view.id] = { events: [], next: 0, view: null };
      await refreshState();
      await selectJob(view.id);
    } catch (e) { note(e.message); dig.disabled = false; }
  });
  if ($("knowBtn")) $("knowBtn").addEventListener("click", () => { $("knowForm").hidden = !$("knowForm").hidden; });
  if ($("knowSend")) $("knowSend").addEventListener("click", async () => {
    const report = { tried: $("knowTried").value, how_long: $("knowLong").value, what_happened: $("knowWhat").value, side_effects: $("knowSide").value, links: $("knowLinks").value };
    try { const r = await api("/api/atlas/report", { source: ctx.source, folder: ctx.folder, report }); note(r.message || "Sent."); } catch (e) { note(e.message); }
  });
  if ($("atlasBtn")) $("atlasBtn").addEventListener("click", async () => {
    try { const r = await api("/api/atlas/send", { source: ctx.source, folder: ctx.folder }); note(r.message || "Sent."); } catch (e) { note(e.message); }
  });
}
// R45 (Codex's red team of the vaccine run, fix 4): the runner writes one presentation model of what the person sees
// (presentation.json); answer.md and the comparison's judge are made from it, and so is this page. Its default view is
// the answer with the program's notes beside its claims, the short summary of what the program checked, the limits that
// stand under the answer and the final check's safety lines; each fold opens with one click (printing opens it).
// Owner 382a: a sentence the program could not match to its source gets a quiet mark here, never in the answer's text
// (answer.md and the blind judge's copy have none); the final check lists each with its reason. Owner 383a: a sentence
// the reading after writing marked (a model that only marks) gets the same quiet mark, with its own tooltip.
function withMarks(text, marks) {
  for (const m of marks || []) {
    const at = m && m.text ? text.indexOf(m.text) : -1;
    if (at >= 0) text = text.slice(0, at + m.text.length) + (m.by === "reading" ? "\uE001" : "\uE000") + text.slice(at + m.text.length);
  }
  return text;
}
// Codex's review of 50860a7, point 8: a mark on a line the box draws from the answer's first lines (the takeaway, the
// warning, ...) gets the same quiet mark at that line's end, with its tooltip; never the mark's reason
function boxMark(marks, line) {
  const signs = (marks || []).filter((m) => m && m.line === line).map((m) => (m.by === "reading" ? "\uE001" : "\uE000"));
  return quietMarks(signs.filter((sign, at) => signs.indexOf(sign) === at).join(""));
}
function quietMarks(html) {
  return html.split("\uE000").join('<sup class="qmark" title="Not matched to its source by the program\u2019s word match: see the final check">\u00b0</sup>')
    .split("\uE001").join('<sup class="qmark" title="Marked by the reading after writing, a model that only marks: see the final check">\u00b0</sup>');
}
function presentationHtml(p) {
  const v = p.default_view || {};
  let html = v.glance && v.glance.box   // the first screen, then the answer after its Tier 1 lines
    ? (p.preface ? '<div class="answer">' + markdown(p.preface) + "</div>" : "") + glanceHtml(v.glance, v.box_marks) + '<div class="answer">' + quietMarks(markdown(withMarks(v.answer_body || "", v.marks))) + "</div>"
    : '<div class="answer">' + quietMarks(markdown(withMarks((p.preface ? p.preface + "\n\n" : "") + (v.answer || ""), v.marks))) + "</div>";
  const folds = (p.expandable || []).filter((s) => s.id !== "final_check");
  html += '<div class="answer limits">' + markdown(v.limits_title || "");
  if (v.status) html += '<p class="check-status">' + inline(v.status) + "</p>";
  if (v.notices && v.notices.length) html += markdown(v.notices.map((n) => "- " + n).join("\n"));
  if (v.table) html += markdown(v.table);
  for (const s of folds) html += '<details class="limits-fold"><summary>' + esc(s.title) + "</summary>" + markdown(s.text) + "</details>";
  html += "</div>";
  if (v.warnings && v.warnings.length) html += '<div class="answer final-check-warning">' + markdown(v.warnings.join("\n")) + "</div>";
  const check = (p.expandable || []).find((s) => s.id === "final_check");
  const last = p.runner_line ? '<p class="muted runner-line">' + esc(p.runner_line) + "</p>" : "";   // as answer.md ends
  if (!check) return html + last;
  const shown = new Set(v.warnings || []);
  const lines = String(check.text || "").split("\n").filter((line) => !shown.has(line));
  const flagged = lines.filter((line) => /\bNOT\b|treat as unverified/.test(line)).length;
  return html + '<details class="final-check"><summary>' + inline(check.title) +
    (flagged ? '<span class="flag">' + flagged + (flagged === 1 ? " point" : " points") + " to look at</span>" : "") +
    '</summary><div class="answer">' + markdown(lines.join("\n")) + "</div></details>" + last;
}
function answerHtml(text, presentation) {
  if (presentation && presentation.version === 1 && presentation.default_view) return presentationHtml(presentation);
  const parts = checkFold(text);
  const limits = limitsFold(parts.answer);
  let html = '<div class="answer">' + markdown(limits.answer) + "</div>";
  if (limits.limits !== null) {
    html += '<div class="answer limits">' + markdown(limits.limits);
    if (limits.folded !== null) {
      html += '<details class="limits-fold"><summary>' + esc(limits.summary) + "</summary>" + markdown(limits.folded) + "</details>";
    }
    html += "</div>";
  }
  if (parts.check === null) return html;
  if (parts.warnings.length) html += '<div class="answer final-check-warning">' + markdown(parts.warnings.join("\n")) + "</div>";
  return html + '<details class="final-check"><summary>' + inline(parts.head) +
    (parts.flagged ? '<span class="flag">' + parts.flagged + (parts.flagged === 1 ? " point" : " points") + " to look at</span>" : "") +
    '</summary><div class="answer">' + markdown(parts.check) + "</div></details>";
}

// ---- conversations (begin) -------------------------------------------------------------------------------------
// The owner, 15 Nov 2026: replies to an answer, as in the Claude app. A reply is a run of its own (askrigor-run
// --follow-up) that follows the answer it replies to; past runs list each conversation together, the newest first,
// each reply under the answer it replies to.
function pastRowsHtml(runs) {
  return '<div class="pastlist">' + runs.map((r) => {
    const tags = [];
    if (r.lane) tags.push(r.lane);
    if (typeof r.seconds === "number") tags.push(duration(r.seconds));
    if (r.status !== "done") tags.push(r.status);
    if (r.source === "main") tags.push("first copy");
    return '<button class="runrow' + (r.depth ? " reply" : "") + '" data-source="' + esc(r.source) + '" data-folder="' + esc(r.folder) + '">' +
      '<span class="when">' + esc(when(r.started_utc)) + '</span><span class="q">' + esc(r.question || "(no question kept)") + "</span>" +
      '<span class="tags">' + tags.map((t) => '<span class="tag">' + esc(t) + "</span>").join("") + "</span></button>";
  }).join("") + "</div>";
}
function conversationHtml(list) {   // the runs of one conversation, this one in bold, the others one click away
  if (!list || list.length < 2) return "";
  return '<div class="thread"><b>This conversation</b><ol>' + list.map((c) =>
    "<li" + (c.depth ? ' class="reply"' : "") + ">" + (c.current ? "<b>" + esc(c.question || "(no question kept)") + "</b>" :
      '<button data-source="' + esc(c.source) + '" data-folder="' + esc(c.folder) + '">' + esc(c.question || "(no question kept)") + "</button>") +
    "</li>").join("") + "</ol></div>";
}
function replyBoxHtml() {   // under a finished answer, the latest of its conversation
  return '<div class="follow"><textarea id="followText" rows="2" placeholder="Reply to this answer"></textarea>' +
    '<div class="row"><button class="primary" id="followBtn">Reply</button><span class="muted desk-only">Ctrl+Enter sends it too.</span>' +
    '<span class="err" id="followNote"></span></div></div>';
}
// ---- conversations (end) ---------------------------------------------------------------------------------------

// ---- the settings form ----------------------------------------------------------------------------------
function fillSettings() {
  const s = state.settings;
  const fill = (id, options, value) => {
    const el = $("s-" + id);
    el.innerHTML = options.map((o) => '<option value="' + esc(o.value) + '"' + (o.disabled ? " disabled" : "") + ">" + esc(o.label) + "</option>").join("");
    el.value = String(value);
  };
  fill("provider", state.providers.map((p) => ({ value: p.id, label: p.name + (p.ready ? "" : " (not built yet)"), disabled: !p.ready })), s.provider);
  fill("model", state.models.map((m) => ({ value: m.id, label: m.name })), s.model);
  fill("effort", state.efforts.map((e) => ({ value: e.id, label: e.name })), s.effort);
  fill("workers", [1, 2, 3, 4].map((n) => ({ value: n, label: n === 1 ? "1 (one after another)" : String(n) })), s.workers);
  fill("minutes", state.minutes.map((n) => ({ value: n, label: n ? n + " minutes" : "No limit" })), s.minutes);
  fill("plan_share", state.plan_shares.map((n) => ({ value: n, label: n ? n + "% of the week" : "No limit" })), s.plan_share);
  $("s-ask").checked = s.ask;
  $("s-askrigor_tools").checked = s.askrigor_tools;
  $("s-compare").checked = !!s.compare;
  const provider = state.providers.find((p) => p.id === s.provider);
  $("s-provider").title = provider ? provider.how : "";
}
function formSettings() {
  const number = (id) => Number($("s-" + id).value);
  return { provider: $("s-provider").value, model: $("s-model").value, effort: $("s-effort").value,
    workers: number("workers"), minutes: number("minutes"), plan_share: number("plan_share"),
    ask: $("s-ask").checked, askrigor_tools: $("s-askrigor_tools").checked, compare: $("s-compare").checked };
}
async function saveSettings() {
  try {
    const saved = await api("/api/settings", { settings: formSettings() });
    state.settings = saved.settings;
    $("saveNote").textContent = "Kept for next time.";
    setTimeout(() => { $("saveNote").textContent = ""; }, 2500);
  } catch (e) { $("saveNote").textContent = e.message; }
}

// ---- the plan's meter ---------------------------------------------------------------------------------------
function renderMeter() {
  const plan = state.plan;
  if (!plan || typeof plan.used !== "number") {
    $("meter").innerHTML = "<span>Claude plan: no reading yet (each run reports it)</span>";
    return;
  }
  const pct = Math.round(plan.used * 100);
  let words = "<span>Claude plan: <b>" + pct + "%</b> of this week's limit used</span>";
  words += '<span class="gauge" aria-hidden="true"><i id="gaugeFill"></i></span>';
  const parts = [];
  if (plan.as_of) parts.push((plan.from_run ? "at a run of " + when(plan.as_of) : "as of " + clockTime(plan.as_of)));
  if (plan.resets_at) parts.push("resets " + when(plan.resets_at * 1000, true));
  if (parts.length) words += "<span>" + esc(parts.join(" · ")) + "</span>";
  $("meter").innerHTML = words;
  $("gaugeFill").style.width = Math.min(100, Math.max(0, pct)) + "%";
}

// ---- runs going ---------------------------------------------------------------------------------------------
function renderGoing() {
  const going = state.running || [];
  const live = going.filter((j) => j.running);
  document.title = live.length ? "AskRigor runner (" + live.length + " running)" : "AskRigor runner";
  const onlyOneAndShown = going.length === 1 && selected && selected.kind === "job" && selected.id === going[0].id;
  if (!going.length || onlyOneAndShown) { $("going").innerHTML = ""; return; }
  $("going").innerHTML = going.map((j) => {
    const on = selected && selected.kind === "job" && selected.id === j.id;
    const label = (j.waiting_for_reply ? "Waiting for you: " : j.running ? "Running: " : "") + j.question;
    return '<button data-job="' + esc(j.id) + '" class="' + (on ? "on" : "") + '" title="' + esc(j.question) + '">' + esc(label.slice(0, 70)) + "</button>";
  }).join("");
  for (const b of $("going").querySelectorAll("button")) b.addEventListener("click", () => selectJob(b.dataset.job));
}

// ---- one run ----------------------------------------------------------------------------------------------------
function statusChip(view) {
  const now = Date.now() + clockOffset;
  const started = new Date(view.started_utc).getTime();
  if (view.running) {
    if (view.waiting_for_reply) return '<span class="chip waiting">Waiting for your reply</span>';
    return '<span class="chip running">Running · ' + duration((now - started) / 1000) + "</span>";
  }
  const ended = view.ended_utc ? new Date(view.ended_utc).getTime() : null;
  const took = ended ? " in " + duration((ended - started) / 1000) : "";
  const words = { done: "Done" + took, stopped: "Stopped", interrupted: "Stopped by you", failed: "Ended with an error" };
  return '<span class="chip ' + esc(view.status) + '">' + esc(words[view.status] || view.status) + "</span>";
}
function secondsWorking(events, running) {
  const start = events.find((e) => e.kind === "start");
  const end = [...events].reverse().find((e) => e.kind === "end");
  if (!start) return 0;
  const stop = running || !end ? Date.now() + clockOffset : new Date(end.at).getTime();
  let waited = 0, asked = null;
  for (const e of events) {
    if (e.kind === "ask") asked = e;
    if (e.kind === "replied" && asked) { waited += (e.t || 0) - (asked.t || 0); asked = null; }
  }
  if (asked && running) waited += (Date.now() + clockOffset - new Date(asked.at).getTime()) / 1000;
  return Math.max(0, (stop - new Date(start.at).getTime()) / 1000 - waited);
}
function budgetPanel(events, running) {
  const last = [...events].reverse().find((e) => e.kind === "budget");
  const start = events.find((e) => e.kind === "start");
  if (!start || (!start.minutes && !start.plan_share)) return "";
  let html = '<div class="budget">';
  if (start.minutes) {
    const used = Math.max(last ? last.seconds_used : 0, secondsWorking(events, running));
    html += "<div>Time: <b>" + duration(used) + "</b> of " + start.minutes + " min" +
      '<div class="bar2"><i data-w="' + Math.min(100, (used / (start.minutes * 60)) * 100) + '"></i></div></div>';
  }
  if (start.plan_share) {
    const used = last ? last.points_used : 0;
    const plan = last && typeof last.plan_used_now === "number" ? " · your plan's meter " + Math.round(last.plan_used_now * 100) + "%" : "";
    html += "<div>Plan share: about <b>" + used.toFixed(2) + "</b> of " + start.plan_share + " points" + esc(plan) +
      '<div class="bar2"><i data-w="' + Math.min(100, (used / start.plan_share) * 100) + '"></i></div></div>';
  }
  return html + "</div>";
}
function progressList(events) {
  const lines = events.filter((e) => e.kind === "say" || e.kind === "ask" || e.kind === "replied");
  if (!lines.length) return "";
  return '<ol class="progress" id="progress">' + lines.map((e) => {
    const t = Math.round(e.t || 0);
    const stamp = Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0");
    let text = e.kind === "ask" ? "The plan asks you: " + e.question : e.kind === "replied" ? (e.given ? "You replied." : "Going on without your reply.") : e.text;
    const warn = /not started|could not be used|stopped|left out/i.test(text);
    return '<li class="' + (warn ? "warn" : "") + '"><span class="t">' + stamp + "</span><span>" + esc(text) + "</span></li>";
  }).join("") + "</ol>";
}
function renderJob(id) {
  const job = jobs[id];
  if (!job || !job.view) return;
  const v = job.view;
  const keepScroll = $("progress") ? $("progress").scrollTop : null;
  const atBottom = $("progress") ? $("progress").scrollHeight - $("progress").scrollTop - $("progress").clientHeight < 30 : true;
  let html = v.follow_up ? '<div class="muted inreply">In reply to: <button id="parentBtn">' + esc(v.follow_up.question || "an earlier answer") + "</button></div>" : "";
  html += '<h2 class="qtitle">' + esc(v.question) + "</h2>";
  html += '<div class="meta">Started ' + esc(when(v.started_utc, true)) + " · " + esc(settingsWords(v.settings)) +
    (runnerWords(v.runner) ? " · " + esc(runnerWords(v.runner)) : "") + "</div>";
  html += '<div class="statusline">' + statusChip(v);
  const sure = armed && armed.id === id && armed.until > Date.now();
  if (v.running) html += '<button class="danger' + (sure ? " sure" : "") + '" id="stopBtn">' + (sure ? "Yes, stop this run" : "Stop") + "</button>";
  if (v.folder) html += '<span class="muted">Folder: runs/' + esc(v.folder) + "</span>";
  html += "</div>";
  if (v.waiting_for_reply) {
    html += '<div class="ask-you"><p><b>The plan has one question for you before it researches:</b></p><p>' + esc(v.question_for_you) + "</p>" +
      (v.question_why ? '<p class="muted">Why it asks: ' + esc(v.question_why) + "</p>" : "") +
      '<input id="replyText" placeholder="Your reply" autocomplete="off"><div class="row"><button class="primary" id="replyBtn">Send reply</button>' +
      '<button id="skipBtn">Go on without answering</button><span class="err" id="replyNote"></span></div></div>';
  }
  html += budgetPanel(job.events, v.running);
  if (!v.running && v.status !== "done") {
    const why = v.message || v.error || "The run ended before it wrote an answer.";
    html += '<div class="errbox"><b>' + (v.status === "interrupted" ? "You stopped this run." : "This run did not finish.") + "</b>" +
      (v.status === "interrupted" ? "" : "<pre>" + esc(why) + "</pre>") + "</div>";
  }
  if (v.cleanup_pending) html += '<p class="err">Some of this run\'s processes could not be ended yet (systemd did not answer): the page keeps trying every 30 seconds while it runs.</p>';
  boxContext = { source: "here", folder: v.folder, dig: Boolean(v.dig_deeper), done: !v.running && v.status === "done" };
  if (v.answer) html += answerHtml(v.answer, v.presentation);
  if (v.answer && !v.running && v.status === "done" && v.folder) html += replyBoxHtml();
  const progress = progressList(job.events);
  if (progress) html += v.answer ? '<details class="more"><summary>Progress, line by line</summary>' + progress + "</details>" : progress;
  if (v.log) html += '<details class="more"><summary>Steps and times</summary><pre class="log">' + esc(v.log) + "</pre></details>";
  const focusReply = document.activeElement && document.activeElement.id === "replyText";
  const hadReply = Boolean($("replyText"));
  const draft = $("replyText") ? $("replyText").value : "";
  const followDraft = $("followText") ? $("followText").value : "";
  const checkOpen = Boolean($("runView").querySelector("details.final-check[open]"));
  const limitsOpen = Boolean($("runView").querySelector("details.limits-fold[open]"));
  $("runView").innerHTML = html;
  if (checkOpen && $("runView").querySelector("details.final-check")) $("runView").querySelector("details.final-check").open = true;
  if (limitsOpen && $("runView").querySelector("details.limits-fold")) $("runView").querySelector("details.limits-fold").open = true;
  for (const bar of $("runView").querySelectorAll(".bar2 i")) bar.style.width = bar.dataset.w + "%";
  if ($("progress")) $("progress").scrollTop = atBottom ? $("progress").scrollHeight : keepScroll;
  if ($("replyText")) {
    $("replyText").value = draft;
    if (focusReply || (!hadReply && document.activeElement === document.body)) $("replyText").focus();
  }
  if ($("followText")) $("followText").value = followDraft;
  wireJobButtons(id);
  if (v.follow_up && $("parentBtn")) $("parentBtn").addEventListener("click", () => openRun(v.follow_up.source, v.follow_up.folder));
  if (v.folder) wireFollowUp("here", v.folder);
  wireBox();
}
// A reply starts a run of its own, with the settings as they are now; the app chains it to the latest answer.
function wireFollowUp(source, folder) {
  const button = $("followBtn");
  if (!button) return;
  const send = async () => {
    const question = $("followText").value.trim();
    if (!question) { $("followNote").textContent = "Type your reply first."; $("followText").focus(); return; }
    button.disabled = true;
    $("followNote").textContent = "Starting…";
    try {
      const view = await api("/api/start", { question, settings: formSettings(), follow_up: { source, folder } });
      jobs[view.id] = { events: [], next: 0, view: null };
      await refreshState();
      await selectJob(view.id);
    } catch (e) { $("followNote").textContent = e.message; button.disabled = false; }
  };
  button.addEventListener("click", send);
  $("followText").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send(); });
}
function wireJobButtons(id) {
  const stop = $("stopBtn");
  if (stop) stop.addEventListener("click", async () => {
    if (!(armed && armed.id === id && armed.until > Date.now())) {
      armed = { id, until: Date.now() + 4000 };
      renderJob(id);
      setTimeout(() => { if (armed && armed.until <= Date.now()) { armed = null; renderJob(id); } }, 4100);
      return;
    }
    armed = null;
    stop.disabled = true; stop.textContent = "Stopping…";
    try { await api("/api/stop", { id }); } catch (e) { stop.textContent = e.message; }
  });
  const send = async (text) => {
    try { await api("/api/reply", { id, text }); $("replyNote").textContent = ""; }
    catch (e) { $("replyNote").textContent = e.message; }
  };
  if ($("replyBtn")) $("replyBtn").addEventListener("click", () => send($("replyText").value));
  if ($("skipBtn")) $("skipBtn").addEventListener("click", () => send(""));
  if ($("replyText")) $("replyText").addEventListener("keydown", (e) => { if (e.key === "Enter") send($("replyText").value); });
}
async function pollJob(id) {
  const job = jobs[id] || (jobs[id] = { events: [], next: 0, view: null });
  const view = await api("/api/job?id=" + encodeURIComponent(id) + "&since=" + job.next);
  const ended = job.view && job.view.running && !view.running;
  job.events = job.events.concat(view.events);
  job.next = view.next;
  job.view = view;
  if (selected && selected.kind === "job" && selected.id === id) renderJob(id);
  if (ended) refreshState().catch(() => {});
  return view;
}
async function selectJob(id) {
  selected = { kind: "job", id };
  showTab("run");
  renderGoing();
  try { await pollJob(id); } catch (e) { $("runView").innerHTML = '<p class="err">' + esc(e.message) + "</p>"; }
}

// ---- past runs -----------------------------------------------------------------------------------------------------
async function renderPast() {
  try {
    const data = await api("/api/runs");
    if (!data.runs.length) { $("pastView").innerHTML = '<p class="empty">No runs yet.</p>'; return; }
    $("pastView").innerHTML = pastRowsHtml(data.runs);
    for (const b of $("pastView").querySelectorAll(".runrow")) b.addEventListener("click", () => openRun(b.dataset.source, b.dataset.folder));
  } catch (e) { $("pastView").innerHTML = '<p class="err">' + esc(e.message) + "</p>"; }
}
async function openRun(source, folder) {
  selected = { kind: "run", source, folder };
  showTab("run");
  renderGoing();
  try {
    const r = await api("/api/run?source=" + encodeURIComponent(source) + "&folder=" + encodeURIComponent(folder));
    const statusWords = { done: "Done", stopped: "Stopped", unfinished: "Not finished" };
    let html = '<button class="back" id="backBtn">← Past runs</button>';
    html += conversationHtml(r.conversation);
    html += '<h2 class="qtitle">' + esc(r.question || "(no question kept)") + "</h2>";
    const meta = ["Started " + when(r.started_utc, true)];
    if (r.model) meta.push(nameOf(state.models, r.model));
    if (r.effort) meta.push(r.effort + " thinking");
    if (r.lane) meta.push(r.lane + " lane");
    if (runnerWords(r.runner)) meta.push(runnerWords(r.runner));
    if (typeof r.seconds === "number") meta.push(duration(r.seconds));
    if (typeof r.usd === "number") meta.push("about USD " + r.usd.toFixed(2) + " at API list prices, on your plan");
    if (typeof r.plan_first === "number") meta.push("plan meter " + Math.round(r.plan_first * 100) + "% → " + Math.round(r.plan_last * 100) + "%");
    html += '<div class="meta">' + esc(meta.join(" · ")) + "</div>";
    html += '<div class="statusline"><span class="chip ' + esc(r.status) + '">' + esc(statusWords[r.status] || r.status) + "</span>" +
      (r.path ? '<span class="muted">' + esc(r.path) + "</span>" : "") + "</div>";
    if (r.stopped) html += '<div class="errbox"><b>This run stopped.</b><pre>' + esc(r.stopped) + "</pre></div>";
    boxContext = { source, folder, dig: Boolean(r.dig_deeper), done: r.status === "done" };
    if (r.answer) html += answerHtml(r.answer, r.presentation);
    else if (!r.stopped) html += '<p class="empty">This run kept no answer.</p>';
    if (r.answer && r.status === "done" && r.latest) html += replyBoxHtml();
    if (r.log) html += '<details class="more"><summary>Steps and times</summary><pre class="log">' + esc(r.log) + "</pre></details>";
    $("runView").innerHTML = html;
    $("backBtn").addEventListener("click", () => showTab("past"));
    for (const b of $("runView").querySelectorAll(".thread button")) b.addEventListener("click", () => openRun(b.dataset.source, b.dataset.folder));
    wireFollowUp(source, folder);
    wireBox();
    // Design v2 section 2: a finished answer opens at its box, so that Tier 1 is on the first screen.
    const box = $("runView").querySelector("section.glance");
    if (box && box.scrollIntoView) box.scrollIntoView({ block: "start" });
  } catch (e) { $("runView").innerHTML = '<p class="err">' + esc(e.message) + "</p>"; }
}

// ---- tabs, start, and the loop -------------------------------------------------------------------------------------
function showTab(which) {
  $("tab-run").classList.toggle("on", which === "run");
  $("tab-past").classList.toggle("on", which === "past");
  $("runView").hidden = which !== "run";
  $("pastView").hidden = which !== "past";
  $("going").hidden = which !== "run";
  if (which === "past") renderPast();
}
async function start() {
  const question = $("q").value.trim();
  if (!question) { $("startNote").textContent = "Type a question first."; $("q").focus(); return; }
  $("start").disabled = true;
  $("startNote").textContent = "Starting…";
  try {
    const view = await api("/api/start", { question, settings: formSettings() });
    $("q").value = "";
    $("startNote").textContent = "Started.";
    jobs[view.id] = { events: [], next: 0, view: null };
    await refreshState();
    await selectJob(view.id);
  } catch (e) { $("startNote").textContent = e.message; }
  finally { $("start").disabled = false; }
}
async function refreshState() {
  const data = await api("/api/state");
  clockOffset = new Date(data.now_utc).getTime() - Date.now();
  const first = state === null;
  state = data;
  if (first) fillSettings();
  renderMeter();
  renderGoing();
  return first;
}
async function boot() {
  try { await refreshState(); }
  catch (e) { $("runView").innerHTML = '<p class="err">' + esc(e.message) + "</p>"; return; }
  for (const id of ["provider", "model", "effort", "workers", "minutes", "plan_share", "ask", "askrigor_tools", "compare"]) $("s-" + id).addEventListener("change", saveSettings);
  $("start").addEventListener("click", start);
  $("q").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) start(); });
  $("tab-run").addEventListener("click", () => showTab("run"));
  $("tab-past").addEventListener("click", () => showTab("past"));
  const going = state.running || [];
  const live = going.find((j) => j.running) || going[0];
  if (live) await selectJob(live.id);
  else {
    const past = await api("/api/runs").catch(() => ({ runs: [] }));
    if (past.runs.length) await openRun(past.runs[0].source, past.runs[0].folder);
    else $("runView").innerHTML = '<p class="empty">Type a question and press Start. Each step shows here as it runs.</p>';
  }
  let beat = 0;
  setInterval(async () => {
    beat++;
    const job = selected && selected.kind === "job" ? jobs[selected.id] : null;
    const live = job && job.view && job.view.running;
    try {
      if (live) await pollJob(selected.id);
      if (beat % (live || (state.running || []).some((j) => j.running) ? 3 : 10) === 0) await refreshState();
    } catch (e) { /* the next beat tries again */ }
  }, 1000);
}
// A printed answer shows its limits whole: printing opens their fold, and afterwards it is folded again.
window.addEventListener("beforeprint", () => {
  for (const fold of document.querySelectorAll("details.limits-fold:not([open])")) { fold.open = true; fold.dataset.printed = "1"; }
});
window.addEventListener("afterprint", () => {
  for (const fold of document.querySelectorAll('details.limits-fold[data-printed="1"]')) { fold.open = false; delete fold.dataset.printed; }
});

window.PhoneLink.whenReady(boot);
