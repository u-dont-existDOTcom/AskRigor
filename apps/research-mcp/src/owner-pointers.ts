import { atlasSearchFold } from "./atlas/search.js";

/**
 * The owner's pointers: things AskRigor's owner asked to have shown to people who ask a certain kind of question (the
 * owner, 14 November 2026: "make sure someone asking for central sensitization type syndrome, fibromyalgia, and
 * anything related with so many crazy symptoms ... can see this video", and "anyone asking how
 * they can get into flow state also should know about Systema breathing"). A pointer is the owner's own suggestion,
 * handed to the person's AI in the chat with what AskRigor checked about it and what to weigh. It is not a finding:
 * it never goes on the Atlas, whose pages take no video link (decisions 170 and 171), and the AI is told to give it
 * as the owner's.
 *
 * A pointer's link is one the owner gave, so it is not data from a video platform's API. Its "checked" text states
 * only what was read, with the date and how far the reading went.
 */
export interface OwnerPointer {
  /** Lower-case letters, digits and hyphens. */
  id: string;
  /** The questions it is for, in a few words: what the list of pointers shows. */
  about: string;
  /**
   * Word groups. The pointer matches a text that holds every part of one group. A part is a word or a phrase, already
   * folded (lower case, no accents, no apostrophes), and is found as whole words only: "flow state" is not in "cash
   * flow statement" or "workflow state". A part that ends with * may go on, so "sensiti*" finds sensitization,
   * sensitisation and sensitised.
   */
  match: readonly (readonly string[])[];
  /** What the owner asks people with such a question to see or know. */
  says: string;
  link?: { title: string; url: string };
  /** What AskRigor checked about it, when, and how far the reading went. */
  checked: string;
  /** What to weigh. */
  limits: string;
  /** The day the owner asked for it. */
  added: string;
}

/** Questions about fibromyalgia, a central sensitization syndrome, or many symptoms at once that tests do not explain. */
const MANY_UNEXPLAINED_SYMPTOMS: readonly (readonly string[])[] = [
  ["fibromyalgi*"], ["fibromialgi*"],
  // Phrases, not words apart: "central" and "sensitive" met in a question about central air conditioning, and
  // "neuroplastic" and "symptoms" in one about stroke (Codex's review of 14 Nov 2026).
  ["central sensiti*"], ["centrally sensiti*"],
  ["nervous system", "sensitised"], ["nervous system", "sensitized"], ["hypersensitive nervous system"],
  ["nervous system sensitisation"], ["nervous system sensitization"],
  ["unexplained symptom*"], ["unexplained physical symptom*"], ["unexplained medical symptom*"], ["medically unexplained"],
  ["functional somatic"], ["somatic symptom*"],
  ["neuroplastic symptom*"], ["neuroplastic pain"], ["neuroplastic condition*"], ["neuroplastic syndrome*"],
  ["mind-body syndrome"], ["mind body syndrome"], ["mindbody syndrome"], ["tension myo*"],
  ["doctors cant explain"], ["doctors cannot explain"], ["doctors couldnt explain"],
  ["symptom*", "cant be explained"], ["symptom*", "cannot be explained"],
];

export const OWNER_POINTERS: readonly OwnerPointer[] = [
  {
    id: "sensitised-nervous-system-video",
    about: "fibromyalgia, a central sensitization syndrome, or many symptoms at once that tests do not explain",
    match: MANY_UNEXPLAINED_SYMPTOMS,
    says: "AskRigor's owner asks that people with this kind of question see this video. In it a woman tells how more " +
      "than 50 long-lasting symptoms eased once she treated them as coming from a sensitised nervous system, and " +
      "what she did; she names the books she followed, Unlearn Your Pain (Howard Schubiner) and The Way Out (Alan " +
      "Gordon).",
    link: {
      title: "HOW I Healed My Sensitised Nervous System (50+ Chronic Symptoms Gone!) | My Recovery Journey " +
        "(Melanie Murphy, 56 minutes)",
      url: "https://www.youtube.com/watch?v=z6GI7S6WYz0",
    },
    checked: "AskRigor read the video's claims on 14 November 2026 and looked up two trials of the approach it " +
      "follows, in their abstracts only. Chronic back pain, pain reprocessing therapy: 33 of 50 people were " +
      "pain-free or nearly so after treatment, against 10 of 51 given an open placebo injection and 5 of 50 on usual " +
      "care, and the difference held at one year (Ashar and others, JAMA Psychiatry 2022, " +
      "doi:10.1001/jamapsychiatry.2021.2669). Fibromyalgia, emotional awareness and expression therapy, 230 adults: " +
      "at six months it was no better than education on pain severity, the trial's main measure, and better on " +
      "overall symptoms and functioning; 22.5% halved their pain, against 8.3% with cognitive behavioural therapy " +
      "(Lumley and others, Pain 2017, doi:10.1097/j.pain.0000000000001036). Authors of the two books are among the " +
      "trials' authors. AskRigor has not checked trials for many symptoms at once.",
    limits: "One person's account, and recoveries are what gets filmed; she is not a clinician and says to have " +
      "serious disease ruled out first. Parts of it are contested or untested: it presents graded exercise, with the " +
      "flare-up reframed, as the way out of post-exertional malaise, while the UK's NICE guideline on ME/CFS (NG206, " +
      "2021) says not to offer graded exercise therapy; it also mentions a nerve-stimulating ear device and " +
      "craniosacral therapy, which AskRigor has not checked. It links her Patreon membership.",
    added: "2026-11-14",
  },
  {
    id: "systema-breathing",
    about: "how to get into a flow state, a body stuck in fight-or-flight (tension or stress that does not switch " +
      "off), and the questions sensitised-nervous-system-video is for",
    match: [
      ["flow state"], ["flow states"], ["state of flow"], ["flow experience*"], ["into flow"],
      ["sympathetic", "dominan*"], ["sympathetic", "overdrive"], ["sympathetic", "overactiv*"],
      ["fight or flight"], ["fight-or-flight"],
      ...MANY_UNEXPLAINED_SYMPTOMS,
    ],
    says: "AskRigor's owner asks that people with this kind of question know about Systema breathing, from the " +
      "Russian martial art Systema: continuous, relaxed breathing while you notice any tension in the body, moment " +
      "to moment, and let it open up. The owner's view is that a great many health problems, mental and physical, " +
      "come from the body being stuck in sympathetic (fight-or-flight) dominance, and that this breathing helps " +
      "with it and with getting into flow.",
    checked: "AskRigor searched PubMed on 14 November 2026 and found no study of Systema breathing. What it read, in " +
      "abstracts only: across 12 randomised trials with 785 adults, breathing practices lowered self-reported " +
      "stress by a small to medium amount, with most trials at moderate risk of bias (Fincham and others, " +
      "Scientific Reports 2023, doi:10.1038/s41598-022-27247-y). On flow, one experiment with 48 healthy men found " +
      "it highest at a middle level of arousal and lower at either extreme, with the best performance under a " +
      "predominant but not total sympathetic response (Chin and Kales, Frontiers in Psychology 2019, " +
      "doi:10.3389/fpsyg.2019.01716): so easing excess tension may help someone who is over-aroused, and less " +
      "arousal is not always better. AskRigor has not checked breathing practices for fibromyalgia or unexplained " +
      "symptoms.",
    limits: "The owner's own view and practice, not a tested treatment; that most ill health comes from sympathetic " +
      "dominance is the owner's view, and AskRigor has not checked it. Someone whom a breathing practice makes dizzy " +
      "or tingly should stop. New, severe or worsening symptoms need a medical check first.",
    added: "2026-11-14",
  },
];

const WORD_CHARACTER = /[\p{L}\p{N}]/u;

/** Whether a folded text holds a part as whole words; a part ending with * may go on into a longer word. */
function holdsPart(folded: string, part: string): boolean {
  const open = part.endsWith("*");
  const wanted = open ? part.slice(0, -1) : part;
  if (wanted === "") return false;
  for (let at = folded.indexOf(wanted); at !== -1; at = folded.indexOf(wanted, at + 1)) {
    const before = at === 0 ? "" : folded[at - 1]!;
    const after = folded[at + wanted.length] ?? "";
    if (!WORD_CHARACTER.test(before) && (open || !WORD_CHARACTER.test(after))) return true;
  }
  return false;
}

/** A text as the word groups are written: folded for case and accents, without apostrophes, one space between words. */
export function foldedForPointers(text: string): string {
  return atlasSearchFold(text).replace(/['\u2019\u02bc]/gu, "").replace(/\p{White_Space}+/gu, " ");
}

/** The pointers a text matches by its words, in the list's order. */
export function ownerPointersFor(text: string, pointers: readonly OwnerPointer[] = OWNER_POINTERS): OwnerPointer[] {
  const folded = foldedForPointers(text);
  return pointers.filter(({ match }) => match.some((group) => group.every((part) => holdsPart(folded, part))));
}

/** A pointer by its id, in any case; undefined when there is none. */
export function ownerPointerById(id: string, pointers: readonly OwnerPointer[] = OWNER_POINTERS): OwnerPointer | undefined {
  const wanted = id.trim().toLowerCase();
  return pointers.find((pointer) => pointer.id === wanted);
}
