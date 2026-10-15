// Build once from this runtime's Unicode decimal-digit runs. Some adjacent
// sets (such as mathematical digits) form a run longer than ten characters.
const decimalDigit = /\p{Nd}/u;
const digitValues = new Map<string, string>();
let runStart = -1;
// Every decimal digit is in the first two planes, so the scan stops at U+1FFFF.
for (let codePoint = 0; codePoint <= 0x1ffff; codePoint += 1) {
  const character = String.fromCodePoint(codePoint);
  if (decimalDigit.test(character)) {
    if (runStart < 0) runStart = codePoint;
    digitValues.set(character, String((codePoint - runStart) % 10));
  } else {
    runStart = -1;
  }
}

const NUMBER = /\p{Nd}+(?:[.,]\p{Nd}+)?/u;
// Groups of three digits after a first group of one to three, all with one separator (Arabic's own included), and
// an optional decimal part marked by another; the number ends there.
const GROUPED_NUMBER =
  /\p{Nd}{1,3}([,.\u00A0\u202F' \u066C])\p{Nd}{3}(?:\1\p{Nd}{3})*(?:(?!\1)[.,\u066B]\p{Nd}+)?(?!\p{Nd})/uy;

const numberValue = (number: string): number =>
  Number([...number].map((character) => digitValues.get(character) ?? ".").join(""));

/** Unsigned decimal numbers in any script; a single dot or comma separates decimals. */
export function extractUnsignedNumbers(text: string): number[] {
  return [...text.matchAll(new RegExp(NUMBER.source, "gu"))].map(([number]) => numberValue(number))
    .filter(Number.isFinite);
}

/**
 * The readings of the first number in a text, as extractUnsignedNumbers reads it first. A separator followed by
 * groups of three digits can mark decimals or group thousands, so "1,234" reads as 1.234 and as 1234, and
 * "1.234.567,8" as 1234567.8; any other number has one reading.
 */
export function firstNumberReadings(text: string): number[] {
  const first = NUMBER.exec(text);
  if (first === null) return [];
  const plain = numberValue(first[0]);
  GROUPED_NUMBER.lastIndex = first.index;
  const grouped = GROUPED_NUMBER.exec(text);
  if (grouped === null || digitValues.get(Array.from(grouped[0])[0]!) === "0") return [plain];
  const reading = numberValue(grouped[0].split(grouped[1]!).join(""));
  return Number.isFinite(reading) && reading !== plain ? [plain, reading] : [plain];
}

/** Whether an extracted number matches the declared magnitude, within 1e-9. */
export function includesAbsoluteNumber(numbers: readonly number[], declared: number): boolean {
  return numbers.some((number) => Math.abs(Math.abs(number) - Math.abs(declared)) <= 1e-9);
}
