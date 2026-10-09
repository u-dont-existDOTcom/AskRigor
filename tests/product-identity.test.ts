import { describe, expect, it } from "vitest";
import {
  classifyProductComment, classifyProductVideo, normalizeProductName, productIdentityClaims,
  productIdentitySchema, productNameOccurs, productVideoAdmitted
} from "../packages/sources/src/product-identity.js";

const identity = productIdentitySchema.parse({ names: ["Nan Bao"], maker_names: ["Lisheng"], other_variant_names: ["Changhong"] });

describe("shared exact product identity", () => {
  it("keeps combining marks inside their word, so a split Devanagari word does not match", () => {
    expect(productNameOccurs("अश्वगंधा", "अश्वगंधा चूर्ण")).toBe(true);
    expect(productNameOccurs("अश्वगंधा", "अश्व गंधा")).toBe(false);
  });
  it("normalizes compatibility forms, case and nonletter/nonnumber runs in every script", () => {
    expect(normalizeProductName("  ＭＵＳＳＫ—２０２６! ")).toBe("mussk 2026");
    for (const name of ["ÉCG", "БАО", "ΝΑΝ", "نان", "נאן", "नान", "নান", "نان۲۰۲۶", "男宝", "ナン", "한글", "ไทย"])
      expect(productNameOccurs(name, `!?${name.toLowerCase()}!!!`)).toBe(true);
    expect(normalizeProductName("A\u0301__B\u0308 + १२३")).toBe("á b\u0308 १२३");
  });

  it("requires token boundaries on each spaced-script edge and checks later occurrences", () => {
    expect(productNameOccurs("Nan Bao", "xNan Bao Nan Baox")).toBe(false);
    expect(productNameOccurs("Nan Bao", "xNan Bao, then NAN-BAO!")).toBe(true);
    expect(productNameOccurs("MUSSK", "MUUCHSTAC musskplus")).toBe(false);
    expect(productNameOccurs("١٢", "٣١٢٤")).toBe(false);
    expect(productNameOccurs("!!!", "!!!")).toBe(false);
    expect(productNameOccurs("é", "bébé")).toBe(false);
  });

  it.each([
    ["Han", "男宝"], ["Hiragana", "なの"], ["Katakana", "ナン"], ["Hangul", "한글"],
    ["Thai", "ไทย"], ["Lao", "ລາວ"], ["Khmer", "ខ្មែរ"], ["Myanmar", "မြန်မာ"], ["Tibetan", "བོད"]
  ])("allows unspaced edges for %s", (_script, name) => {
    expect(productNameOccurs(name, `前${name}後`)).toBe(true);
    expect(productNameOccurs(`${name} A`, `前${name} A後`)).toBe(false);
    expect(productNameOccurs(`${name} A`, `前${name} A!`)).toBe(true);
    expect(productNameOccurs(`A ${name}`, `前A ${name}後`)).toBe(false);
    expect(productNameOccurs(`A ${name}`, `!A ${name}後`)).toBe(true);
  });

  it.each([
    ["Lisheng Changhong", "other_product", false],
    ["Nan Bao Changhong", "other_variant", false],
    ["Nan Bao Lisheng Changhong", "mixed_variants", true],
    ["Nan Bao", "variant_unresolved", true],
    ["Nan Bao Lisheng", "exact", true]
  ] as const)("classifies video table row %s", (title, expected, admitted) => {
    expect(classifyProductVideo(identity, { title })).toBe(expected);
    expect(productVideoAdmitted(expected)).toBe(admitted);
  });

  it("matches full description and tags independently, and permits undeclared makers", () => {
    expect(classifyProductVideo(identity, { description: "Nan Bao by Lisheng" })).toBe("exact");
    expect(classifyProductVideo(identity, { tags: ["Nan Bao", "Lisheng"] })).toBe("exact");
    expect(classifyProductVideo(identity, { title: "Nan", description: "Bao Lisheng" })).toBe("other_product");
    expect(classifyProductVideo(productIdentitySchema.parse({ names: ["Nan Bao"] }), { title: "Nan Bao" })).toBe("exact");
  });

  it.each([
    ["Changhong Nan Bao", "exact", "other_variant"],
    ["Lisheng", "mixed_variants", "exact"],
    ["Lisheng Changhong", "exact", "variant_unresolved"],
    ["Helped me", "exact", "exact"],
    ["Helped me", "variant_unresolved", "variant_unresolved"],
    ["Helped me", "mixed_variants", "variant_unresolved"]
  ] as const)("classifies comment %s on %s", (text, videoClass, expected) => {
    expect(classifyProductComment(identity, videoClass, text)).toBe(expected);
  });

  it("bounds declarations and returns only a compact product claim and admitted classes", () => {
    expect(productIdentitySchema.safeParse({ names: [] }).success).toBe(false);
    expect(productIdentitySchema.safeParse({ names: Array(7).fill("Bao") }).success).toBe(false);
    expect(productIdentitySchema.safeParse({ names: ["Bao"], maker_names: Array(7).fill("Maker") }).success).toBe(false);
    expect(productIdentitySchema.safeParse({ names: ["Bao"], other_variant_names: Array(13).fill("Other") }).success).toBe(false);
    expect(productIdentityClaims(identity, [
      { video_id: "a", product_class: "exact" }, { video_id: "b", product_class: "mixed_variants" },
      { video_id: "c", product_class: "variant_unresolved" }, { video_id: "d", product_class: "other_variant" }
    ])).toEqual({ product: "nan bao", exact: ["a"], mixed_variants: ["b"], variant_unresolved: ["c"] });
    expect([...productIdentityClaims(productIdentitySchema.parse({ names: ["男".repeat(90)] }), []).product!].length).toBe(80);
  });
});
