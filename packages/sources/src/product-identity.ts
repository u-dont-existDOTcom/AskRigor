import { z } from "zod";

/** Exact structural matching of model-declared names, not a relevance judgment. */
export function normalizeProductName(text: string): string {
  // Combining marks (Devanagari vowel signs, for example) stay inside their word.
  return text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();
}

const nameSchema = z.string().trim().min(1).max(500)
  .refine((name) => normalizeProductName(name).length > 0, "A name contains letters or numbers");
export const productIdentitySchema = z.object({
  names: z.array(nameSchema).min(1).max(6)
    .describe("Lists label names and documented aliases/scripts."),
  maker_names: z.array(nameSchema).max(6).default([])
    .describe("Lists maker/brand names distinguishing variants."),
  other_variant_names: z.array(nameSchema).max(12).default([])
    .describe("Lists sibling products and other makers' variants.")
}).strict().describe("Records exact product matching of provider text.");
export type ProductIdentity = z.output<typeof productIdentitySchema>;

export const videoProductClassSchema = z.enum([
  "other_product", "other_variant", "mixed_variants", "variant_unresolved", "exact"
]);
export type VideoProductClass = z.output<typeof videoProductClassSchema>;
export const commentProductClassSchema = z.enum(["exact", "variant_unresolved", "other_variant"]);
export type CommentProductClass = z.output<typeof commentProductClassSchema>;
export const commentProductCountsSchema = z.object({
  exact: z.number().int().nonnegative(),
  variant_unresolved: z.number().int().nonnegative(),
  other_variant: z.number().int().nonnegative()
}).strict();

const NO_SPACE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}\p{Script=Tibetan}]/u;

export function productNameOccurs(name: string, text: string): boolean {
  const needle = normalizeProductName(name);
  if (needle.length === 0) return false;
  const haystack = normalizeProductName(text);
  const characters = [...needle];
  const leftUnbounded = NO_SPACE.test(characters[0]!);
  const rightUnbounded = NO_SPACE.test(characters.at(-1)!);
  let position = haystack.indexOf(needle);
  while (position !== -1) {
    const end = position + needle.length;
    if ((leftUnbounded || position === 0 || haystack[position - 1] === " ") &&
        (rightUnbounded || end === haystack.length || haystack[end] === " ")) return true;
    position = haystack.indexOf(needle, position + 1);
  }
  return false;
}

const anyName = (names: readonly string[], text: string): boolean =>
  names.some((name) => productNameOccurs(name, text));

export function classifyProductVideo(
  identity: ProductIdentity,
  metadata: { title?: string; description?: string; tags?: string[] }
): VideoProductClass {
  // Fields are matched independently: separate fields cannot construct a name.
  const fields = [metadata.title ?? "", metadata.description ?? "", ...(metadata.tags ?? [])];
  const found = (names: readonly string[]) => fields.some((text) => anyName(names, text));
  if (!found(identity.names)) return "other_product";
  const maker = found(identity.maker_names);
  if (found(identity.other_variant_names)) return maker ? "mixed_variants" : "other_variant";
  return identity.maker_names.length > 0 && !maker ? "variant_unresolved" : "exact";
}

export function productVideoAdmitted(productClass: VideoProductClass): boolean {
  return productClass === "exact" || productClass === "mixed_variants" || productClass === "variant_unresolved";
}

export function classifyProductComment(
  identity: ProductIdentity, videoClass: VideoProductClass, text: string
): CommentProductClass {
  const maker = anyName(identity.maker_names, text);
  const other = anyName(identity.other_variant_names, text);
  if (other) return maker ? "variant_unresolved" : "other_variant";
  if (maker) return "exact";
  return videoClass === "exact" ? "exact" : "variant_unresolved";
}

export function emptyCommentProductCounts(): z.output<typeof commentProductCountsSchema> {
  return { exact: 0, variant_unresolved: 0, other_variant: 0 };
}

export const PRODUCT_SNIPPET_LIMITATION =
  "Product identity was matched only against provider search snippets; the full video description and tags were not available for this classification.";

/** Only this bounded normalized product claim enters a research receipt. */
export function productIdentityClaims(
  identity: ProductIdentity | undefined,
  videos: readonly { video_id: string; product_class?: VideoProductClass }[]
): Record<string, string | string[]> {
  if (identity === undefined) return {};
  const claims: Record<string, string | string[]> = {
    product: [...normalizeProductName(identity.names[0]!)].slice(0, 80).join("")
  };
  for (const productClass of ["exact", "variant_unresolved", "mixed_variants"] as const) {
    const admitted = videos.filter((video) => video.product_class === productClass).map((video) => video.video_id);
    if (admitted.length > 0) claims[productClass] = admitted;
  }
  return claims;
}
