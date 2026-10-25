// The patient-story evidence extension's JSON Schemas (v0.2, frozen by tests/longitudinal-evidence-preservation.test.ts,
// and v0.3) were generated with zod 4.4. zod 4.6 writes two things differently: a nullable primitive, or a union of
// primitives, as one node with a list of types where zod 4.4 wrote an anyOf branch per type; and the date-time pattern
// with the seconds required wherever a time zone follows, as zod's own check always had them, where zod 4.4's pattern
// let them out. Both are mapped back to zod 4.4's form, so each generator still reproduces its published file byte for
// byte; what the contracts accept is unchanged.

const ZOD_46_TIME_WITH_ZONE = String.raw`T(?:(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z`;
const ZOD_44_TIME_WITH_ZONE = String.raw`T(?:(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z`;

export function asZod44JsonSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(asZod44JsonSchema);
  if (node === null || typeof node !== "object") return node;
  const copy = Object.fromEntries(Object.entries(node).map(([key, value]) => [key, asZod44JsonSchema(value)]));
  if (typeof copy.pattern === "string" && copy.format === "date-time") {
    copy.pattern = copy.pattern.replace(ZOD_46_TIME_WITH_ZONE, ZOD_44_TIME_WITH_ZONE);
  }
  if (!Array.isArray(copy.type)) return copy;
  const { type: types, ...rest } = copy;
  return { anyOf: (types as string[]).map((type) => type === "null" ? { type: "null" } : { ...rest, type }) };
}
