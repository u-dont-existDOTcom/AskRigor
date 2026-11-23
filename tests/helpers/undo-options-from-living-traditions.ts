import { createHash } from "node:crypto";

/** Rewind owner answer 410b only, preserving the exact HRP 20.6.45 historical baseline. */
export function undoOptionsFromLivingTraditions(text: string): string {
  if (!text.includes('<Protocol name="HRP" version="20.6.46" revisionDate="2026-11-22"')) return text;
  const removeOnce = (expression: RegExp): void => {
    if ([...text.matchAll(new RegExp(expression.source, "gu"))].length !== 1)
      throw new Error("OPTIONS_FROM_LIVING_TRADITIONS_ELEMENT_MISSING");
    text = text.replace(expression, "");
  };
  removeOnce(/  <Revision version="20\.6\.46" priority="Critical">[\s\S]*?<\/Revision>\n/u);
  removeOnce(/  <Rule name="OptionsFromLivingTraditions" priority="Critical">[\s\S]*?<\/Rule>\n/u);
  for (const id of OPTIONS_FROM_LIVING_TRADITIONS_CASE_IDS)
    removeOnce(new RegExp(`  <Case id="${id}">[\\s\\S]*?<\\/Case>\n\n`, "u"));
  for (const [current, previous] of [
    [`  <Purpose>
   Load for traditional, regional or folk medicine, named or not, and open options for health problems or
   goals. Retrieve traditions' own accounts and differences; check empirical claims against current evidence.
  </Purpose>`, `  <Purpose>
   Load for traditional, regional or folk medical concepts, claims, remedies, diagnoses, practices and safety, named
   or not. Find the traditions' own accounts and relevant differences; check empirical health claims against current
   evidence.
  </Purpose>`],
    [`  <Purpose>
   Load for treatment choices, alternatives, comparisons and first-pass study searches. Inventory relevant
   classes before selection; for video research, also enforce selection breadth and per-video depth. This
   gate governs selection-space adequacy; CommunityCorpusCompletionGate separately governs acquisition depth
   for each selected discussion pool.
  </Purpose>`, `  <Purpose>
   Prevent deep auditing of a narrow or redundant video set from being presented as broad treatment coverage. This gate
   governs selection-space adequacy; CommunityCorpusCompletionGate separately governs acquisition depth for each selected
   discussion pool.
  </Purpose>`],
    [`   lifestyle programs; nutritional and self-directed approaches; heterodox or adjunct approaches; traditional,
   regional or folk options (TraditionalSystemAccount/OptionsFromLivingTraditions); procedures and surgery;`, `   lifestyle programs; nutritional and self-directed approaches; heterodox or adjunct approaches; procedures and surgery;`],
    [`<Protocol name="HRP" version="20.6.46" revisionDate="2026-11-22"`, `<Protocol name="HRP" version="20.6.45" revisionDate="2026-11-22"`],
  ]) {
    if (text.split(current!).length !== 2) throw new Error("OPTIONS_FROM_LIVING_TRADITIONS_TEXT_MISSING");
    text = text.replace(current!, previous!);
  }
  if (createHash("sha256").update(text).digest("hex") !==
      "475ee5aad42fdc0bba03f786eefa4e19bc17cd9b95f4ddd7e4aef3a600c54039")
    throw new Error("OPTIONS_FROM_LIVING_TRADITIONS_REWIND_SHA_MISMATCH");
  return text;
}

export const OPTIONS_FROM_LIVING_TRADITIONS_CASE_IDS = [
  "OpenHealthOptionsWithoutNamedTradition",
  "OpenHealthOptionsInAnotherLanguage",
  "OpenHealthOptionsForAnotherPerson",
  "OpenOptionsForAHealthGoal",
  "NamedTreatmentRequestIsNotWidened",
  "LookupDoesNotBecomeAnOptionsSearch",
  "OpenOptionsWithExplicitSourceLimit",
  "EmergencyDoesNotAddTraditionalOptionsSearch",
  "OpenOptionsWithStatedTradition",
  "TraditionalOptionWithHarmEvidence",
  "TreatmentChoiceWithoutVideoResearch"
] as const;
