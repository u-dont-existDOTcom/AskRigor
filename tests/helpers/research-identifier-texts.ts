// The first real research dossier (AskRigor#477 stage 1, 16 Nov 2026) was refused for good because an open lead cited a
// trial by its registry number, ACTRN12620000032954, and the privacy screens read its digits as a phone number. These
// lists hold the dossier's screen (dossier-privacy.ts) and the findings card's (card.ts) to research identifiers in their
// published shapes and to phone numbers, emails and addresses among them. Every identifier is invented in its
// registry's format, and every phone number, address and email is fictitious.

/** Research sentences citing a DOI, a PMID, a PMCID or an NCT number in its published shape: both screens pass each. */
export const SOURCE_IDENTIFIER_SENTENCES = [
  "A 2019 randomized trial (doi:10.1080/14767058.2019.1594763) found less bloating with psyllium.",
  "The meta-analysis 10.1111/j.1365-2036.2012.05006.x pooled seven trials of soluble fibre.",
  "The Lancet trial (10.1016/S0140-6736(20)30183-5) was stopped early.",
  "Its protocol (PMID 31234567) set abdominal pain as the primary outcome.",
  "PMID: 33445566 reported no difference at 12 weeks.",
  "In one trial (PMID 31234567) 12 weeks of psyllium eased pain.",
  "See PMID 31234567. 12 participants completed follow-up.",
  "PMID 31234567: 12 weeks of psyllium eased pain.",
  "The full text (PMC7654321) gives the adverse events by group.",
  "PMCID: PMC10518852 lists the per-protocol results.",
  "NCT01234567 enrolled 120 adults with constipation-predominant IBS.",
  "NCT01234567 (2019) enrolled adults; NCT02345678 (120 adults, 12 weeks) has not reported.",
];

/**
 * Research sentences citing other trial registries' numbers in their published shapes: the dossier's screen passes
 * each; the card's sets them aside no more than before (its texts are public), so there they read as numbers.
 */
export const REGISTRY_NUMBER_SENTENCES = [
  // The first real dossier's open lead, in the same shape.
  "Check whether the registered trial ACTRN12620000032954 has posted results.",
  "ISRCTN12345678, a UK trial, compared psyllium with placebo.",
  "ChiCTR2000029853 and ChiCTR-IOR-17013456 are still recruiting.",
  // ChatGPT often writes a non-breaking hyphen (U+2011) inside identifiers, and a spaced em dash after them.
  "ChiCTR‑IOR‑17013456 is still recruiting.",
  "ACTRN12620000032954 — 120 adults with IBS — has not reported.",
  "A German trial (DRKS00012345) is under way.",
  "EudraCT 2010-012345-12 was stopped early for slow recruitment.",
  "EudraCT number: 2004-001234-56 lists a 6-week run-in.",
  "EU CT 2023-501234-12-00 uses psyllium as its comparator.",
  "CTRI/2020/05/025123 enrolled adults in India.",
  "jRCT1031190154 and jRCTs031180033 report no results yet.",
  "UMIN000012345 tested a lower dose of partially hydrolysed guar gum.",
  "IRCT20170926036460N1 compared two doses of the blend.",
  "PACTR201905538823434 is recruiting in Nigeria.",
  "KCT0001234 and TCTR20200123001 were registered after enrolment began.",
  "RBR-7x9k2c and NTR1234 are listed without results.",
  "Two registered trials, NCT01234567 and ACTRN12620000032954, have not reported; see also PMID 31234567.",
];

/**
 * Phone numbers, with or without + and separators, alone, beside a registry number, or given a registry's or PubMed's
 * prefix with another count of digits, however the rest is cut off; emails and street addresses beside identifiers.
 * Both screens refuse each.
 */
export const PHONE_NUMBERS_AND_CONTACTS_AMONG_IDENTIFIERS = [
  "Call +61 412 345 678 about the trial.",
  "Ring 0412345678 for the results.",
  "+33612345678 is the coordinator's line.",
  "Call (02) 9876 5432 after six.",
  "Call 555-123-4567 first.",
  "Their number is 01.23.45.67.89.",
  "ACTRN12620000032954, or call 0412 345 678.",
  "Call 0412 345 678 about ACTRN12620000032954.",
  "NCT01234567 0412345678",
  "See PMID 31234567, then phone +44 20 7946 0958.",
  "ACTRN126200000329540412345678",
  "ACTRN0412345678",
  "NCT0412345678",
  "ISRCTN0412345678",
  "UMIN0412345678",
  "PMID 0412345678",
  "PMID 412 345 678",
  "PMC412-345-678",
  "EudraCT 0412-345678",
  // Codex's red team (16 Nov 2026): a phone number cut where a registry's or PubMed's count of digits ends, and one
  // written onto a DOI after a comma, ";" or "=".
  "Call UMIN 020794609 58.",
  "Call UMIN 020794609  58.",
  "Call UMIN 020794609 (58).",
  "Call UMIN 020794609‑58.",
  "Call NCT02079460 (958).",
  "Call PMID 2025550  199.",
  "PMID: 2025550 (199)",
  "Call jRCT0207946095-8.",
  "Call TCTR02079460958-123.",
  "EudraCT 2010-012345-12-3456 is the contact number.",
  "Trial: 10.1234/results,02079460958",
  "Read 10.1234/results;tel=02079460958.",
  "See 10.1234/trial;02079460958.",
  "Write to trials@example.org about NCT01234567.",
  "See 10.1234/protocol@example.org for the protocol.",
  "The clinic at 221 Baker Street ran ACTRN12620000032954.",
  "Its postal code 02139 is next to PMID 31234567.",
];
