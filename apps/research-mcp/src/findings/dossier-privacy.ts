import { holdsYouTubeReference, screenFindingsText } from "./card.js";

/**
 * The research dossier's privacy screen (AskRigor#477 stage 1; Codex's review of 16 Nov 2026, finding 2). Notice v6
 * covers a dossier written in general terms, never the person: their own words or circumstances, their relatives,
 * their contacts or where they live. A dossier is stored before anyone reads it, so this screen refuses the whole
 * dossier, naming the field, whenever a text looks personal; when in doubt it refuses. It reads every text in English,
 * French, Spanish, German, Portuguese and Italian (with a few words of Dutch and Polish), refuses words in scripts it
 * cannot read, and keeps the findings card's own screen (contacts, identifiers, English health narratives) and its
 * YouTube check. What it cannot see (a narrative with none of these markers, another Latin-script language) the owner's
 * review still has to catch; the tests hold it to a list of realistic leaks and of research sentences that must pass.
 *
 * Returns the rule a text breaks, or undefined.
 */
export function dossierPrivacyRule(text: string): string | undefined {
  const value = text.normalize("NFC");
  return screenFindingsText(value) ?? (holdsYouTubeReference(value) || /youtu\.?be/iu.test(value) ? "youtube_reference"
    : CONTACT.some((pattern) => pattern.test(value)) ? "contact_details"
    : UNSCREENED_SCRIPT.test(value) ? "unscreened_script"
    : lexicalRule(value));
}

// Links, handles, e-mail, phone numbers (nine digits or more), street addresses and postal codes.
const CONTACT: readonly RegExp[] = [
  /https?:\/\/|www\.|\b[\w.+-]+@[\w-]+\.\w/iu,
  /(?:^|[\s(])@[\p{L}\p{N}_.]{2,}/u,
  /(?:^|[^\p{L}])u\/[\p{L}\p{N}_-]{3,}/u,
  /\+?\d(?:[\s().-]*\d){8,}/u,
  /\b\d{1,5}[a-z]?,?\s+(?:rue|avenue|av\.?|boulevard|bd|street|st\.?|road|rd\.?|lane|drive|calle|avenida|straße|strasse|rua|via|piazza|allée|chemin|place)\b/iu,
  /\b(?:post ?code|zip ?code|postal code|code postal|código postal|postleitzahl)\b/iu,
  /\b[A-Z]{2} \d{5}(?:-\d{4})?\b/u,
];

// Three letters in a row from a script other than Latin: a language this screen cannot read (single Greek letters, as
// in TNF-α, are research symbols and pass).
const UNSCREENED_SCRIPT = /(?:(?![\p{Script=Latin}])\p{L}){3,}/u;

// The person's own voice: first-person singular pronouns and possessives. Matched in lower case or capitalized, never
// in capitals (ME/CFS, MI, EU, IO and MY are abbreviations). Words other languages use otherwise are left out: "ma"
// (Italian "but") and "mes" (Spanish "month"), which count only before a relative or a place, below, and "eu" (French
// "had").
const FIRST_PERSON: ReadonlySet<string> = new Set([
  "me", "my", "myself", "je", "moi", "mon", "yo", "mi", "mis", "conmigo", "ich", "mich", "mir", "mein", "meine",
  "meinen", "meinem", "meiner", "meines", "meu", "minha", "meus", "minhas", "comigo", "io", "mio", "mia", "miei",
  "mie", "ik", "mij", "mijn", "mój", "moja", "moje", "mnie",
]);
const FIRST_PERSON_CONTRACTIONS = /^(?:i['’](?:m|ve|d|ll)|j['’]\p{L}|m['’]\p{L})/u;
// Spanish, Portuguese and Italian drop the pronoun, so their commonest first-person verbs of a health story count too
// (none that is also a French or Italian participle, such as "noté" or "presi").
const FIRST_PERSON_VERBS: ReadonlySet<string> = new Set([
  "tengo", "tuve", "tomo", "tomé", "sufro", "sufrí", "padezco", "siento", "sentí", "empecé", "dejé", "estoy",
  "estuve", "probé", "llevo", "tenho", "tive", "tomei", "sofro", "sofri", "sinto", "senti", "notei", "comecei",
  "parei", "estou", "estive", "experimentei", "moro", "prendo", "soffro", "sento", "sentivo", "ho", "avevo",
  "sto", "stavo", "abito",
]);
// English "I" counts before the verbs of a personal account; "I" after phase, type, class and the like is a numeral.
const I_NUMERAL_BEFORE: ReadonlySet<string> = new Set([
  "phase", "phases", "type", "types", "stage", "stages", "grade", "grades", "class", "classes", "level", "levels",
  "tier", "category", "group", "groups", "arm", "part", "wave", "cohort", "schedule", "section", "table", "figure",
  "chapter", "appendix", "round", "period", "step", "factor", "complex", "degree", "war", "collagen", "trial", "trials",
  "study", "studies", "experiment", "experiments", "sample", "samples", "series",
]);
const I_VERBS_AFTER: ReadonlySet<string> = new Set([
  "am", "was", "have", "had", "take", "took", "use", "used", "tried", "try", "started", "start", "stopped", "stop", "feel",
  "felt", "got", "get", "noticed", "notice", "experienced", "suffer", "suffered", "live", "lived", "went", "go", "need",
  "needed", "think", "believe", "know", "found", "read", "saw", "would", "will", "can", "could", "do", "did", "don't",
  "didn't", "can't", "also", "still", "now", "then", "just", "never", "always", "really", "usually", "recently",
  "first", "finally", "began", "quit", "switched", "developed", "became", "personally", "myself",
]);

// Possessives before a relative, a carer or a place: a particular person's story. The first person is refused already;
// "their" (and its plural forms elsewhere) only before a singular, so "women and their partners" passes.
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

const isCapitals = (word: string) => word.length >= 2 && word === word.toUpperCase() && word !== word.toLowerCase();

function lexicalRule(text: string): string | undefined {
  const words = text.match(/[\p{L}\p{M}'’-]+/gu) ?? [];
  for (const [index, raw] of words.entries()) {
    const word = raw.replace(/^['’-]+|['’-]+$/gu, "");
    const lower = word.toLowerCase();
    const next = words[index + 1]?.replace(/^['’-]+|['’-]+$/gu, "").toLowerCase();
    const after = words[index + 2]?.replace(/^['’-]+|['’-]+$/gu, "").toLowerCase();
    if (word === "I") {
      const before = words[index - 1]?.toLowerCase();
      if ((before === undefined || !I_NUMERAL_BEFORE.has(before)) && next !== undefined && I_VERBS_AFTER.has(next)) {
        return "first_person";
      }
      continue;
    }
    if (FIRST_PERSON_CONTRACTIONS.test(lower)) return "first_person";
    if (isCapitals(word)) continue;
    if (FIRST_PERSON.has(lower) || FIRST_PERSON_VERBS.has(lower)) return "first_person";
    if (/['’]s$/u.test(lower) && next !== undefined && (PERSONAL_SINGULAR.has(next) || PERSONAL_PLURAL.has(next))) {
      return "personal_relation";
    }
    // "his or her" and "his/her" speak of anyone; one word may come between ("her older sister").
    if (POSSESSIVE_SINGULAR.has(lower) && next !== undefined && !/^(?:or|and|et|y|e|und|o|ou|oder|her|his)$/u.test(next) &&
      (PERSONAL_SINGULAR.has(next) || PERSONAL_PLURAL.has(next) ||
        (after !== undefined && (PERSONAL_SINGULAR.has(after) || PERSONAL_PLURAL.has(after))))) {
      return "personal_relation";
    }
    if (POSSESSIVE_PLURAL.has(lower) && next !== undefined && PERSONAL_SINGULAR.has(next)) return "personal_relation";
  }
  return undefined;
}
