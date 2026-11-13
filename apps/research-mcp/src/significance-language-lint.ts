/**
 * Advisory significance-language lint.
 *
 * Mechanical detection may identify unsafe inferences, but it cannot infer whether
 * "significant" means statistical evidence, clinical importance or ordinary
 * English "substantial". That judgment belongs to the answer's author or the
 * optional semantic reviewer. No findings from this file block finalization.
 */
export interface SignificanceMention {
  number: number;
  word: string;
  context: string;
}

const WORD = /\b(?:non[-\s]?significant|insignificant|significantly|significance|significant)\b/giu;
const ORDINARY = /\b(?:concerns?|obstacles?|milestones?|achievements?|responsibilit(?:y|ies)|burdens?|expenses?|costs?|contributions?|importance|roles?|challenges?|consequences?|investments?|efforts?)\b/iu;
const RESEARCH = /\b(?:stud(?:y|ies)|trials?|patients?|groups?|controls?|treated|treatment|results?|data|survival|mortality|association|correlation|responses?|rates?|risks?|confidence interval|p[-\s]?value)\b|p\s*[<=>]/iu;
const OUTCOME = /\b(?:differences?|effects?|benefits?|improvements?|increases?|decreases?|reductions?|associations?|correlations?|risks?|survival|mortality|responses?)\b/iu;
const AMOUNT = /(?:\b\d+(?:\.\d+)?\s*(?:%|percentage points?|points?|patients?|deaths?|survivors?|times?|mmHg|mL|days?|hours?)|(?:\b\d+\s*\/\s*\d+\b)|\bconfidence interval\b|\b(?:CI|OR|RR|HR)\s*[:=]?\s*\d|p\s*[<=>]\s*0?\.\d+)/iu;

function maskUrlsAndCode(answer: string): string {
  return answer.replace(/https?:\/\/[^\s)]+|\x60[^\x60]*\x60/gu, (match) => " ".repeat(match.length));
}

function excerpt(answer: string, start: number, end: number): string {
  const paragraphStart = Math.max(0, answer.lastIndexOf("\n", start) + 1);
  const paragraphEnd = answer.indexOf("\n", end);
  const from = Math.max(paragraphStart, start - 120);
  const to = Math.min(paragraphEnd < 0 ? answer.length : paragraphEnd, end + 135);
  return answer.slice(from, to).replace(/\s+/gu, " ").trim();
}

/** Number each relevant word; listing it does not imply the word is wrong. */
export function significanceMentions(answer: string): SignificanceMention[] {
  const visible = maskUrlsAndCode(answer);
  return [...visible.matchAll(WORD)].slice(0, 24).map((match, index) => ({
    number: index + 1,
    word: match[0]!,
    context: excerpt(answer, match.index, match.index + match[0]!.length),
  }));
}

/** High-precision advisory checks, with no automatic meaning or clinical verdict. */
export function significanceLanguageNotes(answer: string): string[] {
  const notes: string[] = [];
  for (const mention of significanceMentions(answer)) {
    const context = mention.context;
    const falseNull = /(?:not|no|non[- ]?)\s+(?:statistically\s+)?significant\b.{0,115}\b(?:so|therefore|thus|meaning|proves?|demonstrates?)\b.{0,90}\b(?:no\s+(?:difference|effect|benefit)|equivalen[ct]|identical|the\s+same|equal)\b/iu.test(context);
    if (falseNull) {
      notes.push("Significance-language lint: " + JSON.stringify(context) +
        " treats a nonsignificant result as proof of no effect or equivalence. Report the observed difference and its uncertainty.");
    } else {
      const crossThreshold = /\b(?:significant|significance)\b.{0,100}\b(?:not|non[- ]?)\s+(?:statistically\s+)?significant\b.{0,95}\b(?:so|therefore|thus|proves?|means?|shows?)\b.{0,55}\b(?:differ|different|interaction)\b/iu.test(context);
      if (crossThreshold) {
        notes.push("Significance-language lint: " + JSON.stringify(context) +
          " infers different effects from different significance labels. A direct contrast with uncertainty is needed.");
      } else {
        const qualified = /\b(?:statistically|clinical(?:ly)?|practical(?:ly)?|substantive(?:ly)?)\s+(?:non[-\s]?)?significan/iu.test(context) ||
          /\b(?:in ordinary English|in everyday (?:English|language)|not a claim about a p[- ]?value)\b/iu.test(context);
        if (!qualified && RESEARCH.test(context) && OUTCOME.test(context) && !ORDINARY.test(context) && !AMOUNT.test(context)) {
          notes.push("Significance-language lint (review, not error): " + JSON.stringify(context) +
            " calls a scientific result significant without identifying whether this means a statistical test or ordinary-language importance. Clarify its meaning and magnitude where possible.");
        }
      }
    }
    if (notes.length >= 3) break;
  }
  return [...new Set(notes)];
}
