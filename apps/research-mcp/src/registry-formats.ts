/**
 * The formats of the trial registries AskRigor knows: strict, fixed-digit forms, each with its prefix (an EudraCT or EU
 * CT number with its label), in figureText's form (lower case, ASCII digits, dashes as "-"). A number is its core: a
 * registry's name or a label around it is set aside, so "EudraCT 2010-012345-12" and "EudraCT number: 2010-012345-12"
 * are one number.
 *
 * In a module of their own, with no imports, so the study map (study-map.ts) and the privacy screens'
 * research identifiers (findings/research-identifiers.ts) read the same list.
 */
export const REGISTRY_START = String.raw`(?<![\p{L}\p{N}])`;
export const REGISTRY_END = String.raw`(?![\p{L}\p{N}])`;

export type RegistryFormat = readonly [registry: string, pattern: string, core: (parts: string[]) => string];

export const SEARCHED_REGISTRY_FORMATS: readonly RegistryFormat[] = [
  ["NCT", String.raw`nct[\s-]?(\d{8})`, ([digits]) => `NCT${digits}`],
  ["ISRCTN", String.raw`isrctn[\s-]?(\d{8})`, ([digits]) => `ISRCTN${digits}`],
  ["EudraCT", String.raw`(?:eudract|ctis|eu[\s-]?ct|euctr)(?:[\s-]*(?:number|no\.?|nr\.?|id))?[\s:#-]*(\d{4}-\d{6}-\d{2})`,
    ([digits]) => digits!],
  ["ACTRN", String.raw`actrn[\s-]?(\d{14})`, ([digits]) => `ACTRN${digits}`],
  ["ChiCTR", String.raw`chictr-?(\d{10})`, ([digits]) => `ChiCTR${digits}`],
  ["ChiCTR", String.raw`chictr-([a-z]{3})-(\d{8})`, ([kind, digits]) => `ChiCTR-${kind!.toUpperCase()}-${digits}`],
  ["DRKS", String.raw`drks[\s-]?(\d{8})`, ([digits]) => `DRKS${digits}`],
  ["CTRI", String.raw`ctri/(\d{4})/(\d{2,3})/(\d{6})`, (parts) => `CTRI/${parts.join("/")}`],
  ["jRCT", String.raw`jrct(\d{10})`, ([digits]) => `jRCT${digits}`],
  ["UMIN", String.raw`umin[\s-]?(\d{9})`, ([digits]) => `UMIN${digits}`],
  ["PACTR", String.raw`pactr(\d{15})`, ([digits]) => `PACTR${digits}`],
  ["KCT", String.raw`kct(\d{7})`, ([digits]) => `KCT${digits}`],
  ["TCTR", String.raw`tctr(\d{11})`, ([digits]) => `TCTR${digits}`],
  ["RBR", String.raw`rbr-([0-9a-z]{6,8})`, ([code]) => `RBR-${code}`]
];

// Netherlands Trial Register numbers are accepted as the map declares them, and never looked for in a text: their
// short forms are also gene and product names (NTR1, a neurotensin receptor).
export const DECLARED_ONLY_REGISTRY_FORMATS: readonly RegistryFormat[] = [
  ["NTR", String.raw`ntr[\s-]?(\d{4,})`, ([digits]) => `NTR${digits}`],
  ["NL", String.raw`nl[\s-]?(\d{4,})`, ([digits]) => `NL${digits}`]
];
