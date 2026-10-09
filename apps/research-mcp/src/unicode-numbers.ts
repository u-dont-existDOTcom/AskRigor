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

/** Unsigned decimal numbers in any script; a single dot or comma separates decimals. */
export function extractUnsignedNumbers(text: string): number[] {
  return [...text.matchAll(/\p{Nd}+(?:[.,]\p{Nd}+)?/gu)].map(([number]) =>
    Number([...number].map((character) => digitValues.get(character) ?? ".").join(""))
  ).filter(Number.isFinite);
}

/** Whether an extracted number matches the declared magnitude, within 1e-9. */
export function includesAbsoluteNumber(numbers: readonly number[], declared: number): boolean {
  return numbers.some((number) => Math.abs(Math.abs(number) - Math.abs(declared)) <= 1e-9);
}
