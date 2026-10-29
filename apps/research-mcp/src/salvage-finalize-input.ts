import { z } from "zod";

type Path = readonly PropertyKey[];
interface Node {
  safeParse(value: unknown): z.ZodSafeParseResult<unknown>;
  def: { type: string; innerType?: Node; in?: Node; shape?: Record<string, Node>; element?: Node;
    options?: Node[]; discriminator?: string };
}
const DROP = Symbol("unusable input");
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
export const inputPath = (path: Path): string => path.reduce<string>((text, part) => typeof part === "number"
  ? `${text}[${part}]` : `${text}${text ? "." : ""}${String(part)}`, "") || "inputs";

function reason(issue: z.core.$ZodIssue): string {
  if (issue.code === "invalid_value") return `not a supported value; use ${issue.values.join(", ")}`;
  if (issue.code === "invalid_type") return `expected ${issue.expected === "array" ? "a list" : issue.expected === "string" ? "text" : issue.expected === "object" ? "an object" : issue.expected}`;
  if (issue.code === "too_small" || issue.code === "too_big") {
    const bound = issue.code === "too_small" ? issue.minimum : issue.maximum;
    return `needs ${issue.code === "too_small" ? "at least" : "at most"} ${bound} ${issue.origin === "array" ? "items" : issue.origin === "string" ? "characters" : "as its value"}`;
  }
  if (issue.code === "invalid_union") return "does not match a supported shape";
  return issue.message;
}

export function droppedInputNotes(issues: readonly z.core.$ZodIssue[], prefix: Path = []): string[] {
  return issues.flatMap((issue) => issue.code === "unrecognized_keys"
    ? issue.keys.map((key) => `${inputPath([...prefix, ...issue.path, key])}: dropped an unknown field.`)
    : [`${inputPath([...prefix, ...issue.path])}: dropped: ${reason(issue)}.`]);
}

/** Case and separators change spelling only. No vocabulary of inferred meanings or database-to-source mappings. */
function enumSpelling(value: unknown, issue: z.core.$ZodIssue): string | undefined {
  if (typeof value !== "string" || issue.code !== "invalid_value") return undefined;
  const key = (text: string) => text.toLowerCase().replace(/[\s_-]+/gu, "");
  const matches = issue.values.filter((allowed): allowed is string => typeof allowed === "string" && key(allowed) === key(value));
  return matches.length === 1 ? matches[0] : undefined;
}

function unwrapped(node: Node): Node {
  while (node.def.innerType !== undefined || node.def.type === "pipe") node = node.def.innerType ?? node.def.in!;
  return node;
}

/** Parse independent fields/items; a required child that cannot parse drops its containing object. */
export function salvageFinalizeInput(schema: z.ZodType, raw: unknown, notes: string[]): unknown {
  const read = (node: Node, value: unknown, path: Path): unknown | typeof DROP => {
    const parsed = node.safeParse(value);
    if (parsed.success) return parsed.data;
    const spelling = enumSpelling(value, parsed.error.issues[0]!);
    if (spelling !== undefined) {
      notes.push(`${inputPath(path)}: read as ${spelling}; only case or separators differed.`);
      return spelling;
    }
    if (node.def.innerType !== undefined || node.def.type === "pipe") {
      const inner = read(node.def.innerType ?? node.def.in!, value, path);
      if (inner === DROP) return DROP;
      const checked = node.safeParse(inner);
      if (checked.success) return checked.data;
      notes.push(...droppedInputNotes(checked.error.issues, path));
      return DROP;
    }
    if (node.def.type === "object" && object(value)) {
      const shape = node.def.shape!;
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(shape, key)) notes.push(`${inputPath([...path, key])}: dropped an unknown field.`);
      }
      const result: Record<string, unknown> = {};
      let missingRequired = false;
      let droppedField = false;
      for (const [key, child] of Object.entries(shape)) {
        const field = read(child, Object.hasOwn(value, key) ? value[key] : undefined, [...path, key]);
        droppedField ||= field === DROP;
        if (field === DROP && path.length === 0 && (key === "receipts" || key === "key_sources")) result[key] = [];
        else if (field === DROP) missingRequired ||= !child.safeParse(undefined).success;
        else if (field !== undefined) result[key] = field;
      }
      if (missingRequired || (path[0] === "open_leads" && path.length === 2 && droppedField)) return DROP;
      const checked = node.safeParse(result);
      if (checked.success) return checked.data;
      notes.push(...droppedInputNotes(checked.error.issues, path));
      return DROP;
    }
    if (node.def.type === "array" && Array.isArray(value)) {
      let result = value.flatMap((item, index) => {
        const field = read(node.def.element!, item, [...path, index]);
        return field === DROP ? [] : [field];
      });
      const own = parsed.error.issues.filter((issue) => issue.path.length === 0);
      notes.push(...own.flatMap((issue) => issue.code === "too_big"
        ? [`${inputPath(path)}: kept at most ${issue.maximum} items to stay within the list's size limit.`]
        : droppedInputNotes([issue], path)));
      for (const issue of own) {
        if (issue.code === "too_big" && typeof issue.maximum === "number") result = result.slice(0, issue.maximum);
      }
      const checked = node.safeParse(result);
      if (checked.success) return checked.data;
      if (own.length === 0) notes.push(...droppedInputNotes(checked.error.issues, path));
      return DROP;
    }
    if (node.def.type === "union") {
      const compatible = node.def.options!.filter((option) => {
        const base = unwrapped(option);
        if (node.def.discriminator !== undefined && object(value)) {
          const field = base.def.shape?.[node.def.discriminator];
          return field !== undefined && field.safeParse(value[node.def.discriminator]).success;
        }
        return base.def.type === (Array.isArray(value) ? "array" : object(value) ? "object" : typeof value);
      });
      if (compatible.length === 1) return read(compatible[0]!, value, path);
    }
    notes.push(...droppedInputNotes(parsed.error.issues, path));
    return DROP;
  };
  const result = read(schema as unknown as Node, raw, []);
  return result === DROP ? undefined : result;
}
