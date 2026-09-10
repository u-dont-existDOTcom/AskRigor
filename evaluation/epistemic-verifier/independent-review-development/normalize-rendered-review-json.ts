/**
 * Losslessly restore JSON string escaping consumed by the ChatGPT Markdown
 * renderer. The raw rendered response remains the immutable source artifact;
 * this helper only emits a separately receipted machine-readable derivative.
 */

type Container = { type: "object" | "array"; expect: "key" | "value" | "colon" | "comma" };

function nextNonWhitespace(input: string, index: number): string {
  for (let cursor = index; cursor < input.length; cursor += 1) {
    if (!/\s/u.test(input[cursor]!)) return input[cursor]!;
  }
  return "";
}

function closesValueString(input: string, index: number): boolean {
  const next = nextNonWhitespace(input, index);
  if (next === "}" || next === "]" || next === "") return true;
  if (next !== ",") return false;
  const comma = input.indexOf(",", index);
  const afterComma = nextNonWhitespace(input, comma + 1);
  return afterComma === '"' || afterComma === "{" || afterComma === "[" || afterComma === "}" || afterComma === "]";
}

export function normalizeRenderedReviewJson(raw: string): string {
  let input = raw.trim();
  if (input.startsWith("```")) {
    input = input.replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, "");
  }

  const output: string[] = [];
  const stack: Container[] = [];
  let inString = false;
  let stringRole: "key" | "value" = "value";
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]!;
    const top = stack.at(-1);

    if (inString) {
      if (escaped) {
        output.push(char);
        escaped = false;
        continue;
      }
      if (char === "\\") {
        output.push(char);
        escaped = true;
        continue;
      }
      if (char === "\n") {
        output.push("\\n");
        continue;
      }
      if (char === "\r") {
        output.push("\\r");
        continue;
      }
      if (char === "\t") {
        output.push("\\t");
        continue;
      }
      if (char === '"') {
        const next = nextNonWhitespace(input, index + 1);
        const closes = stringRole === "key" ? next === ":" : closesValueString(input, index + 1);
        if (!closes) {
          output.push('\\"');
          continue;
        }
        inString = false;
        output.push(char);
        if (top?.type === "object") top.expect = stringRole === "key" ? "colon" : "comma";
        if (top?.type === "array") top.expect = "comma";
        continue;
      }
      output.push(char);
      continue;
    }

    if (char === '"') {
      inString = true;
      stringRole = top?.type === "object" && top.expect === "key" ? "key" : "value";
      output.push(char);
      continue;
    }
    if (char === "{") stack.push({ type: "object", expect: "key" });
    else if (char === "[") stack.push({ type: "array", expect: "value" });
    else if (char === ":" && top?.type === "object") top.expect = "value";
    else if (char === "," && top) top.expect = top.type === "object" ? "key" : "value";
    else if (char === "}" || char === "]") {
      stack.pop();
      const parent = stack.at(-1);
      if (parent) parent.expect = "comma";
    }
    output.push(char);
  }

  if (inString) throw new Error("Rendered review ended inside a JSON string");
  const normalized = `${output.join("")}\n`;
  JSON.parse(normalized);
  return normalized;
}
