import { createHash } from "node:crypto";

export const SECOND_READER_RUBRIC_VERSION = "2026-10-17.1";
// reader-trial/reader.py's rubric, restricted by owner answer 117b to these three kinds.
export const SECOND_READER_RUBRIC = `You check research answers for AskRigor, a health-research service. Before an answer is shown, the AI that
wrote it declares some of its sentences to AskRigor's final check, which then checks them exactly. A sentence the AI
fails to declare is never checked. Your job: find sentences in the answer that belong to one of the kinds below but are
missing from the declarations, or whose declaration misstates them. Do not judge whether the answer is right; judge only
whether the declarations cover what the answer says.

Kinds (as the final check defines them):
- safety_claims: each sentence that warns that something can cause harm, is unsafe, toxic or risky, or should be
  avoided because of a possible harm, or that calls something safe or harmless. Its basis: comparative_rates (a
  controlled comparison reports it in each group); observed_rates (a rate without a comparator); share_of_reports (a
  share of selected reports, posts or passages, not of people); case_reports (reports without a denominator);
  hazard_measurement (a laboratory, animal or composition measurement, not observed outcomes in people);
  not_quantified (no source found gives a rate).
- key_terms: each specialized term the answer's conclusions depend on (a chemical species, a test, a statistical
  measure), with the sentence that first explains it in plain words.
- scale_results: each scale or questionnaire result the answer reports.
Report only these three kinds.

Report a finding only when you can quote the answer's own sentence exactly (copy it character for character, at most
400 characters). "missing": the sentence belongs to a kind but no declaration of that kind covers it. "misdeclared": a
declaration covers it but states something the sentence contradicts (for example the wrong basis or route). Ignore
the answer's caveat sentences that report AskRigor's limits, and sentences that only restate a declared one.

Reply with JSON only: {"findings": [{"kind": "...", "issue": "missing" | "misdeclared", "quote": "...", "why": "one
short sentence"}]}, or {"findings": []} if there is nothing to report.`;

export type SecondReaderKind = "safety_claims" | "key_terms" | "scale_results";
export interface SecondReaderFinding { kind: SecondReaderKind; quote: string; why: string }
export type SecondReading =
  | { status: "ran"; findings: SecondReaderFinding[] }
  | { status: "skipped"; reason: "off" | "daily_budget" | "error" | "timeout" | "unreadable" };
export interface SecondReaderDeclarations {
  safety_claims: readonly unknown[];
  key_terms: readonly unknown[];
  scale_results: readonly unknown[];
}
export interface SecondReader {
  readonly enabled: boolean;
  readAnswer(draft: string, declarations: SecondReaderDeclarations): Promise<SecondReading>;
}

const KINDS = new Set<string>(["safety_claims", "key_terms", "scale_results"]);
const HOUR = 60 * 60 * 1_000;
const TIMEOUT = 30_000;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

// Python json.dumps(..., ensure_ascii=False)'s compact spacing, including nested declarations.
function declarationsJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(declarationsJson).join(", ")}]`;
  if (object(value)) return `{${Object.entries(value).map(([key, child]) =>
    `${JSON.stringify(key)}: ${declarationsJson(child)}`).join(", ")}}`;
  return JSON.stringify(value);
}

/** A new instance reads configuration once; the production instance below is process-local. */
export function createSecondReader(dependencies: {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  log?: (failureClass: string) => void;
} = {}): SecondReader {
  const env = dependencies.env ?? process.env;
  const fetcher = dependencies.fetch ?? globalThis.fetch;
  const now = dependencies.now ?? Date.now;
  const log = dependencies.log ?? ((line: string) => console.error(line));
  const off: SecondReader = { enabled: false, readAnswer: async () => ({ status: "skipped", reason: "off" }) };
  if (env.ASKRIGOR_SECOND_READER !== "on") return off;
  const required = ["ASKRIGOR_SECOND_READER_BASE_URL", "ASKRIGOR_SECOND_READER_MODEL", "ASKRIGOR_SECOND_READER_KEY",
    "ASKRIGOR_SECOND_READER_PRICE_IN", "ASKRIGOR_SECOND_READER_PRICE_OUT"] as const;
  const missing = required.filter((name) => !env[name]?.trim());
  if (missing.length > 0) { log(missing.join(", ")); return off; }
  const model = env.ASKRIGOR_SECOND_READER_MODEL!;
  const key = env.ASKRIGOR_SECOND_READER_KEY!;
  const priceIn = Number(env.ASKRIGOR_SECOND_READER_PRICE_IN);
  const priceOut = Number(env.ASKRIGOR_SECOND_READER_PRICE_OUT);
  const cap = Number(env.ASKRIGOR_SECOND_READER_DAILY_CAP_USD ?? 4);
  let base: URL;
  try {
    base = new URL(env.ASKRIGOR_SECOND_READER_BASE_URL!);
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash ||
      ![priceIn, priceOut, cap].every((value) => Number.isFinite(value) && value >= 0)) throw new Error();
  } catch { log("error"); return off; }
  const endpoint = `${base.href.replace(/\/+$/u, "")}/chat/completions`;
  const venice = base.hostname === "api.venice.ai";
  const cache = new Map<string, { until: number; reading: Promise<SecondReading> }>();
  let day = "";
  let spent = 0;
  const fail = (reason: "error" | "timeout" | "unreadable"): SecondReading => {
    log(reason);
    return { status: "skipped", reason };
  };
  async function request(draft: string, json: string): Promise<SecondReading> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error()); }, TIMEOUT);
    });
    try {
      const reply = await Promise.race([(async (): Promise<unknown> => {
        const response = await fetcher(endpoint, {
          method: "POST", redirect: "error", signal: controller.signal,
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, temperature: 0, max_tokens: 3000, response_format: { type: "json_object" },
            messages: [{ role: "system", content: SECOND_READER_RUBRIC }, { role: "user", content:
              `ANSWER (as the user would see it):\n<<<\n${draft}\n>>>\n\nDECLARATIONS made to the final check (JSON):\n${json}` }],
            ...(venice ? { venice_parameters: { include_venice_system_prompt: false } } : {}) })
        });
        if (!response.ok) throw new Error();
        try { return await response.json(); } catch { return undefined; }
      })(), timedOut]);
      if (!object(reply)) return fail("unreadable");
      if (object(reply.usage)) {
        const usage = reply.usage;
        const tokens = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
        // Charge the reply's UTC day, including a request that crossed midnight.
        const currentDay = new Date(now()).toISOString().slice(0, 10);
        if (currentDay !== day) { day = currentDay; spent = 0; }
        spent += (tokens(usage.prompt_tokens) * priceIn + tokens(usage.completion_tokens) * priceOut) / 1e6;
      }
      const choice = Array.isArray(reply.choices) ? reply.choices[0] : undefined;
      const content = object(choice) && object(choice.message) ? choice.message.content : undefined;
      if (typeof content !== "string") return fail("unreadable");
      let result: unknown;
      // Some providers wrap JSON in a code fence despite the requested format.
      const fenced = /^\s*```(?:json)?\s*\n([\s\S]*?)\n\s*```\s*$/u.exec(content);
      try { result = JSON.parse(fenced === null ? content : fenced[1]!); } catch { return fail("unreadable"); }
      if (!object(result) || !Array.isArray(result.findings)) return fail("unreadable");
      const findings = result.findings.filter((finding): finding is SecondReaderFinding =>
        object(finding) && typeof finding.kind === "string" && KINDS.has(finding.kind) &&
        typeof finding.quote === "string" && finding.quote.trim().length > 0 &&
        typeof finding.why === "string" && !finding.quote.includes(key) && !finding.why.includes(key))
        .map(({ kind, quote, why }) => ({ kind, quote, why }));
      return { status: "ran", findings };
    } catch { return fail(controller.signal.aborted ? "timeout" : "error"); }
    finally { clearTimeout(timer); }
  }
  return {
    enabled: true,
    async readAnswer(draft, declarations) {
      const current = now();
      const currentDay = new Date(current).toISOString().slice(0, 10);
      if (currentDay !== day) { day = currentDay; spent = 0; }
      // Select only the three permitted declaration kinds, even for an untyped caller.
      const json = declarationsJson({ safety_claims: declarations.safety_claims,
        key_terms: declarations.key_terms, scale_results: declarations.scale_results });
      // Keyed by the draft alone: declaring or dismissing a finding then reuses the reading, and the gate decides
      // coverage against the current declarations, so the check converges without paying for a new reading.
      const hash = createHash("sha256").update(JSON.stringify([model, SECOND_READER_RUBRIC_VERSION, draft])).digest("hex");
      for (const [entry, cached] of cache) if (cached.until <= current) cache.delete(entry);
      const cached = cache.get(hash);
      if (cached !== undefined) return cached.reading;
      if (spent >= cap) return { status: "skipped", reason: "daily_budget" };
      if (cache.size >= 500) cache.delete(cache.keys().next().value!);
      const reading = request(draft, json);
      cache.set(hash, { until: current + HOUR, reading });
      const result = await reading;
      if (result.status !== "ran" && cache.get(hash)?.reading === reading) cache.delete(hash);
      return result;
    }
  };
}

const configuredReader = createSecondReader();
export const secondReaderEnabled = configuredReader.enabled;
export const readAnswer: SecondReader["readAnswer"] = (draft, declarations) => configuredReader.readAnswer(draft, declarations);
