/**
 * Accepts only exact raw path bytes that are safe to compare without URL
 * parsing, decoding, or normalization.
 */
export function isCanonicalRawPath(path: string): boolean {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("%") ||
    path.includes("\\") ||
    path.includes("#") ||
    path.includes("?")
  ) {
    return false;
  }

  return !path.split("/").some((segment) => segment === "." || segment === "..");
}
