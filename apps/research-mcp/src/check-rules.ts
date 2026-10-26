/** A server-authored rule keeps its literal wording separate from every inserted value. */
export interface CheckRule {
  readonly text: string;
  readonly parts: readonly string[];
  readonly values: readonly unknown[];
}
export type RuleInput = string | CheckRule;
const rules = new WeakSet<object>();

export function rule(parts: TemplateStringsArray, ...values: unknown[]): CheckRule {
  return makeRule([...parts], values);
}

function makeRule(parts: readonly string[], values: readonly unknown[]): CheckRule {
  const result = { parts, values, text: parts.reduce((text, part, index) =>
    text + part + (index < values.length ? ruleTextValue(values[index]) : ""), "") };
  rules.add(result);
  return result;
}

function isRule(value: unknown): value is CheckRule {
  return typeof value === "object" && value !== null && rules.has(value);
}

function ruleTextValue(value: unknown): string {
  return isRule(value) ? value.text : String(value);
}

export function ruleText(value: RuleInput): string { return typeof value === "string" ? value : value.text; }
export function ruleParts(value: RuleInput): CheckRule {
  // A string whose construction was not tagged is opaque, never assumed to be server wording.
  return typeof value === "string" ? makeRule(["", ""], [value]) : value;
}

/** Concatenation preserves literal fragments, including the old step's exact whitespace. */
export function joinRules(...values: RuleInput[]): CheckRule {
  const parts = [""];
  const inserted: unknown[] = [];
  for (const value of values) {
    const next = typeof value === "string" ? makeRule([value], []) : value;
    parts[parts.length - 1] += next.parts[0]!;
    for (let i = 0; i < next.values.length; i += 1) {
      inserted.push(next.values[i]);
      parts.push(next.parts[i + 1]!);
    }
  }
  return makeRule(parts, inserted);
}

/** Membership is exact and language-independent; nested server rules retain their own literal wording. */
export function maskedRule(value: CheckRule | undefined, allowed: (value: unknown) => boolean): string {
  if (value === undefined) return "…";
  return value.parts.reduce((text, part, index) => text + part + (index < value.values.length
    ? isRule(value.values[index]) ? maskedRule(value.values[index], allowed)
      : allowed(value.values[index]) ? String(value.values[index]) : "…"
    : ""), "");
}
