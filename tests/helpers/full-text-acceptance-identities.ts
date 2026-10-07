import type { FrozenArticleIdentity } from "../../packages/sources/src/full-text-admission.js";

// Identifiers and first authors are supplied by the owner plan. Exact titles
// were not supplied or available offline; do not invent bibliographic facts.
// These fixtures test the DOI identity path. Exact-title cases remain pending.
export const planAcceptanceIdentities: FrozenArticleIdentity[] = [
  { doi: "10.1016/s0887-8994(99)00152-6", pmid: "10734247", first_author: "Walters AS", year: "2000", journal: "Pediatr Neurol" },
  { doi: "10.1016/s0166-4328(03)00097-4", pmid: "14529800", first_author: "Overtoom CC", year: "2003", journal: "Behav Brain Res" },
  { doi: "10.1006/bbrc.2001.4945", pmid: "11374875", first_author: "Bertoldi M", year: "2001", journal: "BBRC" }
];
