import { createHash } from "node:crypto";

/**
 * Rewind HRP 20.6.44 (owner answer 400a: LimitsNote's sentence on a model's or app's safety rules limiting a research
 * step, promise P69) to 20.6.43, before older exact protocol fixtures are compared.
 */
export function undoSafetyLimitsDisclosure(text: string): string {
  if (!text.includes('version="20.6.44" revisionDate="2026-11-22"')) return text;
  if (text.split(SAFETY_SENTENCES).length !== 2) throw new Error("SAFETY_LIMITS_RULE_TEXT_MISSING");
  text = text.replace(SAFETY_SENTENCES, PREVIOUS_LINE);
  const revision = /  <Revision version="20\.6\.44" priority="Critical">[\s\S]*?<\/Revision>\n/u;
  if ((text.match(revision) ?? []).length !== 1) throw new Error("SAFETY_LIMITS_REVISION_MISSING");
  text = text.replace(revision, "");
  text = text.replace('version="20.6.44" revisionDate="2026-11-22"', 'version="20.6.43" revisionDate="2026-11-16"');
  if (createHash("sha256").update(text).digest("hex") !==
      "99f40aa2715dd60d16f49f435d5c14c027d02f985cf38aa4c1b6e41dae401f66")
    throw new Error("SAFETY_LIMITS_REWIND_SHA_MISMATCH");
  return text;
}

const SAFETY_SENTENCES = "   answer only after a passing check. When a model's or app's safety rules, as you observed them or the person\n" +
  "   reported them, limited a research step or what the answer can say, name the step and who observed it, and say what\n" +
  "   it could change. Say so when a safety stop switched the model, even with no known loss, and whether the content was\n" +
  "   not examined or examined but not reported. Don't guess at limits you didn't see, or claim there were none. Describe\n" +
  "   the gap only in general terms: no withheld details, no directions to them and no prompts to get around the rule,\n" +
  "   under IncompleteModuleContinuationHandoff too. Declare each to finalize_research as safety_limits when that input is\n" +
  "   available. For a community corpus behind an access\n";
const PREVIOUS_LINE = "   answer only after a passing check. For a community corpus behind an access\n";
