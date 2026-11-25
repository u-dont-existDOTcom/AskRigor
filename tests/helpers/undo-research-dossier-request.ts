import { createHash } from "node:crypto";

import { undoSafetyLimitsDisclosure } from "./undo-safety-limits-disclosure.js";

/**
 * Rewind HRP 20.6.43 (AskRigor#477 stage 1: the private research dossier in DeepResearchTimeSavingAtlasPreservation,
 * in the wording Codex's red team corrected) to 20.6.42, before older exact protocol fixtures are compared.
 */
export function undoResearchDossierRequestPolicy(text: string): string {
  // HRP 20.6.44 (owner answer 400a) came after it, so it is rewound first.
  text = undoSafetyLimitsDisclosure(text);
  if (!text.includes('version="20.6.43" revisionDate="2026-11-16"')) return text;
  for (const [after, before] of [[DOSSIER_SENTENCES, ""], [DOSSIER_REST, PREVIOUS_REST]] as const) {
    if (text.split(after).length !== 2) throw new Error("RESEARCH_DOSSIER_RULE_TEXT_MISSING");
    text = text.replace(after, before);
  }
  const revision = /  <Revision version="20\.6\.43" priority="Critical">[\s\S]*?<\/Revision>\n/u;
  if ((text.match(revision) ?? []).length !== 1) throw new Error("RESEARCH_DOSSIER_REVISION_MISSING");
  text = text.replace(revision, "");
  text = text.replace('version="20.6.43" revisionDate="2026-11-16"', 'version="20.6.42" revisionDate="2026-11-16"');
  if (createHash("sha256").update(text).digest("hex") !==
      "bef2125fc273d2c67c02ba0197739bce60b3134d5d59e25aca413cb943932b46")
    throw new Error("RESEARCH_DOSSIER_REWIND_SHA_MISMATCH");
  return text;
}

const DOSSIER_SENTENCES = "   Separately, when AskRigor requests a private research dossier and saving remains allowed, include it with the first\n" +
  "   final check if the completed work saves a later reader substantial effort, whether or not a card qualifies. Saving\n" +
  "   this dossier does not publish it.\n";
const DOSSIER_REST = "   content. A limited five-finding card is not the entire research record: where AskRigor asks for a research dossier,\n" +
  "   the dossier holds the rest; otherwise, or for what its shape cannot hold, mark the dossier partial and file an\n" +
  "   actionable continuation until an authorized repository can store it.\n";
const PREVIOUS_REST = "   content. A limited five-finding card is not the entire research record: if the available schema cannot preserve the\n" +
  "   rest, mark the dossier partial and file an actionable continuation until an authorized repository can store it.\n";
