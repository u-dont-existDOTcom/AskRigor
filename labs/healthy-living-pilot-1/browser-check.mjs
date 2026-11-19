// Runs the healthy-living pilot page in headless Chromium (over the DevTools protocol) and checks
// what draft v2 part 10 asks for: zero network requests, save and reload, the emergency pause,
// skipped questions, the copy against its preview, Clear everything across two tabs, blocked
// storage, phone width and the keyboard. Usage: node browser-check.mjs <chrome> <page.html> <outdir>
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [chrome, pagePath, outDir] = process.argv.slice(2);
const fileUrl = pathToFileURL(pagePath).href;
const profile = mkdtempSync(join(outDir, "profile-"));
const proc = spawn(chrome, ["--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "--disable-background-networking", "--disable-component-update", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
const wsUrl = await new Promise((ok, fail) => {
  let buf = "";
  proc.stderr.on("data", (d) => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) ok(m[1]); });
  setTimeout(() => fail(new Error("no DevTools url: " + buf.slice(0, 500))), 15000);
});
const ws = new WebSocket(wsUrl);
await new Promise((ok) => ws.addEventListener("open", ok));
let nextId = 1;
const pending = new Map();
const events = [];
const waiters = [];
ws.addEventListener("message", (msg) => {
  const m = JSON.parse(msg.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.fail(new Error(JSON.stringify(m.error))) : p.ok(m.result); return; }
  events.push(m);
  for (const w of [...waiters]) if (w.test(m)) { waiters.splice(waiters.indexOf(w), 1); w.ok(m); }
});
const send = (method, params = {}, sessionId) => new Promise((ok, fail) => {
  const id = nextId++;
  pending.set(id, { ok, fail });
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});
const waitFor = (sessionId, method, ms = 10000) => new Promise((ok, fail) => {
  const w = { test: (m) => m.method === method && m.sessionId === sessionId, ok };
  waiters.push(w);
  setTimeout(() => { if (waiters.includes(w)) { waiters.splice(waiters.indexOf(w), 1); fail(new Error("timeout " + method)); } }, ms);
});
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function openTab(preload) {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  for (const d of ["Page", "Runtime", "Network", "Log"]) await send(d + ".enable", {}, sessionId);
  if (preload) await send("Page.addScriptToEvaluateOnNewDocument", { source: preload }, sessionId);
  const loaded = waitFor(sessionId, "Page.loadEventFired");
  await send("Page.navigate", { url: fileUrl }, sessionId);
  await loaded;
  await sleep(150);
  return sessionId;
}
async function js(sessionId, expression) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r.exceptionDetails) throw new Error("page script failed: " + JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result.value;
}
async function reload(sessionId) {
  const loaded = waitFor(sessionId, "Page.loadEventFired");
  await send("Page.reload", {}, sessionId);
  await loaded;
  await sleep(150);
}
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); };
const hidden = (sel) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); return !el || el.hidden || el.closest("[hidden]") !== null; })()`;

try {
  // 1. Load, and count every request the page makes.
  const a = await openTab();
  const reqA = events.filter((e) => e.sessionId === a && e.method === "Network.requestWillBeSent").map((e) => e.params.request.url);
  check("one request only, the file itself", reqA.length === 1 && reqA[0] === fileUrl, reqA.join(" "));
  check("fresh stamp says nothing saved", (await js(a, `document.querySelector("#stamp").textContent`)) === "Nothing saved yet");
  check("no red line on a fresh page", await js(a, hidden("#save-failed")));

  // 2. Type, choose, wait, reload: everything is still there; Saved here only after a real save.
  await js(a, `(() => { const t = document.querySelector("#own-words"); t.value = "test words"; t.dispatchEvent(new Event("input", { bubbles: true })); document.querySelector('input[name=area][value=sleep]').click(); })()`);
  const saving = await js(a, `document.querySelector("#stamp").textContent`);
  await sleep(600);
  const saved = await js(a, `document.querySelector("#stamp").textContent`);
  const storedRaw = await js(a, `localStorage.getItem("askrigor-healthy-living-pilot-1")`);
  check("stamp goes Saving then Saved here", saving === "Saving\u2026" && /^Saved here \d\d:\d\d$/.test(saved) && !!storedRaw, saving + " / " + saved);
  await reload(a);
  check("typed words survive a reload", (await js(a, `document.querySelector("#own-words").value`)) === "test words");
  check("chosen area survives and opens first", await js(a, `document.querySelector('input[name=area][value=sleep]').checked && document.querySelector("#areas").firstElementChild.id === "area-sleep"`));

  // 3. Skipped questions wait; answers show or hide.
  check("apnea card waits while its questions are skipped", await js(a, `!document.querySelector('[data-sugg=apnea] .waits').hidden && document.querySelector('[data-sugg=apnea] .sugg-body').hidden`));
  await js(a, `document.querySelector('input[name=q-snore][value=no]').click(); document.querySelector('input[name=q-day][value=no]').click();`);
  check("apnea card hides for no and no", await js(a, `document.querySelector('[data-sugg=apnea]').hidden`));
  await js(a, `document.querySelector('input[name=q-snore][value=yes]').click();`);
  check("apnea card shows for snoring", await js(a, `!document.querySelector('[data-sugg=apnea]').hidden && !document.querySelector('[data-sugg=apnea] .sugg-body').hidden`));

  // 4. Worse shows the stop line.
  await js(a, `document.querySelector('[data-log=exhale][data-c=worse]').click()`);
  check("Tried it: worse shows the stop line", await js(a, `!document.querySelector('[data-worse=exhale]').hidden`));

  // 5. Emergency line: message, banner, pause, Show anyway, actions, This has passed.
  await js(a, `document.querySelector('[data-em="4"]').click()`);
  check("line 4 opens its message", !(await js(a, hidden("#msg-4"))));
  check("banner on top while ticked", !(await js(a, hidden("#em-banner"))));
  check("areas paused while ticked", (await js(a, hidden("#areas"))) && !(await js(a, hidden("#paused"))));
  await js(a, `document.querySelector('[data-show-anyway]').click()`);
  check("Show anyway brings the areas back", !(await js(a, hidden("#areas"))));
  await js(a, `document.querySelector('[data-em-act=called][data-line="4"]').click()`);
  check("I called is saved and the line stays ticked", await js(a, `document.querySelector('[data-em-log="4"]').textContent.startsWith("Saved: I called") && document.querySelector('[data-em="4"]').checked`));
  await js(a, `document.querySelector('[data-em-passed="4"]').click()`);
  check("This has passed unticks and drops the banner", await js(a, `!document.querySelector('[data-em="4"]').checked`) && (await js(a, hidden("#em-banner"))));

  // 6. The copy matches its preview; safety answers only when ticked.
  const copy = await js(a, `new Promise((ok) => { const orig = URL.createObjectURL; URL.createObjectURL = (b) => { b.text().then(ok); URL.createObjectURL = orig; return orig.call(URL, b); }; HTMLAnchorElement.prototype.click = function () {}; document.querySelector('[data-save-text]').click(); })`);
  const prev = await js(a, `document.querySelector("#preview").textContent`);
  const body = (t) => t.split("\n").slice(1).join("\n");
  check("saved copy equals the preview", body(copy) === body(prev), copy.split("\n").slice(0, 2).join(" | "));
  check("copy says partial, self-reported", copy.split("\n")[1] === "Partial, self-reported. Not medical advice.");
  check("safety answers out unless ticked", !prev.includes("Safety answers:"));
  await js(a, `(() => { const b = document.querySelector('[data-part=safety]'); b.click(); })()`);
  check("safety answers in once ticked", (await js(a, `document.querySelector("#preview").textContent`)).includes("Line 4: unticked"));

  // 7. Clear everything with two tabs open, one of them with a save still pending.
  await sleep(400);
  const b = await openTab();
  check("second tab reads the saved answers", (await js(b, `document.querySelector("#own-words").value`)) === "test words");
  await js(b, `(() => { const t = document.querySelector("#own-words"); t.value = "late words"; t.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await js(a, `window.confirm = () => true; document.querySelector('[data-clear]').click();`);
  await sleep(900);
  check("clear empties this tab", (await js(a, `document.querySelector("#own-words").value`)) === "" && (await js(a, `!document.querySelector('#cleared-note').hidden`)));
  check("clear empties the other tab, pending save included", (await js(b, `document.querySelector("#own-words").value`)) === "" && (await js(b, `localStorage.getItem("askrigor-healthy-living-pilot-1")`)) === null);
  await reload(a);
  check("nothing comes back after reload", (await js(a, `document.querySelector("#own-words").value`)) === "" && !(await js(a, `document.querySelector('input[name=area][value=sleep]').checked`)));

  // 8. Blocked storage shows the red line.
  const c = await openTab(`Object.defineProperty(window, "localStorage", { get() { throw new DOMException("blocked", "SecurityError"); } });`);
  check("blocked storage: Not saved and the red line", (await js(c, `document.querySelector("#stamp").textContent`)) === "Not saved" && !(await js(c, hidden("#save-failed"))));

  // 9. Keyboard: Space on the first emergency line ticks it.
  await js(a, `document.querySelector('[data-em="1"]').focus()`);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32 }, a);
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 }, a);
  await sleep(100);
  check("Space ticks an emergency line", await js(a, `document.querySelector('[data-em="1"]').checked && !document.querySelector('#msg-1').hidden`));
  check("nothing is taken out of the tab order", (await js(a, `document.querySelectorAll('[tabindex="-1"], [onclick]').length`)) === 0);
  await js(a, `document.querySelector('[data-em="1"]').click()`);

  // 10. Phone width, light and dark: no sideways scroll; screenshots for the glance test.
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true }, a);
  await reload(a);
  check("no sideways scroll at 375 px", (await js(a, `document.documentElement.scrollWidth`)) <= 375, String(await js(a, `document.documentElement.scrollWidth`)));
  for (const [name, y] of [["phone-1", 0], ["phone-2", 812], ["phone-3", 1624]]) {
    await js(a, `window.scrollTo(0, ${y})`);
    await sleep(100);
    const shot = await send("Page.captureScreenshot", { format: "png" }, a);
    writeFileSync(join(outDir, name + ".png"), Buffer.from(shot.data, "base64"));
  }
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] }, a);
  await js(a, `window.scrollTo(0, 0)`);
  await sleep(100);
  const dark = await send("Page.captureScreenshot", { format: "png" }, a);
  writeFileSync(join(outDir, "phone-dark-1.png"), Buffer.from(dark.data, "base64"));
  writeFileSync(join(outDir, "page-text.txt"), await js(a, `document.body.innerText`));

  // 11. No script errors or blocked loads anywhere.
  const errors = events.filter((e) => e.method === "Runtime.exceptionThrown" || (e.method === "Log.entryAdded" && e.params.entry.level === "error") || (e.method === "Runtime.consoleAPICalled" && e.params.type === "error"));
  check("no script errors or policy violations", errors.length === 0, errors.map((e) => JSON.stringify(e.params).slice(0, 200)).join(" || "));
  const allReq = events.filter((e) => e.method === "Network.requestWillBeSent").map((e) => e.params.request.url).filter((u) => u !== fileUrl);
  check("no request other than the file, in any tab", allReq.length === 0, allReq.join(" "));
} catch (err) {
  check("run finished", false, String(err && err.stack || err));
} finally {
  try { await send("Browser.close"); } catch { /* already closed */ }
  setTimeout(() => proc.kill("SIGKILL"), 500);
}
for (const r of results) console.log((r.ok ? "PASS " : "FAIL ") + r.name + (r.detail && !r.ok ? "  [" + r.detail + "]" : r.detail ? "  (" + r.detail + ")" : ""));
console.log(`${results.filter((r) => r.ok).length} of ${results.length} passed`);
await sleep(700);
process.exit(results.every((r) => r.ok) ? 0 : 1);
