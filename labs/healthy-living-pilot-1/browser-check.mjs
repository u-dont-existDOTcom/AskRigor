// Runs the healthy-living pilot page in headless Chromium (over the DevTools protocol) and checks
// what draft v2 part 10 asks for: zero network requests, save and reload, the emergency pause,
// skipped questions, the copy against its preview, Clear everything across two tabs (also a clear
// landing in the middle of another tab's save, two tabs editing at once, a clear that fails, a tab
// stopped mid-save, a tab opened mid-clear, two saves at once and both tabs closed), blocked
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

const targetOf = new Map();
const closeTab = (sessionId) => send("Target.closeTarget", { targetId: targetOf.get(sessionId) });
async function openTab(preload) {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  targetOf.set(sessionId, targetId);
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
// Page-side checks get their values as call arguments, never pasted into code.
async function call(sessionId, fn, ...args) {
  const { result } = await send("Runtime.evaluate", { expression: "globalThis" }, sessionId);
  const r = await send("Runtime.callFunctionOn", { functionDeclaration: fn, objectId: result.objectId, arguments: args.map((value) => ({ value })), returnByValue: true, awaitPromise: true }, sessionId);
  if (r.exceptionDetails) throw new Error("page check failed: " + JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result.value;
}
const HIDDEN = `function (sel) { const el = document.querySelector(sel); return !el || el.hidden || el.closest("[hidden]") !== null; }`;
const SHOWN = `function (sel) { const el = document.querySelector(sel); return !!el && el.getClientRects().length > 0; }`;
const KEY = "askrigor-healthy-living-pilot-1";
const LOCK = KEY + "-lock";
const TYPE = `function (words) { const t = document.querySelector("#own-words"); t.value = words; t.dispatchEvent(new Event("input", { bubbles: true })); }`;
// Holds the page's lock from a tab, as a tab stopped in the middle of a save would; window.__release() lets go.
const HOLD = `function (name) { return new Promise((held) => { navigator.locks.request(name, () => new Promise((release) => { window.__release = release; held(true); })); }); }`;
const LATE = `function (key, words) { const mark = localStorage.getItem(key + "-cleared") || ""; localStorage.setItem(key, JSON.stringify({ v: 2, gen: mark, answers: {}, texts: { "own-words": words }, log: {}, emergency: {}, noneAt: "", t: {} })); return true; }`;
const FAILDEL_FN = `function () { const del = Storage.prototype.removeItem; Storage.prototype.removeItem = function (k) { if (window.__failRemove) throw new DOMException("blocked", "SecurityError"); return del.call(this, k); }; return true; }`;
const FAILDEL = `(${FAILDEL_FN})();`;

try {
  // 1. Load, and count every request the page makes.
  const a = await openTab();
  const reqA = events.filter((e) => e.sessionId === a && e.method === "Network.requestWillBeSent").map((e) => e.params.request.url);
  check("one request only, the file itself", reqA.length === 1 && reqA[0] === fileUrl, reqA.join(" "));
  check("fresh stamp says nothing saved", (await js(a, `document.querySelector("#stamp").textContent`)) === "Nothing saved yet");
  check("no red line on a fresh page", await call(a, HIDDEN, "#save-failed"));

  // 2. Type, choose, wait, reload: everything is still there; Saved here only after a real save.
  await js(a, `(() => { const t = document.querySelector("#own-words"); t.value = "test words"; t.dispatchEvent(new Event("input", { bubbles: true })); document.querySelector('input[name=q-water][value=tap]').click(); })()`);
  const saving = await js(a, `document.querySelector("#stamp").textContent`);
  await sleep(600);
  const saved = await js(a, `document.querySelector("#stamp").textContent`);
  const storedRaw = await js(a, `localStorage.getItem("askrigor-healthy-living-pilot-1")`);
  check("stamp goes Saving then Saved here", saving === "Saving\u2026" && /^Saved here \d\d:\d\d$/.test(saved) && !!storedRaw, saving + " / " + saved);
  await reload(a);
  check("typed words survive a reload", (await js(a, `document.querySelector("#own-words").value`)) === "test words");
  check("a chosen answer survives a reload, and the steps keep the guides' order", await js(a, `document.querySelector('input[name=q-water][value=tap]').checked && [...document.querySelectorAll("#areas > section.step")].map((s) => s.id).join() === "step-1,step-2,step-3,step-4,step-5"`));

  // 3. Skipped questions wait; answers show or hide.
  check("mold card waits while its question is skipped", await js(a, `!document.querySelector('[data-sugg=mold] .waits').hidden && document.querySelector('[data-sugg=mold] .sugg-body').hidden`));
  await js(a, `document.querySelector('input[name=q-mold][value=no]').click();`);
  check("mold card hides for no", await js(a, `document.querySelector('[data-sugg=mold]').hidden`));
  await js(a, `document.querySelector('input[name=q-mold][value=yes]').click();`);
  check("mold card shows for yes", await js(a, `!document.querySelector('[data-sugg=mold]').hidden && !document.querySelector('[data-sugg=mold] .sugg-body').hidden`));
  check("the apnea check shows for everyone, as in the sleep guide", await js(a, `!document.querySelector('[data-sugg=apnea]').hidden && !document.querySelector('[data-sugg=apnea] .sugg-body').hidden`));

  // 4. Worse shows the stop line.
  await js(a, `document.querySelector('[data-log=exhale][data-c=worse]').click()`);
  check("Tried it: worse shows the stop line", await js(a, `!document.querySelector('[data-worse=exhale]').hidden`));

  // 5. Emergency line: message, banner, pause, Show anyway, actions, This has passed.
  await js(a, `document.querySelector('[data-em="4"]').click()`);
  check("line 4 opens its message", await call(a, SHOWN, "#msg-4"));
  check("banner on top while ticked", !(await call(a, HIDDEN, "#em-banner")));
  check("areas paused while ticked", (await call(a, HIDDEN, "#areas")) && !(await call(a, HIDDEN, "#paused")));
  await js(a, `document.querySelector('[data-show-anyway]').click()`);
  check("Show anyway brings the areas back", !(await call(a, HIDDEN, "#areas")));
  await js(a, `document.querySelector('[data-em-act=called][data-line="4"]').click()`);
  check("I called is saved and the line stays ticked", await js(a, `document.querySelector('[data-em-log="4"]').textContent.startsWith("Saved: I called") && document.querySelector('[data-em="4"]').checked`));
  await js(a, `document.querySelector('[data-em-passed="4"]').click()`);
  check("This has passed on line 4 opens the advice for signs that passed and keeps the banner", (await js(a, `!document.querySelector('[data-em="4"]').checked && document.querySelector('[data-em="passed"]').checked && document.querySelector("[data-banner-text]").textContent.includes("even though it passed")`)) && !(await call(a, HIDDEN, "#msg-passed")) && !(await call(a, HIDDEN, "#em-banner")));
  await js(a, `document.querySelector('[data-em-passed="passed"]').click()`);
  check("only the person unticks the passed line, and then the banner goes", (await js(a, `!document.querySelector('[data-em="passed"]').checked`)) && (await call(a, HIDDEN, "#em-banner")));
  await js(a, `document.querySelector('[data-em="4"]').click(); document.querySelector('[data-em="4"]').click();`);
  check("unticking line 4 itself also opens the advice for signs that passed", (await js(a, `!document.querySelector('[data-em="4"]').checked && document.querySelector('[data-em="passed"]').checked`)) && !(await call(a, HIDDEN, "#em-banner")));

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
  check("nothing comes back after reload", (await js(a, `document.querySelector("#own-words").value`)) === "" && !(await js(a, `document.querySelector('input[name=q-water][value=tap]').checked`)));

  await closeTab(b);

  // 8n. Without the page's lock (no Web Locks API, or the browser refuses it) no step runs: nothing is saved
  // or removed, the red line shows, and Clear everything says it failed and keeps the answers.
  const STORED = `function (key) { return localStorage.getItem(key); }`;
  for (const [how, preload] of [
    ["no lock API", `Object.defineProperty(Navigator.prototype, "locks", { configurable: true, get() { return undefined; } });`],
    ["lock refused", `LockManager.prototype.request = function () { return Promise.reject(new DOMException("refused", "SecurityError")); };`]
  ]) {
    const n = await openTab(preload);
    await sleep(200);
    const before = await call(n, STORED, KEY);
    check(how + ": Not saved and the red line", (await js(n, `document.querySelector("#stamp").textContent`)) === "Not saved" && !(await call(n, HIDDEN, "#save-failed")));
    await call(n, TYPE, "unlocked words");
    await sleep(600);
    check(how + ": typing saves nothing", (await call(n, STORED, KEY)) === before && (await js(n, `document.querySelector("#stamp").textContent`)) === "Not saved");
    await js(n, `window.confirm = () => true; document.querySelector('[data-clear]').click();`);
    await sleep(300);
    check(how + ": Clear everything says it failed, keeps the answers, removes nothing",
      !(await call(n, HIDDEN, "#clear-failed")) && (await call(n, HIDDEN, "#cleared-note")) &&
      (await js(n, `document.querySelector("#own-words").value`)) === "unlocked words" && (await call(n, STORED, KEY)) === before);
    await closeTab(n);
  }

  // 8. Blocked storage shows the red line; Clear everything then says it failed and keeps the answers.
  const c = await openTab(`Object.defineProperty(window, "localStorage", { get() { throw new DOMException("blocked", "SecurityError"); } });`);
  check("blocked storage: Not saved and the red line", (await js(c, `document.querySelector("#stamp").textContent`)) === "Not saved" && !(await call(c, HIDDEN, "#save-failed")));
  await call(c, TYPE, "blocked words");
  await js(c, `window.confirm = () => true; document.querySelector('[data-clear]').click();`);
  await sleep(200);
  check("blocked storage: Clear everything says it failed and keeps the answers", (await js(c, `document.querySelector("#own-words").value === "blocked words" && document.querySelector("#stamp").textContent === "Clearing failed"`)) && !(await call(c, HIDDEN, "#clear-failed")) && (await call(c, HIDDEN, "#cleared-note")) && (await call(c, HIDDEN, "#save-failed")));
  await closeTab(c);

  // 8b. A clear that skips the lock and lands between a save's check and its write (made to happen here:
  // the clear runs just before the write). The late write must not bring the answers back.
  const r = await openTab(`(() => { const set = Storage.prototype.setItem, del = Storage.prototype.removeItem;
    Storage.prototype.setItem = function (k, v) {
      if (window.__raceOnce && k === "askrigor-healthy-living-pilot-1") { window.__raceOnce = false; set.call(this, k + "-cleared", "other-tab-" + Date.now()); del.call(this, k); }
      return set.call(this, k, v);
    }; })();`);
  await js(r, `window.__raceOnce = true;`);
  await call(r, TYPE, "race words");
  await sleep(700);
  check("a clear landing mid-save leaves nothing stored", (await js(r, `localStorage.getItem("askrigor-healthy-living-pilot-1")`)) === null);
  check("a clear landing mid-save clears this tab too", (await js(r, `document.querySelector("#own-words").value`)) === "" && !(await call(r, HIDDEN, "#cleared-note")));
  await reload(r);
  check("nothing comes back after a clear landing mid-save", (await js(r, `document.querySelector("#own-words").value`)) === "");
  await closeTab(r);

  // 8c. Two tabs editing at once: both changes are kept.
  const d1 = await openTab();
  const d2 = await openTab();
  await call(d1, TYPE, "words from one tab");
  await js(d2, `document.querySelector('input[name=q-mold][value=yes]').click()`);
  await sleep(1200);
  const both = (s) => js(s, `document.querySelector("#own-words").value === "words from one tab" && document.querySelector('input[name=q-mold][value=yes]').checked`);
  check("two tabs editing at once: each shows both changes", (await both(d1)) && (await both(d2)));
  await reload(d1);
  check("two tabs editing at once: both changes saved", await both(d1));
  await closeTab(d1);
  await closeTab(d2);

  // 8d. A clear that fails says so, keeps the answers on the page, and claims no success.
  const f = await openTab(FAILDEL);
  await call(f, TYPE, "keep these words");
  await sleep(600);
  await js(f, `window.__failRemove = true; window.confirm = () => true; document.querySelector('[data-clear]').click();`);
  await sleep(300);
  check("a failed clear says Clearing failed, not cleared", (await js(f, `document.querySelector("#clear-failed").textContent.startsWith("Clearing failed; saved answers may remain") && document.querySelector("#stamp").textContent === "Clearing failed"`)) && !(await call(f, HIDDEN, "#clear-failed")) && (await call(f, HIDDEN, "#cleared-note")));
  check("a failed clear keeps the answers on the page, without the saving warning", (await js(f, `document.querySelector("#own-words").value`)) === "keep these words" && (await call(f, HIDDEN, "#save-failed")));
  await js(f, `window.__failRemove = false; document.querySelector('[data-clear]').click();`);
  await sleep(300);
  check("clearing again once it works says cleared, and nothing is stored", (await js(f, `document.querySelector("#own-words").value === "" && localStorage.getItem("askrigor-healthy-living-pilot-1") === null`)) && !(await call(f, HIDDEN, "#cleared-note")) && (await call(f, HIDDEN, "#clear-failed")));
  await closeTab(f);

  // 8e. Another tab's clear when no tab can delete the old copy: this tab says so too and keeps its answers.
  await call(a, FAILDEL_FN);
  const x = await openTab(FAILDEL);
  const y = await openTab(FAILDEL);
  await call(x, TYPE, "x words");
  await sleep(600);
  for (const s of [a, x, y]) await js(s, `window.__failRemove = true; window.confirm = () => true;`);
  await js(y, `document.querySelector('[data-clear]').click()`);
  await sleep(400);
  check("clearing tab: Clearing failed when the old copy cannot be deleted", await js(y, `document.querySelector("#stamp").textContent === "Clearing failed"`));
  check("other tab: Clearing failed too, its answers kept, no saving warning", (await js(x, `document.querySelector("#stamp").textContent === "Clearing failed" && document.querySelector("#own-words").value === "x words"`)) && !(await call(x, HIDDEN, "#clear-failed")) && (await call(x, HIDDEN, "#cleared-note")) && (await call(x, HIDDEN, "#save-failed")));
  for (const s of [a, x, y]) await js(s, `window.__failRemove = false;`);
  await js(y, `document.querySelector('[data-clear]').click()`);
  await sleep(400);
  check("once deleting works, both tabs say cleared and nothing is stored", (await js(x, `document.querySelector("#own-words").value === "" && localStorage.getItem("askrigor-healthy-living-pilot-1") === null`)) && !(await call(x, HIDDEN, "#cleared-note")) && !(await call(y, HIDDEN, "#cleared-note")));
  await closeTab(x);
  await closeTab(y);

  // 8f. A late notice of a clear this tab already knew of clears nothing saved since.
  const p = await openTab();
  await call(p, TYPE, "after clear words");
  await sleep(600);
  await call(p, `function (key) { window.dispatchEvent(new StorageEvent("storage", { key: key + "-cleared", newValue: localStorage.getItem(key + "-cleared"), storageArea: localStorage })); return true; }`, KEY);
  await sleep(300);
  check("a late notice of a known clear keeps the answers saved since", await js(p, `document.querySelector("#own-words").value === "after clear words" && JSON.parse(localStorage.getItem("askrigor-healthy-living-pilot-1")).texts["own-words"] === "after clear words"`));

  // 8g. A tab stopped in the middle of its save (here: holding the page's lock) delays a clear. The clear
  // reports success only after it, and removes its late write, even when both tabs then close.
  const h = await openTab();
  await call(h, HOLD, LOCK);
  await js(p, `window.confirm = () => true; document.querySelector('[data-clear]').click();`);
  await sleep(300);
  check("a clear waits while another tab is mid-save", (await js(p, `document.querySelector("#stamp").textContent === "Clearing…" && document.querySelector("#own-words").value === "after clear words"`)) && (await call(p, HIDDEN, "#cleared-note")));
  await call(h, LATE, KEY, "late words");
  await js(h, `window.__release()`);
  await sleep(300);
  check("then the clear completes, the late write included", (await js(p, `document.querySelector("#own-words").value === "" && localStorage.getItem("askrigor-healthy-living-pilot-1") === null`)) && !(await call(p, HIDDEN, "#cleared-note")));
  await closeTab(h);
  await closeTab(p);
  const n = await openTab();
  check("nothing comes back once both tabs have closed", await js(n, `document.querySelector("#own-words").value === "" && localStorage.getItem("askrigor-healthy-living-pilot-1") === null`));

  // 8h. A tab opened while a clear is under way waits for it, and never shows the answers being cleared.
  await call(n, TYPE, "loading words");
  await sleep(600);
  const h2 = await openTab();
  await call(h2, HOLD, LOCK);
  const l = await openTab();
  check("a tab opened during a clear shows no saved answers", (await js(l, `document.querySelector("#own-words").value`)) === "");
  await call(h2, `function (key) { localStorage.setItem(key + "-cleared", "harness-" + Date.now()); localStorage.removeItem(key); return true; }`, KEY);
  await js(h2, `window.__release()`);
  await sleep(300);
  check("and after the clear it still shows none", await js(l, `document.querySelector("#own-words").value === "" && localStorage.getItem("askrigor-healthy-living-pilot-1") === null`));
  for (const s of [n, h2, l]) await closeTab(s);

  // 8i. Two tabs save at the same moment and both close straight after: both changes are kept.
  const d3 = await openTab();
  const d4 = await openTab();
  const h3 = await openTab();
  await call(h3, HOLD, LOCK);
  await call(d3, TYPE, "words from tab three");
  await js(d4, `document.querySelector('input[name=q-smell][value=no]').click()`);
  await sleep(400);
  await js(h3, `window.__release()`);
  await sleep(400);
  for (const s of [d3, d4, h3]) await closeTab(s);
  const e3 = await openTab();
  check("two tabs saving at once, then both closed: both changes kept", await js(e3, `document.querySelector("#own-words").value === "words from tab three" && document.querySelector('input[name=q-smell][value=no]').checked`));
  await closeTab(e3);

  // 9. Keyboard: Space on the first emergency line ticks it.
  await js(a, `document.querySelector('[data-em="1"]').focus()`);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32 }, a);
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 }, a);
  await sleep(100);
  check("Space ticks an emergency line", await js(a, `document.querySelector('[data-em="1"]').checked && document.querySelector('#msg-1').getClientRects().length > 0`));
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

  // Owner's review 355: a real tap on a line opens what to do right under it, on screen, not under the top bar.
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] }, a);
  await js(a, `document.querySelector('label[for=em-2]').scrollIntoView({ block: "center" })`);
  await sleep(150);
  const at = await js(a, `(() => { const b = document.querySelector('label[for=em-2]').getBoundingClientRect(); return { x: Math.round(b.left + 30), y: Math.round(b.top + 8) }; })()`);
  for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x: at.x, y: at.y, button: "left", clickCount: 1 }, a);
  await sleep(250);
  const pos = await js(a, `(() => { const l = document.querySelector('label[for=em-2]').getBoundingClientRect(); const m = document.querySelector('#msg-2').getBoundingClientRect(); const h = document.querySelector('header.top').getBoundingClientRect(); const n = document.querySelector('label[for=em-3]').getBoundingClientRect(); return { ticked: document.querySelector('#em-2').checked, gap: Math.round(m.top - l.bottom), top: Math.round(m.top), nextLine: Math.round(n.top), headerBottom: Math.round(h.bottom), screen: innerHeight }; })()`);
  check("a tap on line 2 at phone width opens its steps right under it (before line 3), on screen and below the top bar", pos.ticked && pos.gap >= 0 && pos.top < pos.nextLine && pos.top >= pos.headerBottom && pos.top < pos.screen - 100, JSON.stringify(pos));
  const shot = await send("Page.captureScreenshot", { format: "png" }, a);
  writeFileSync(join(outDir, "phone-ticked.png"), Buffer.from(shot.data, "base64"));
  await js(a, `document.querySelector('#em-2').click()`);

  // Owner's review 355: with the page's script switched off, ticking a line still shows what to do under it.
  const { targetId: njTarget } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId: nj } = await send("Target.attachToTarget", { targetId: njTarget, flatten: true });
  targetOf.set(nj, njTarget);
  for (const d of ["Page", "Runtime"]) await send(d + ".enable", {}, nj);
  await send("Emulation.setScriptExecutionDisabled", { value: true }, nj);
  const njLoaded = waitFor(nj, "Page.loadEventFired");
  await send("Page.navigate", { url: fileUrl }, nj);
  await njLoaded;
  await sleep(150);
  check("the page's script is really off in this tab", (await js(nj, `document.querySelector('[data-actions="4"]').children.length === 0 && document.querySelector('[data-log]') === null`)) === true);
  check("without the script, no line's steps show before a tick", (await js(nj, `[...document.querySelectorAll(".em .msg")].every((m) => m.getClientRects().length === 0)`)) === true);
  await js(nj, `document.querySelector('#em-4').click(); document.querySelector('#em-passed').click(); document.querySelector('#em-19').click();`);
  check("without the script, ticking line 4, its passed line and line 19 shows each one's steps", await js(nj, `["#msg-4", "#msg-passed", "#msg-19"].every((s) => document.querySelector(s).getClientRects().length > 0) && document.querySelector("#msg-4").textContent.includes("Call the emergency number now") && document.querySelector("#msg-19").textContent.includes("988")`));
  check("without the script, the other lines stay closed", await js(nj, `document.querySelector("#msg-1").getClientRects().length === 0 && document.querySelector("#msg-5").getClientRects().length === 0`));
  await closeTab(nj);

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
