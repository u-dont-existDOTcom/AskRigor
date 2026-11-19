import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import { beforeAll, describe, expect, it } from "vitest";

// The healthy-living pilot is one offline file (labs/healthy-living-pilot-1/index.html).
// These checks hold it to the approved draft: nothing loaded or sent, the never-list absent,
// every emergency line visible without a fold, and the owner's stroke heading (answer 345a).

const root = fileURLToPath(new URL("..", import.meta.url));
let html = "";

beforeAll(async () => {
  html = await readFile(resolve(root, "labs/healthy-living-pilot-1/index.html"), "utf8");
});

function inlineScripts(source: string): string[] {
  return [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\b[^>]*>/gi)].map((match) => {
    expect(match[1]).not.toMatch(/\bsrc=/i);
    return match[2];
  });
}

function insideDetails(source: string, index: number): boolean {
  const before = source.slice(0, index);
  const opened = (before.match(/<details\b/gi) ?? []).length;
  const closed = (before.match(/<\/details>/gi) ?? []).length;
  return opened > closed;
}

describe("healthy-living pilot 1", () => {
  it("loads nothing and sends nothing", () => {
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/connect-src|<link\b[^>]*rel="stylesheet"|<img\b|<iframe\b|<video\b|<audio\b|<object\b|<embed\b|<form\b/i);
    expect(html).not.toMatch(/\bsrc=/i);
    expect(html).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|\bimport\(|serviceWorker/);
    expect(html).not.toMatch(/http:\/\//i);
    for (const match of html.matchAll(/<a\b([^>]*)\shref="(https:[^"]+)"([^>]*)>/gi)) {
      const attributes = match[1] + match[3];
      expect(attributes, match[2]).toContain('rel="noopener noreferrer"');
      expect(attributes, match[2]).toContain('target="_blank"');
    }
  });

  it("has a script that parses", () => {
    const scripts = inlineScripts(html);
    expect(scripts).toHaveLength(1);
    expect(() => new Script(scripts[0])).not.toThrow();
  });

  it("says plainly that it is a pilot and not personal medical advice", () => {
    expect(html).toContain("This is a pilot");
    expect(html).toContain("It is not personal medical advice.");
    expect(html).toContain("Everything you type is saved in this browser as you go.");
    expect(html).toContain("Nothing is sent online.");
  });

  it("never names the substances the owner rules out, nor the owner", () => {
    expect(html).not.toMatch(/ashwagandha|lion.s mane|finasteride|\bSSRIs?\b/i);
    expect(html).not.toMatch(/\bJoel\b/);
  });

  // Owner's review 355: the line for stroke signs that passed sits right at line 4, not at the end.
  it("shows all twenty emergency lines without a fold, with the passed stroke line at line 4", () => {
    const lines = [...html.matchAll(/data-em="([^"]+)"/g)];
    expect(lines.map((match) => match[1])).toEqual(["1", "2", "3", "4", "passed", ...Array.from({ length: 16 }, (_, index) => String(index + 5))]);
    for (const match of lines) expect(insideDetails(html, match.index ?? 0), `line ${match[1]}`).toBe(false);
    for (const match of lines) expect(html).toContain(`id="msg-${match[1]}"`);
  });

  it("uses the owner's stroke heading and keeps the honest false-alarm line", () => {
    expect(html.match(/<h3 id="stroke-passed">Call now, even though it passed<\/h3>/g)).toHaveLength(1);
    expect(html).not.toContain("Get seen today. Phone");
    expect(html).toContain("in one UK study, fast care cut strokes in the next 3 months from 10 in 100 to 2 in 100.");
    expect(html).toContain("Many callers turn out not to have had a stroke, often about half, and that is expected.");
    expect(html).toContain("say: possible warning stroke");
    expect(html).toContain("Don't drive yourself.");
  });

  it("keeps the owner's 18 Nov additions, the mist idea as his view and not as permission", () => {
    expect(html).toContain("Start everything at the lowest dose");
    expect(html).toContain("don't start breathing anything in as a mist until you are fine with smelling it");
    expect(html).not.toMatch(/only smell first|Go on to the mist|build up only as you are fine/);
    expect(html).toContain("The person receiving closes their eyes.");
    expect(html).toContain("45-80% of a full deep breath");
  });

  // Codex's review of 19 Nov 2026 (P1s): no emergency line may wait on a diagnosis, a fever or every sign.
  const label = (line: string) => html.match(new RegExp(`<label for="em-${line}">([^<]*)</label>`))?.[1] ?? "";

  it("asks no diagnosis, fever or full set of signs before an emergency line", () => {
    expect(label("3")).toContain("Or sudden chest discomfort or pressure that does not go away, even if mild.");
    expect(label("6")).toContain("even if no one has said so, and even without fever");
    expect(label("7")).toMatch(/^A severe headache with a stiff neck, or with light hurting your eyes/);
    expect(label("13")).toMatch(/^Vomiting with deep, fast breathing, even if you have never been diagnosed with diabetes\./);
    expect(label("13")).toContain("but you don't need them");
    expect(html).toContain("Don't wait for a fever, a rash, or every sign: any one is enough.");
  });

  it("puts the adrenaline pen before the call, then lying down and not standing", () => {
    const box = html.slice(html.indexOf('id="msg-8"'), html.indexOf('data-em="9"'));
    expect(box).not.toContain("data-callmsg");
    const pen = box.indexOf("adrenaline (epinephrine) pen");
    expect(pen).toBeGreaterThan(-1);
    expect(box.indexOf("call the emergency number")).toBeGreaterThan(pen);
    expect(box).toContain("If breathing is hard, sit up instead. If you are pregnant, lie on your left side.");
    expect(box).toContain("Don't stand up or walk, even if you feel better.");
  });

  it("sends the further pregnancy warning signs to maternity care now, the severe ones still to the emergency number", () => {
    for (const sign of ["38°C (100.4°F) or more", "very swollen hands or face", "a new racing or uneven heartbeat", "smells bad", "bleeding more than spotting", "the baby moving less"]) {
      expect(label("15"), sign).toContain(sign);
    }
    expect(html).toContain("Call your maternity unit or midwife");
    expect(html.slice(html.indexOf('id="msg-14"'), html.indexOf('data-em="15"'))).toContain("data-callmsg");
  });

  // Final pass of 19 Nov 2026: every sign on the CDC's urgent maternal warning signs page (dated 15 May 2024,
  // read 19 Nov 2026), in plain words, inside the pregnancy part; the severe ones still go to the emergency number.
  it("covers every CDC urgent maternal warning sign in the pregnancy lines, with the link and no dose", () => {
    const emergency = label("14");
    const maternity = label("15");
    // [the CDC's sign, the line that carries it, the page's words]
    const signs: [string, "14" | "15", string][] = [
      ["Headache that won't go away or gets worse over time", "14", "a severe headache"],
      ["Headache that won't go away or gets worse over time", "15", "a headache that won't go away or keeps getting worse"],
      ["Dizziness or fainting", "14", "fainting, a fit, or a gap in time you can't remember"],
      ["Dizziness or fainting", "15", "dizziness or light-headedness that won't go away or keeps coming back"],
      ["Changes in your vision", "14", "blurred or double sight, flashing lights, blind spots, or losing your sight for a while"],
      ["Fever of 100.4°F or higher", "15", "a fever of 38°C (100.4°F) or more"],
      ["Extreme swelling of your hands or face", "15", "very swollen hands or face, or swollen or numb lips or mouth"],
      ["Thoughts about harming yourself or your baby", "15", "thoughts of harming yourself or your baby, or frightening thoughts that come unwanted or are hard to get rid of"],
      ["Trouble breathing", "14", "breathlessness (even if only when lying flat) or a tight throat"],
      ["Chest pain or fast-beating heart", "14", "chest pain, pressure or tightness"],
      ["Chest pain or fast-beating heart", "15", "a new racing or uneven heartbeat, a pounding heart, or skipped beats"],
      ["Severe nausea and throwing up", "15", "severe sickness or vomiting, worse than ordinary morning sickness, or you can't keep fluids down"],
      ["Severe belly pain that doesn't go away", "14", "severe belly pain, or severe shoulder or back pain"],
      ["Severe belly pain that doesn't go away", "15", "belly pain that won't go away or keeps getting worse"],
      ["Baby's movement stopping or slowing during pregnancy", "15", "the baby moving less than before or not at all"],
      ["Vaginal bleeding or fluid leaking during pregnancy", "15", "bleeding more than spotting"],
      ["Vaginal bleeding or fluid leaking during pregnancy", "15", "or fluid leaking"],
      ["Vaginal bleeding or discharge after pregnancy", "14", "heavy bleeding, or passing clots bigger than an egg, or tissue"],
      ["Vaginal bleeding or discharge after pregnancy", "15", "discharge from the vagina that smells bad"],
      ["Severe swelling, redness, or pain of your leg or arm", "14", "a painful swollen leg or arm"],
      ["Severe swelling, redness, or pain of your leg or arm", "15", "swelling, pain, redness or warmth in a leg or arm"],
      ["Overwhelming tiredness", "15", "overwhelming tiredness, not like ordinary tiredness"]
    ];
    for (const [sign, line, words] of signs) expect(line === "14" ? emergency : maternity, sign).toContain(words);
    expect(new Set(signs.map(([sign]) => sign)).size).toBe(15);
    // Line 14 keeps every sign it had, and its call to the emergency number.
    for (const kept of ["heavy bleeding", "severe belly pain", "a severe headache", "blurred", "chest pain", "breathlessness", "a painful swollen leg", "a fit", "confusion, racing thoughts or hearing voices"]) {
      expect(emergency, kept).toContain(kept);
    }
    expect(html.slice(html.indexOf('id="msg-14"'), html.indexOf('data-em="15"'))).toContain("data-callmsg");
    // Line 15: maternity care now; the emergency number if they can't be reached, or if harm might follow.
    const box = html.slice(html.indexOf('id="msg-15"'), html.indexOf('data-em="16"'));
    expect(box).toContain("If you can't reach them, call the emergency number");
    expect(box).toContain("If you might act on thoughts of harming yourself or your baby, call the emergency number now");
    // The link sits inside the pregnancy part, and that part names no dose.
    const part = html.slice(html.indexOf('<p class="group">Pregnancy and the year after</p>'), html.indexOf('<p class="group">Drugs and medicines</p>'));
    expect(part).toContain('<a href="https://www.cdc.gov/hearher/maternal-warning-signs/index.html" target="_blank" rel="noopener noreferrer">');
    expect(part).toContain("any one is enough");
    expect(part).not.toMatch(/\d\s*(?:mg|mcg|µg|ml|units?|tablets?|pills?|puffs?|drops?)\b/i);
  });

  it("keeps the emergency number for stroke signs that only just stopped and for a worst-ever headache", () => {
    const box = html.slice(html.indexOf('id="msg-passed"'), html.indexOf('data-em="5"'));
    expect(box).toContain("If the signs stopped only minutes or hours ago, or it was a sudden worst-ever headache, call the emergency number now");
    expect(box).toContain("Otherwise, phone an emergency department or a stroke clinic now and say: possible warning stroke.");
  });

  it("gives dizziness and tingling no certain harmless cause", () => {
    expect(html).not.toMatch(/it means the breathing got too big|pass(es)? when the breathing settles/);
    expect(html.match(/stop the exercise, sit or lie down, and breathe normally/gi)).toHaveLength(2);
    expect(html).toContain("but so can other things");
  });

  it("says no more for the evidence than it shows (P2s of 19 Nov)", () => {
    expect(html).toContain("Longer-term breathing practice to try");
    expect(html).toContain("Whether this helps stress or sleep is not established by the evidence cited here.");
    expect(html).not.toContain("Root cause. Change how you breathe");
    expect(html).toContain("The review did not assess side effects, so it cannot tell us how often harms occur.");
    expect(html).not.toContain("The asthma trials recorded no harm");
    expect(html).toContain("sterile saline sold for the nose");
    expect(html).toContain("let it air-dry");
  });

  it("says Clearing failed when a clear fails, and accepts no saved copy from before a clear", () => {
    expect(html).toContain('id="clear-failed"');
    expect(html).toContain("Clearing failed; saved answers may remain.");
    const script = inlineScripts(html)[0];
    expect(script).toContain("(p.gen || \"\") !== mark");
    expect(script).not.toMatch(/state = Object\.assign\(blank\(\), parsed\)/);
    // Recheck of 19 Nov: loading, saving, clearing and removing old copies share one cross-tab lock,
    // and a late notice of a clear this tab already knew of resets nothing.
    expect(script).toContain("locks.request(LOCK");
    for (const step of ["return locked(() => {", "locked(save)", "locked(() => onStorage(key))"]) expect(script).toContain(step);
    expect(script).toContain("if (key === CLEARED) return;");
    // Codex's final check of 19 Nov: no step runs without the lock; then the page saves nothing and a clear says it failed.
    expect(script).not.toMatch(/if \(!locks\) return run\(\)|started \? undefined : run\(\)\)/);
    expect(script).toContain("if (!locks || unlocked) return Promise.resolve().then(refused);");
    expect(script).toContain('if (!store || unlocked) { setStamp("failed", "Not saved"); return; }');
    expect(script).toContain("}, clearFailed);");
  });

  it("leaves out what the approved defaults leave out", () => {
    expect(html).not.toMatch(/not into buteyko/i);
    expect(html).not.toMatch(/either person stops it with a word/i);
    expect(html).not.toMatch(/\b(?:TBD|TODO)\b/);
  });

  it("keeps the BOLT score optional, folded and marked as not validated", () => {
    const bolt = html.indexOf('id="bolt"');
    expect(bolt).toBeGreaterThan(-1);
    expect(insideDetails(html, html.indexOf('data-t="bolt"'))).toBe(true);
    expect(html).toContain("it has not been scientifically validated");
  });

  // Owner's review 355: the page says what his guide says, in its own voice, without quotation marks around his
  // words; the words it takes from him are listed with a source that holds them word for word.
  it("speaks in the guide's own voice, with his words checked against their sources", async () => {
    expect(html).not.toMatch(/<q[\s>]/);
    expect(html).not.toMatch(/in (?:the guide's|the guides'|his|the guides' author's) words|as he writes it|He calls|his own condition|Words in quotation marks/i);
    const checked = JSON.parse(await readFile(resolve(root, "labs/healthy-living-pilot-1/checked-quotes.json"), "utf8")) as CheckedQuotes;
    const text = normalizeQuote(html.slice(html.indexOf("<body>"), html.indexOf("<script>")).replace(/<[^>]+>/g, " ")).toLowerCase();
    expect(checked.quotes.length).toBeGreaterThan(40);
    for (const entry of checked.quotes) {
      expect(text, entry.words).toContain(normalizeQuote(entry.words).toLowerCase());
      expect(Object.keys(checked.sources)).toContain(entry.source);
    }
  });

  // Owner's review 355b (19 Nov 2026).
  it("tells people at the top to call if any one sign applies, and opens each line's steps under its box without the script", () => {
    const first = html.indexOf('data-em="1"');
    expect(html.indexOf("call the emergency number now: 911 in the US, 112 in Europe, 999 in the UK. One sign is enough.")).toBeGreaterThan(-1);
    expect(html.indexOf("If any one of these is happening now, call the emergency number now")).toBeLessThan(first);
    expect(html).toContain(".em input:checked ~ .msg { display: block; }");
    const lines = [...html.matchAll(/<input type="checkbox" id="em-([^"]+)" data-em="\1"><label for="em-\1">/g)].map((match) => match[1]);
    expect(lines).toHaveLength(21);
    for (const line of lines) {
      const start = html.indexOf(`id="msg-${line}"`);
      const box = html.slice(start, html.indexOf(`data-actions="${line}"`, start));
      expect(box, `line ${line}`).toMatch(/<li><b>(?:Call|Use your adrenaline|If the signs stopped|Reach a person|If you can call safely)/);
      expect(html.slice(start - 400, start), `line ${line}`).not.toMatch(/hidden[^>]*$/);
    }
    expect(html).not.toMatch(/The signs in line \d/);
    const passed = html.indexOf('data-em="passed"');
    expect(passed).toBeGreaterThan(html.indexOf('data-em="4"'));
    expect(passed).toBeLessThan(html.indexOf('data-em="5"'));
  });

  it("says in plain words what to do about coughing up any blood, with the NHS page", () => {
    expect(label("2")).toContain("more than a few small spots or streaks");
    expect(label("2")).toContain("Or any blood with hard breathing, a very fast heartbeat, or pain in the chest or upper back.");
    expect(html).not.toContain("Coughing up more than streaks of blood.");
    expect(html).toContain("Coughing up a few small spots or streaks of blood, or blood in your phlegm.");
    expect(html).toContain('<a href="https://www.nhs.uk/symptoms/coughing-up-blood/" target="_blank" rel="noopener noreferrer">');
  });

  it("follows the guides' order, step 1 to 5, and lets a symptom lead into it", () => {
    const steps = [...html.matchAll(/<section class="step" id="step-(\d)"/g)].map((match) => match[1]);
    expect(steps).toEqual(["1", "2", "3", "4", "5"]);
    expect(html).not.toContain("What do you want help with first?");
    expect(html).not.toMatch(/name="area"/);
    expect(html).toContain("Go through the basics in this order: 1, water. 2, sleep and breathing. 3, mold. 4, smell. 5, exercise.");
    for (const target of ["#step-1", "#step-2", "#breathing", "#step-3", "#step-4"]) expect(html).toContain(`href="${target}"`);
    // The apnea check and the sleep habits are for everyone, as in the sleep guide.
    expect(html).toMatch(/<div class="sugg" data-sugg="apnea">/);
    expect(html).toMatch(/<div class="sugg" data-sugg="sleep-baseline">/);
  });

  it("changes the obvious harms at once, slowly only where that is unsafe, and tries uncertain things one at a time", () => {
    const rules = html.slice(html.indexOf('id="rules"'), html.indexOf('id="paused"'));
    expect(rules).toContain("Change everything that is obviously harmful now, all at once, as soon as it is safe");
    expect(rules).toContain("Where stopping fast is not safe, go slowly");
    expect(rules).toContain("such as supplements, one at a time");
    expect(html).not.toMatch(/Pick one\. Try it for two weeks|one change at a time shows you what helped/);
  });

  it("keeps the recording as his own sleep study, and states the mainstream caffeine view as the bodies give it", () => {
    expect(html).toContain("your own sleep study. If you hear snoring or pauses in breathing, that's a huge clue.");
    expect(html).not.toMatch(/quiet recording does not rule|even if your recording sounds quiet/);
    expect(html).not.toContain("Morning caffeine is usually thought fine.");
    expect(html).toContain("says no tea or coffee in the 6 hours before bed");
    expect(html).toContain("up to 400 mg of caffeine a day is not generally linked to harm for most adults");
    expect(html).toContain("None of them says anything about caffeine and sleep apnea.");
  });

  it.skipIf(!process.env.ASKRIGOR_PILOT_QUOTE_SOURCES)("finds each checked quote word for word in its source", async () => {
    const checked = JSON.parse(await readFile(resolve(root, "labs/healthy-living-pilot-1/checked-quotes.json"), "utf8")) as CheckedQuotes;
    const folder = process.env.ASKRIGOR_PILOT_QUOTE_SOURCES ?? "";
    const texts = new Map<string, string>();
    for (const name of Object.keys(checked.sources)) texts.set(name, normalizeQuote(await readFile(resolve(folder, name), "utf8")));
    for (const entry of checked.quotes) expect(texts.get(entry.source)?.toLowerCase(), entry.words).toContain(normalizeQuote(entry.words).toLowerCase());
  });
});

interface CheckedQuotes {
  sources: Record<string, string>;
  quotes: { words: string; source: string; guides?: string[] }[];
}

// Same reading as the page shows it: entities decoded (&amp; last, so nothing is decoded twice), curly quotes straightened, a JS-escaped
// apostrophe unescaped, quote-block marks and runs of spaces collapsed.
function normalizeQuote(text: string): string {
  return text
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/\\'/g, "'").replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/^\s*>\s?/gm, " ").replace(/\s+/g, " ").trim();
}
