/**
 * Routes of administration, one list for the study audit's programs and for
 * finalize_research's mechanism claims (owner question 88): a mechanism stated
 * for one route rests on evidence from that route, or the answer says which
 * route the evidence used and that the stated route was not tested.
 */
export const ADMINISTRATION_ROUTES = [
  "oral",
  "topical_skin",
  "topical_mucosal",
  "inhaled",
  "nasal",
  "intravenous",
  "intraperitoneal",
  "intramuscular",
  "subcutaneous",
  "in_vitro",
  "other"
] as const;

export type AdministrationRoute = typeof ADMINISTRATION_ROUTES[number];

/** How an experiment's route reads in the answer's caveat. */
export const EVIDENCE_ROUTE_WORDS: Readonly<Record<AdministrationRoute, string>> = {
  oral: "dosing by mouth",
  topical_skin: "application to the skin",
  topical_mucosal: "application to a mucous membrane",
  inhaled: "inhalation",
  nasal: "dosing into the nose",
  intravenous: "injection into a vein",
  intraperitoneal: "injection into the abdomen",
  intramuscular: "injection into a muscle",
  subcutaneous: "injection under the skin",
  in_vitro: "test-tube experiments",
  other: "dosing by another route"
};

/** How the described use's route reads in the answer's caveat. */
export const USE_ROUTE_WORDS: Readonly<Record<AdministrationRoute, string>> = {
  oral: "use by mouth",
  topical_skin: "use on the skin",
  topical_mucosal: "use on a mucous membrane",
  inhaled: "inhaled use",
  nasal: "use in the nose",
  intravenous: "use by injection into a vein",
  intraperitoneal: "use by injection into the abdomen",
  intramuscular: "use by injection into a muscle",
  subcutaneous: "use by injection under the skin",
  in_vitro: "use outside the body",
  other: "use by the route described"
};
