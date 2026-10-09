import { describe, expect, it } from "vitest";

import { extractUnsignedNumbers, includesAbsoluteNumber } from "../apps/research-mcp/src/unicode-numbers.js";

describe("Unicode unsigned numbers", () => {
  it.each([
    ["Latin", "0–28; 6.8 versus 9.7; 2.9-point; 6", [0, 28, 6.8, 9.7, 2.9, 6]],
    ["Arabic-Indic", "٠–٢٨; ٦.٨ مقابل ٩.٧; ٢,٩; ٦", [0, 28, 6.8, 9.7, 2.9, 6]],
    ["Devanagari", "०–२८; ६.८; ९.७; २,९; ६", [0, 28, 6.8, 9.7, 2.9, 6]],
    ["full-width", "０–２８; ６.８; ９.７; ２,９; ６", [0, 28, 6.8, 9.7, 2.9, 6]],
    ["adjacent supplementary digit sets", "𝟘–𝟚𝟠; 𝟞.𝟠; 𝟗.𝟟; 𝟤,𝟫; 𝟲", [0, 28, 6.8, 9.7, 2.9, 6]],
    ["mixed scripts", "२.９", [2.9]]
  ])("maps %s decimal digits to ASCII values", (_script, text, numbers) => {
    expect(extractUnsignedNumbers(text as string)).toEqual(numbers);
  });

  it.each([
    ["2,9", [2.9]], ["0–28", [0, 28]], ["0-28", [0, 28]], ["0 to 28", [0, 28]],
    ["2.9-point", [2.9]], ["-2.9 and +6", [2.9, 6]], ["2..9 and 2,,9", [2, 9, 2, 9]]
  ])("extracts numbers from %s", (text, numbers) => {
    expect(extractUnsignedNumbers(text)).toEqual(numbers);
  });

  it("uses decimal digits only, and compares whole numbers rather than substrings", () => {
    expect(extractUnsignedNumbers("Ⅵ and ² and twenty-eight")).toEqual([]);
    expect(includesAbsoluteNumber(extractUnsignedNumbers("128 and 2.9"), 28)).toBe(false);
    expect(includesAbsoluteNumber(extractUnsignedNumbers("128 and 2.9"), 9)).toBe(false);
  });

  it("compares absolute values with a 1e-9 tolerance", () => {
    expect(includesAbsoluteNumber([2.9], -2.9)).toBe(true);
    expect(includesAbsoluteNumber([-2.9], 2.9)).toBe(true);
    expect(includesAbsoluteNumber([2.9], 2.9 + 0.5e-9)).toBe(true);
    expect(includesAbsoluteNumber([0], -1e-9)).toBe(true);
    expect(includesAbsoluteNumber([2.9], 2.9 + 2e-9)).toBe(false);
    expect(includesAbsoluteNumber([], 0)).toBe(false);
  });
});
