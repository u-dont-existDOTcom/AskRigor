import { FINDINGS_PRIVACY_PROBLEMS, holdsYouTubeReference, screenFindingsText } from "./card.js";
import { withoutResearchIdentifierDigits } from "./research-identifiers.js";
import type { PrivacyScreenReasonCode } from "../lessons/privacy-screen.js";

/**
 * The research dossier's privacy screen (AskRigor#477 stage 1; Codex's reviews of 16 Nov 2026, finding 2 and the second
 * pass). Notice v6 covers a dossier written in general terms, never the person: their own words or circumstances, their
 * relatives, their contacts, where they live or who they are. A dossier is stored before anyone reads it, so this
 * screen refuses the whole dossier, naming the field, whenever a text looks personal; when in doubt it refuses. It
 * reads every text in English, French, Spanish, German, Portuguese and Italian (with a few words of Dutch and Polish)
 * after folding look-alike forms (full-width and other compatibility letters, invisible characters, Cyrillic and Greek
 * letters shaped like Latin ones, text in capitals), refuses words in scripts it cannot read and words that mix scripts,
 * and keeps the findings card's own screen (contacts, identifiers, English health narratives) and its YouTube check.
 * Ordinary research phrasing passes: an author before "et al." or "and colleagues", numerals such as phase I or I², and
 * patients' relatives in a study's report, and so do public research identifiers in their exact published shapes (a
 * DOI, "PMID" and its number, a PMCID, a trial registry number with its prefix: research-identifiers.ts), whose digits
 * the contact rules do not read as a phone number (the first real dossier, 16 Nov 2026, was refused for good over
 * ACTRN12620000032954); their words are read as every word is. What it cannot see (a narrative with none of these
 * markers, another Latin-script language) the owner's review still has to catch; the tests hold it to a list of
 * realistic leaks and of research sentences that must pass. No model reads it: the owner has not decided on a model
 * call here.
 *
 * Returns the rule a text breaks, or undefined.
 */
export function dossierPrivacyRule(text: string): DossierPrivacyRule | undefined {
  const value = folded(text);
  // Look-alike letters read as the Latin ones they imitate, for every word rule (Codex's final check: a Greek Α in a
  // name, a Cyrillic І for "I").
  const plain = lookAlikeFree(value);
  // The contact rules read the text with each research identifier's digits left out, as the card's own screen sets the
  // identifiers aside; a phone number beside one, or after a registry's prefix with another count of digits, stays.
  const numbers = withoutResearchIdentifierDigits(value);
  return screenFindingsText(value) ?? (holdsYouTubeReference(value) || /youtu\.?be/iu.test(value) ? "youtube_reference"
    : CONTACT.some((pattern) => pattern.test(numbers)) ? "contact_details"
    : UNSCREENED_SCRIPT.test(value) ? "unscreened_script"
    : mixesScripts(value) ? "mixed_script"
    : identityRule(plain) ?? lexicalRule(plain));
}

/** The rules the dossier's privacy screen refuses a text by: the findings card's screen's, then its own. */
export type DossierPrivacyRule = PrivacyScreenReasonCode | "youtube_reference" | "contact_details" | "unscreened_script" |
  "mixed_script" | "date_of_birth" | "location_detail" | "personal_name" | "first_person" | "personal_relation";

/** What each of those rules saw, for the dossier's problems (dossier.ts), in the card problems' words where they share one. */
export const DOSSIER_PRIVACY_PROBLEMS: Readonly<Record<DossierPrivacyRule, string>> = {
  ...Object.fromEntries(Object.entries(FINDINGS_PRIVACY_PROBLEMS).filter(([rule]) => rule !== "not_a_source_identifier")) as
    Record<PrivacyScreenReasonCode, string>,
  youtube_reference: "a YouTube link or name",
  contact_details: "a link, a handle, an email address, a phone number, a street address or a postal code",
  unscreened_script: "words in a script the screen cannot read (it reads Latin and Greek letters)",
  mixed_script: "a word mixing Latin letters with another script's",
  date_of_birth: "a date of birth",
  location_detail: "where someone lives",
  personal_name: "a particular person's name",
  first_person: "a person's own voice (I, my, or we did something with a treatment)",
  personal_relation: "a particular person's relative, carer or home",
};

// Characters that show nothing (zero-width spaces and joiners, direction marks, the soft hyphen) are dropped, and every
// compatibility form (full-width Ｍｙ, ligatures, ² as 2) becomes its plain letter.
const INVISIBLE = /[­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ]/gu;
const folded = (text: string) => text.replace(INVISIBLE, "").normalize("NFKC").replace(INVISIBLE, "");

// Links, handles, e-mail, phone numbers (nine digits or more), street addresses and postal codes; read without the
// digits of research identifiers in their published shapes.
const CONTACT: readonly RegExp[] = [
  /https?:\/\/|www\.|\b[\w.+-]+@[\w-]+\.\w/iu,
  /(?:^|[\s(])@[\p{L}\p{N}_.]{2,}/u,
  /(?:^|[^\p{L}])u\/[\p{L}\p{N}_-]{3,}/u,
  /\+?\d(?:[\s().-]*\d){8,}/u,
  /\b\d{1,5}[a-z]?,?\s+(?:rue|avenue|av\.?|boulevard|bd|street|st\.?|road|rd\.?|lane|drive|calle|avenida|straße|strasse|rua|via|piazza|allée|chemin|place)\b/iu,
  /\b(?:post ?code|zip ?code|postal code|code postal|código postal|postleitzahl)\b/iu,
  /\b[A-Z]{2} \d{5}(?:-\d{4})?\b/u,
];

// Three letters in a row from a script other than Latin and Greek: a language this screen cannot read (single Greek
// letters, as in TNF-α or Aβ, are research symbols and pass; three Greek letters in a row are Greek, which it cannot
// read either).
const UNSCREENED_SCRIPT = /(?:(?![\p{Script=Latin}])\p{L}){3,}/u;

// A word that mixes Latin letters with another script's, Greek's research symbols apart: a way to hide a word from the
// lists below (a Cyrillic М in "Мy").
function mixesScripts(text: string): boolean {
  for (const word of text.match(/[\p{L}\p{M}]+/gu) ?? []) {
    if (/\p{Script=Latin}/u.test(word) && /(?![\p{Script=Latin}\p{Script=Greek}])\p{L}/u.test(word)) return true;
  }
  return false;
}

// Greek and Cyrillic letters shaped like Latin ones, read as those for the word lists only.
const LOOK_ALIKE: Readonly<Record<string, string>> = {
  "\u0391": "A", "\u0392": "B", "\u0395": "E", "\u0396": "Z", "\u0397": "H", "\u0399": "I", "\u039a": "K",
  "\u039c": "M", "\u039d": "N", "\u039f": "O", "\u03a1": "P", "\u03a4": "T", "\u03a5": "Y", "\u03a7": "X",
  "\u03bf": "o", "\u03b9": "i", "\u03bd": "v", "\u03f2": "c", "\u03f3": "j", "\u03f9": "C",
  "\u0410": "A", "\u0412": "B", "\u0415": "E", "\u041a": "K", "\u041c": "M", "\u041d": "H", "\u041e": "O",
  "\u0420": "P", "\u0421": "C", "\u0422": "T", "\u0425": "X", "\u0423": "Y", "\u0406": "I", "\u0408": "J",
  "\u0405": "S", "\u04c0": "I", "\u04cf": "l", "\u0430": "a", "\u0435": "e", "\u043e": "o", "\u0440": "p",
  "\u0441": "c", "\u0443": "y", "\u0445": "x", "\u0456": "i", "\u0458": "j", "\u0455": "s", "\u04bb": "h",
  "\u0501": "d",
  // Latin letters shaped like others: dotless i, small capital I, script g, Latin alpha.
  "\u0131": "i", "\u026a": "I", "\u0261": "g", "\u0251": "a",
};
const lookAlikeFree = (text: string) =>
  text.replace(/[\u0131\u0251\u0261\u026a\u0370-\u03ff\u0400-\u04ff\u0500-\u052f]/gu, (letter) => LOOK_ALIKE[letter] ?? letter);

// Who the person is: a date of birth, where someone lives, a first name about a particular person.
const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|" +
  "nov(?:ember)?|dec(?:ember)?|janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|" +
  "décembre|decembre|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|" +
  "januar|februar|märz|maerz|juni|juli|oktober|dezember|janeiro|fevereiro|março|marco|maio|junho|julho|setembro|outubro|" +
  "novembro|dezembro|gennaio|febbraio|aprile|maggio|giugno|luglio|settembre|ottobre|dicembre)";
// Letters and digits are a word's; \b reads only ASCII ones, so "né" needs these.
const START = "(?<![\\p{L}\\p{N}])";
const END = "(?![\\p{L}\\p{N}])";
const BORN = `${START}(?:born|née?|nacid[oa]|naci[óo]|geboren|nascid[oa]|nasceu|nat[oa])${END}`;
// A date of birth: born on a day of a month of a year, in any of the six languages; a year alone ("children born in
// 2004") and a group's dates ("women born on 1 May 1950 or later") are a study's, not a person's.
const BORN_ON: readonly RegExp[] = [
  new RegExp(`${BORN}[^.;\\n]{0,24}?${START}\\d{1,2}(?:st|nd|rd|th|er|º|°)?\\.?\\s*(?:de\\s+)?${MONTH}\\.?,?\\s*(?:de\\s+)?\\d{4}`, "giu"),
  new RegExp(`${BORN}[^.;\\n]{0,24}?${START}${MONTH}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}`, "giu"),
  new RegExp(`${BORN}[^.;\\n]{0,24}?${START}\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}${END}`, "giu"),
];
// A date of birth given as a value ("Date of birth: 1984-04-12", "DOB 12/04/1984"): the field's name alone ("date of
// birth was recorded as a covariate") is a study's (Codex's final check).
const DATE_VALUE = `(?:\\d{4}[/.-]\\d{1,2}[/.-]\\d{1,2}|\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}|` +
  `\\d{1,2}(?:st|nd|rd|th|er|º|°)?\\.?\\s*(?:de\\s+)?${MONTH}\\.?,?\\s*(?:de\\s+)?\\d{4}|` +
  `${MONTH}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4})`;
const BIRTH_DATE = new RegExp(`${START}(?:date of birth|birth ?date|d\\.?o\\.?b\\.?|date de naissance|` +
  `fecha de nacimiento|geburtsdatum|data de nascimento|data di nascita)${END}[^.;\\n]{0,16}?${START}${DATE_VALUE}`, "iu");
// Someone living somewhere named: "lives in Paris", "habite à Nantes"; "people living in rural areas" passes.
const RESIDES = new RegExp("(?<![\\p{L}\\p{N}])(?:" + ["lives", "resides", "grew up", "has lived", "is living", "was living",
  "habite", "réside", "reside", "vit", "vive", "wohnt", "lebt", "mora", "abita"]
  .map((verb) => `[${verb[0]}${verb[0]!.toUpperCase()}]${verb.slice(1)}`).join("|") +
  ")\\s+(?:in|at|near|à|au|aux|en|em|no|na|a|in der|im|bei)\\s+\\p{Lu}", "u");

// First names that are not also a common word, a month, a place or a test's name. One names a particular person when
// a surname follows it (not an eponym's disease or scale), or an age, or a verb of what someone does.
const FIRST_NAMES: ReadonlySet<string> = new Set([
  "alice", "amanda", "amy", "andrew", "angela", "anna", "anne", "anthony", "ashley", "barbara", "benjamin", "betty",
  "brian", "carol", "caroline", "catherine", "chloe", "christopher", "claire", "daniel", "david", "deborah", "diana",
  "donald", "donna", "dorothy", "edward", "elizabeth", "emily", "emma", "eric", "george", "hannah", "harry", "helen",
  "isabella", "james", "jane", "janet", "jennifer", "jessica", "john", "joseph", "joshua", "julia", "karen", "kate",
  "katherine", "kevin", "laura", "linda", "lisa", "lucy", "margaret", "maria", "mary", "matthew", "megan", "michael",
  "michelle", "nancy", "nicholas", "olivia", "patricia", "peter", "rachel", "rebecca", "richard", "robert", "ryan",
  "sandra", "sarah", "sophie", "stephanie", "steven", "susan", "thomas", "timothy", "william", "zoe", "amélie",
  "antoine", "camille", "chloé", "élodie", "émilie", "françoise", "françois", "isabelle", "jacques", "julien",
  "léa", "manon", "marie", "mathilde", "nathalie", "nicolas", "philippe", "pierre", "sylvie", "valérie", "alejandro",
  "carlos", "carmen", "diego", "elena", "javier", "jorge", "josé", "juan", "lucía", "luis", "manuel",
  "maría", "marta", "miguel", "pablo", "pedro", "sofía", "andreas", "anja", "claudia", "jürgen", "katrin", "klaus",
  "markus", "monika", "petra", "sabine", "stefan", "ursula", "wolfgang", "antónio", "beatriz", "fernanda", "joão",
  "joana", "luiza", "mariana", "paulo", "rodrigo", "alessandro", "chiara", "francesca", "francesco", "giorgia",
  "giovanni", "giulia", "giuseppe", "luca", "matteo", "paola", "roberto", "simone",
]);
const EPONYM_WORDS: ReadonlySet<string> = new Set([
  "syndrome", "disease", "disorder", "test", "score", "scale", "sign", "hospital", "institute", "clinic", "university",
  "foundation", "center", "centre", "method", "criteria", "index", "classification", "model", "trial", "study",
  "questionnaire", "inventory", "procedure", "operation", "maneuver", "manoeuvre", "reflex", "phenomenon", "effect",
  "virus", "sequence", "research", "cancer", "medical", "health", "school", "college", "network", "registry",
]);
const PERSON_VERBS: ReadonlySet<string> = new Set([
  "takes", "took", "has", "had", "is", "was", "lives", "lived", "uses", "used", "says", "said", "reports", "reported",
  "tried", "tries", "started", "stopped", "feels", "felt", "noticed", "developed", "suffers", "suffered", "gets", "got",
  "prend", "a", "est", "toma", "tomó", "tiene", "es", "nimmt", "hat", "ist", "toma", "tem", "é", "prende", "ha", "è",
]);

type Word = { text: string; lower: string; start: number; end: number; sentenceStart: boolean };

function wordsOf(text: string): Word[] {
  const words: Word[] = [];
  for (const match of text.matchAll(/[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*['’]?/gu)) {
    const start = match.index!;
    const before = text.slice(0, start).replace(/[\s"'“”‘’«»(\[]+$/u, "");
    words.push({ text: match[0], lower: match[0].toLowerCase(), start, end: start + match[0].length,
      sentenceStart: before === "" || /[.!?:;\n]$/u.test(before) });
  }
  return words;
}

// An author named before "et al." or "and colleagues" (in any of the six languages): a name, not a person's story.
function authorAt(words: readonly Word[], index: number): boolean {
  const next = words.slice(index + 1, index + 4).map(({ lower }) => lower.replace(/[.,]$/u, ""));
  return next[0] === "et" && (next[1] === "al" || next[1] === "coll") ||
    (["and", "y", "e", "und", "et"].includes(next[0] ?? "") &&
      /^(?:colleagues|coworkers|co-workers|colaboradores|collaborateurs|kollegen|colleghi|coautores|coauthors)$/u.test(next[1] ?? ""));
}

function identityRule(text: string): "date_of_birth" | "location_detail" | "personal_name" | undefined {
  if (BIRTH_DATE.test(text)) return "date_of_birth";
  for (const pattern of BORN_ON) {
    for (const match of text.matchAll(pattern)) {
      if (!GROUPS.test(text.slice(Math.max(0, match.index! - 40), match.index!))) return "date_of_birth";
    }
  }
  if (RESIDES.test(text)) return "location_detail";
  // A text in capitals is read with each word capitalized, as names are written (Codex's final check: "ALICE SMITH
  // TAKES ASPIRIN DAILY"); in a text that is not, a first name in capitals counts before a surname in capitals.
  const named = shouted(text) ? text.replace(/\p{L}+/gu, (word) => word[0]! + word.slice(1).toLowerCase()) : text;
  const words = wordsOf(named);
  for (const [index, word] of words.entries()) {
    if (!FIRST_NAMES.has(word.lower) || word.text[0] !== word.text[0]!.toUpperCase() || authorAt(words, index)) continue;
    const next = words[index + 1];
    const between = next === undefined ? "" : named.slice(word.end, next.start);
    const adjacent = next !== undefined && /^\s+$/u.test(between);
    if (isCapitals(word.text)) {
      if (adjacent && isCapitals(next!.text) && !EPONYM_WORDS.has(next!.lower)) return "personal_name";
      continue;
    }
    const surname = adjacent && /^\p{Lu}\p{Ll}/u.test(next!.text) && !EPONYM_WORDS.has(next!.lower) &&
      !authorAt(words, index + 1) && !EPONYM_WORDS.has(words[index + 2]?.lower ?? "");
    const aged = /^\s*,\s*\d{1,3}\b/u.test(named.slice(word.end));
    const acting = adjacent && PERSON_VERBS.has(next!.lower);
    if (surname || aged || acting) return "personal_name";
  }
  return undefined;
}

// A text mostly in capitals: there, capitals are no abbreviation.
function shouted(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  return letters.length >= 8 && letters.filter((letter) => letter !== letter.toLowerCase()).length / letters.length > 0.7;
}

// The person's own voice: first-person singular pronouns and possessives. Matched in lower case or capitalized; in
// capitals only as a possessive before a relative ("MY husband"), since ME/CFS, MI, EU, IO and MY are abbreviations,
// unless the whole text is in capitals. Words other languages use otherwise are left out: "ma" (Italian "but") and
// "mes" (Spanish "month"), which count only before a relative or a place, below, and "eu" (French "had").
const FIRST_PERSON: ReadonlySet<string> = new Set([
  "me", "my", "myself", "je", "moi", "mon", "yo", "mi", "mis", "conmigo", "ich", "mich", "mir", "mein", "meine",
  "meinen", "meinem", "meiner", "meines", "meu", "minha", "meus", "minhas", "comigo", "io", "mio", "mia", "miei",
  "mie", "ik", "mij", "mijn", "mój", "moja", "moje", "mnie",
]);
// We: the researchers' own voice ("we found no difference") passes; we before what a household does with a treatment
// ("we tried it for a month"), within the five words after it, is a person's story (Codex's final check).
const WE: ReadonlySet<string> = new Set(["we", "nous", "nosotros", "nosotras", "wir", "nós", "noi"]);
const HOUSEHOLD_VERBS: ReadonlySet<string> = new Set([
  "tried", "try", "trying", "take", "took", "taking", "gave", "give", "giving", "started", "start", "stopped", "stop",
  "quit", "noticed", "felt", "feel", "went", "live", "lived", "moved", "bought", "buy", "ordered", "switched", "visited",
  "got", "get", "worried", "struggled", "suffer", "suffered", "essayé", "pris", "arrêté", "commencé", "donné",
  "remarqué", "acheté", "vivons", "habitons", "prenons", "donnons", "essayons", "probamos", "tomamos", "dejamos",
  "empezamos", "intentamos", "compramos", "vivimos", "versucht", "genommen", "abgesetzt", "gegeben", "gekauft",
  "nehmen", "gaben", "probiert", "wohnen", "leben", "tentamos", "paramos", "começamos", "moramos", "vivemos", "provato",
  "preso", "smesso", "iniziato", "comprato", "viviamo", "abitiamo", "prendiamo",
]);
// "1" for "I" ("1 have lupus"), before verbs a count of people would not take there ("1 was lost to follow-up" passes).
const ONE_FOR_I = new RegExp(`(?:^|[.!?]\\s+|["“(]\\s*)1\\s+(?:have|am|take|took|feel|felt|started|stopped|tried|` +
  `suffer|suffered|noticed|swallow|swallowed|live|think|need)(?![\\p{L}\\p{N}])`, "iu");
// Italian's plural article before a possessive or a number: i loro figli, i due gruppi.
const ITALIAN_ARTICLE_BEFORE: ReadonlySet<string> = new Set([
  "loro", "suoi", "nostri", "vostri", "tuoi", "due", "tre", "quattro", "cinque", "sei", "sette", "otto", "nove", "dieci",
]);
// After a letter standing for "I" (l): the verbs of a personal account, so "2 l per day" passes.
const PRONOUN_VERBS: ReadonlySet<string> = new Set([
  "am", "was", "have", "had", "take", "took", "use", "used", "tried", "try", "started", "start", "stopped", "stop", "feel",
  "felt", "got", "get", "noticed", "notice", "experienced", "suffer", "suffered", "live", "lived", "went", "go", "need",
  "needed", "think", "believe", "know", "would", "will", "can", "could", "do", "did", "also", "still", "just", "never",
  "always", "really", "began", "quit", "switched", "developed", "became", "swallow", "swallowed",
]);
const FIRST_PERSON_CONTRACTIONS = /^(?:i['’](?:m|ve|d|ll)|j['’]\p{L}|m['’]\p{L})/u;
// Spanish, Portuguese and Italian drop the pronoun, so their commonest first-person verbs of a health story count too
// (none that is also a French or Italian participle, such as "noté" or "presi"), in lower case or at a sentence's
// start; capitalized inside a sentence such a word is a name (Ho, Moro).
const FIRST_PERSON_VERBS: ReadonlySet<string> = new Set([
  "tengo", "tuve", "tomo", "tomé", "sufro", "sufrí", "padezco", "siento", "sentí", "empecé", "dejé", "estoy",
  "estuve", "probé", "llevo", "tenho", "tive", "tomei", "sofro", "sofri", "sinto", "senti", "notei", "comecei",
  "parei", "estou", "estive", "experimentei", "moro", "prendo", "soffro", "sento", "sentivo", "ho", "avevo",
  "sto", "stavo", "abito",
]);
// English "I" is a pronoun unless it is a numeral (phase I, type I and II, I-III, I/II), the I² of heterogeneity (I2
// once folded), iodine (I-131) or an initial after a surname.
const I_NUMERAL_BEFORE: ReadonlySet<string> = new Set([
  "phase", "phases", "type", "types", "stage", "stages", "grade", "grades", "class", "classes", "level", "levels",
  "tier", "category", "group", "groups", "arm", "part", "wave", "cohort", "schedule", "section", "table", "figure",
  "chapter", "appendix", "round", "period", "step", "factor", "complex", "degree", "war", "collagen", "trial", "trials",
  "study", "studies", "experiment", "experiments", "sample", "samples", "series", "volume", "vol", "book", "case",
  "cases", "fig", "lesion", "lesions", "hypersensitivity", "error", "errors", "photosystem", "interferon", "inhibitor",
]);
const ROMAN = /^(?:i{1,3}|iv|v|vi{1,3}|ix|x)$/u;
const CLAUSE_STARTS: ReadonlySet<string> = new Set([
  "then", "so", "and", "but", "now", "yesterday", "today", "later", "also", "here", "there", "since", "when", "if", "as",
  "because", "after", "before", "once", "until", "while", "though", "although", "yet", "still", "first", "finally",
]);

// Possessives before a relative, a carer or a place: a particular person's story. The first person is refused already;
// "his or her" speaks of anyone; a plural possessive ("their") only where no group of people is the subject, so
// "patients ... with their partner" passes and "their husband" alone does not; a possessive 's only where nothing makes
// it any one of a group ("each participant's partner" passes, "the patient's wife" does not).
const POSSESSIVE_SINGULAR: ReadonlySet<string> = new Set([
  "our", "his", "her", "son", "sa", "ses", "ma", "mes", "notre", "nos", "su", "nuestro", "nuestra", "nuestros",
  "nuestras", "sein", "seine", "seinem", "seinen", "seiner", "seines", "ihr", "ihre", "ihrem", "ihren", "ihrer", "ihres",
  "unser", "unsere", "unserem", "unseren", "unserer", "seu", "sua", "nosso", "nossa", "nossos", "nossas", "dele",
  "dela", "suo", "suoi", "sue", "nostro", "nostra", "nostri", "nostre",
]);
const POSSESSIVE_PLURAL: ReadonlySet<string> = new Set(["their", "leur", "leurs", "sus", "seus", "suas", "loro"]);
const PERSONAL_SINGULAR: ReadonlySet<string> = new Set([
  "husband", "wife", "spouse", "partner", "boyfriend", "girlfriend", "fiance", "fiancé", "fiancee", "fiancée", "son",
  "daughter", "child", "kid", "baby", "mother", "father", "mum", "mom", "mummy", "mommy", "dad", "daddy", "parent",
  "brother", "sister", "sibling", "grandmother", "grandfather", "grandma", "grandpa", "granny", "grandson",
  "granddaughter", "aunt", "uncle", "cousin", "nephew", "niece", "stepson", "stepdaughter", "stepmother", "stepfather",
  "friend", "neighbour", "neighbor", "roommate", "flatmate", "doctor", "gp", "physician", "pharmacist", "nurse",
  "therapist", "psychiatrist", "dentist", "surgeon", "home", "house", "flat", "apartment", "town", "city", "village",
  "street", "neighbourhood", "neighborhood", "address", "workplace", "office", "mari", "femme", "épouse", "époux",
  "conjoint", "conjointe", "compagnon", "compagne", "copain", "copine", "fils", "fille", "enfant", "bébé", "mère",
  "père", "maman", "papa", "frère", "sœur", "soeur", "tante", "oncle", "cousine", "neveu", "nièce", "ami", "amie",
  "voisin", "voisine", "médecin", "ville", "rue", "quartier", "maison", "esposo", "esposa", "marido", "mujer", "pareja",
  "novio", "novia", "hijo", "hija", "niño", "niña", "madre", "padre", "mamá", "papá", "hermano", "hermana", "abuela",
  "abuelo", "tía", "tío", "prima", "primo", "sobrino", "sobrina", "amigo", "amiga", "vecino", "vecina", "médico",
  "ciudad", "pueblo", "calle", "barrio", "casa", "mann", "frau", "ehemann", "ehefrau", "freund", "freundin", "sohn",
  "tochter", "kind", "mutter", "vater", "mama", "bruder", "schwester", "oma", "opa", "onkel", "neffe", "nichte",
  "nachbar", "nachbarin", "arzt", "ärztin", "stadt", "dorf", "straße", "wohnung", "mulher", "namorado", "namorada",
  "filho", "filha", "criança", "mãe", "pai", "irmão", "irmã", "avó", "avô", "tia", "tio", "sobrinho", "vizinho",
  "vizinha", "cidade", "bairro", "marito", "moglie", "fidanzato", "fidanzata", "figlio", "figlia", "bambino", "bambina",
  "mamma", "papà", "fratello", "sorella", "nonna", "nonno", "zia", "zio", "cugino", "cugina", "nipote", "amico",
  "amica", "vicino", "vicina", "città", "paese", "quartiere",
]);
const PERSONAL_PLURAL: ReadonlySet<string> = new Set([
  "children", "kids", "parents", "brothers", "sisters", "siblings", "sons", "daughters", "grandchildren", "enfants",
  "filles", "hijos", "hijas", "padres", "kinder", "eltern", "filhos", "filhas", "pais", "figli", "genitori",
]);
// Groups of people a study reports on: with one of them in the text, "their partner" is each one's.
const GROUPS = /\b(?:patients|participants|people|persons|subjects|individuals|adults|adolescents|children|infants|women|men|mothers|fathers|parents|couples|families|users|respondents|caregivers|carers|volunteers|residents|workers|students|athletes|smokers|survivors|cases|controls|those|they|personnes|sujets|adultes|enfants|femmes|hommes|mères|pères|familles|utilisateurs|pacientes|participantes|personas|sujetos|adultos|niños|mujeres|hombres|madres|familias|usuarios|patienten|teilnehmer|teilnehmerinnen|personen|erwachsene|kinder|frauen|männer|mütter|väter|familien|pessoas|crianças|mulheres|homens|mães|famílias|pazienti|partecipanti|persone|adulti|bambini|donne|uomini|madri|padri|famiglie)\b/iu;
const DISTRIBUTIVE = /^(?:each|every|any|chaque|cada|jede[rsmn]?|ogni|qualquer)$/u;
// "Each woman and her partner": a possessive that speaks of every member of a group, after each or every and one of
// these within the six words before it.
const MEMBERS: ReadonlySet<string> = new Set([
  "woman", "man", "participant", "patient", "person", "subject", "mother", "father", "parent", "child", "respondent",
  "caregiver", "carer", "member", "user", "volunteer", "adult", "individual", "couple", "family", "case",
]);
function distributedAt(words: readonly Word[], index: number): boolean {
  const before = words.slice(Math.max(0, index - 6), index);
  return before.some((word, at) => DISTRIBUTIVE.test(word.lower) && MEMBERS.has(before[at + 1]?.lower ?? ""));
}

const isCapitals = (word: string) => word.length >= 2 && word === word.toUpperCase() && word !== word.toLowerCase();
const personal = (word: string | undefined) => word !== undefined && (PERSONAL_SINGULAR.has(word) || PERSONAL_PLURAL.has(word));

function lexicalRule(original: string): "first_person" | "personal_relation" | undefined {
  // A text mostly in capitals is read as if it were in lower case: there, capitals are no abbreviation.
  const text = shouted(original) ? original.toLowerCase() : original;
  // "1" standing for "I" at a sentence's start, before a verb only a person's own account uses so.
  if (ONE_FOR_I.test(text)) return "first_person";
  const words = wordsOf(text);
  const groups = GROUPS.test(text);
  for (const [index, word] of words.entries()) {
    const raw = word.text.replace(/['’]$/u, "");
    const lower = raw.toLowerCase();
    const next = words[index + 1]?.lower.replace(/['’]$/u, "");
    const after = words[index + 2]?.lower.replace(/['’]$/u, "");
    if (authorAt(words, index)) continue;
    // "I", in any case (a text in capitals is read in lower case), and an "l" standing for it before a personal verb.
    if (raw === "I" || raw === "i" ||
      (raw === "l" && next !== undefined && PRONOUN_VERBS.has(next) && !/\d\s*$/u.test(text.slice(0, word.start)))) {
      const following = text.slice(word.end, word.end + 3);
      // An abbreviation (i.e., i.v., I.M.), and Italian's article before a possessive or a number.
      if (/^\.\s?\p{L}/u.test(following) || (next !== undefined && ITALIAN_ARTICLE_BEFORE.has(next))) continue;
      const before = words[index - 1];
      const numeral = /^(?:[0-9^]|\s*[-–/]\s*(?:[IVX]|[0-9]))/u.test(following) ||
        (text[word.start - 1] === "(" && following.startsWith(")")) ||
        // Italian's plural article: I pazienti, I dati.
        (next !== undefined && /\p{Ll}i$/u.test(words[index + 1]!.text) && next.length > 2) ||
        (before !== undefined && I_NUMERAL_BEFORE.has(before.lower)) ||
        (next !== undefined && ROMAN.test(next) && words[index + 1]!.text === words[index + 1]!.text.toUpperCase()) ||
        (next !== undefined && ["and", "or", "to", "through", "et", "y", "und", "e", "ou", "o"].includes(next) &&
          after !== undefined && ROMAN.test(after) && words[index + 2]!.text === words[index + 2]!.text.toUpperCase()) ||
        // An initial after a surname (Smith I, Jones K), never after a word that starts a clause (Then I, ...).
        (before !== undefined && /^\p{Lu}\p{Ll}/u.test(before.text) && !CLAUSE_STARTS.has(before.lower) &&
          /^(?:[.,;]|$)/u.test(following));
      if (!numeral) return "first_person";
      continue;
    }
    if (FIRST_PERSON_CONTRACTIONS.test(lower)) return "first_person";
    if (isCapitals(raw)) {
      // In capitals, a pronoun counts only as a possessive before a relative or a place.
      if ((FIRST_PERSON.has(lower) || POSSESSIVE_SINGULAR.has(lower)) && personal(next)) return "personal_relation";
      continue;
    }
    const capitalized = raw[0] !== raw[0]!.toLowerCase();
    // Capitalized inside a sentence, a pronoun or a first-person verb followed by another capitalized word is a name.
    const named = capitalized && !word.sentenceStart;
    if (FIRST_PERSON.has(lower) && !(named && /^\p{Lu}/u.test(words[index + 1]?.text ?? ""))) return "first_person";
    if (WE.has(lower) && words.slice(index + 1, index + 6).some(({ lower: verb }) => HOUSEHOLD_VERBS.has(verb))) {
      return "first_person";
    }
    if (FIRST_PERSON_VERBS.has(lower) && !named) return "first_person";
    if (/['’]s$/u.test(lower) && personal(next)) {
      const determiner = words[index - 1]?.lower;
      if (determiner === undefined || !DISTRIBUTIVE.test(determiner)) return "personal_relation";
    }
    // "his or her" and "his/her" speak of anyone; one word may come between ("her older sister").
    if (POSSESSIVE_SINGULAR.has(lower) && next !== undefined && !/^(?:or|and|et|y|e|und|o|ou|oder|her|his)$/u.test(next) &&
      (personal(next) || personal(after)) && !distributedAt(words, index)) {
      return "personal_relation";
    }
    if (POSSESSIVE_PLURAL.has(lower) && next !== undefined && PERSONAL_SINGULAR.has(next) && !groups) {
      return "personal_relation";
    }
  }
  return undefined;
}
