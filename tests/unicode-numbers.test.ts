import { describe, expect, it } from "vitest";

import {
  extractUnsignedNumbers, firstNumberReadings, includesAbsoluteNumber, numberReadings, withAsciiDigits
} from "../apps/research-mcp/src/unicode-numbers.js";

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

  it.each([
    ["74.25 ± 1.2", [74.25]], ["12,5 mg", [12.5]], ["n = 1,234", [1.234, 1234]], ["1.234.567,8", [1.234, 1234567.8]],
    ["1,234,567.89 units", [1.234, 1234567.89]], ["1 234 people", [1, 1234]], ["1'500", [1, 1500]],
    ["0,125", [0.125]], ["1,2345", [1.2345]], ["18% of 1,234", [18]], ["١٬٢٣٤", [1, 1234]], ["none", []]
  ])("reads the first number in %s every way its separators allow", (text, readings) => {
    expect(firstNumberReadings(text)).toEqual(readings);
  });

  it.each([
    ["617 of 1,234 and 494 of 1 235", [617, 1.234, 1234, 494, 1, 1235, 235]],
    ["86,5 % against 68.5%", [86.5, 68.5]], ["٤٩٤ من ١٬٢٣٥", [494, 1, 1235, 235]], ["none", []]
  ])("reads every number in %s as firstNumberReadings reads it at its position", (text, readings) => {
    expect(numberReadings(text)).toEqual(readings);
  });

  it("writes each decimal digit, in any script, as its ASCII digit, and leaves every other character", () => {
    expect(withAsciiDigits("١٢ أسبوعًا، १२ सप्ताह, １２ weeks, 𝟙𝟚 weeks")).toBe("12 أسبوعًا، 12 सप्ताह, 12 weeks, 12 weeks");
    expect(withAsciiDigits("Ⅻ weeks, ² and 12.5")).toBe("Ⅻ weeks, ² and 12.5");
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
