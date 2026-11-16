import { atlasSearchFold } from "./search.js";

/**
 * Editorially verified substance families. A family links findings that the author and readers already know are
 * chemically related, even when the underlying research cards were filed under different clinical topics.
 * Never infer a mechanism, efficacy, or safety equivalence merely from membership in a family.
 */
export interface AtlasTopicFamily {
  key: string;
  label: string;
  intro: string;
  aliases: readonly string[];
  searchNames: readonly string[];
  sections: readonly {
    key: string;
    heading: string;
    summary: string;
    aliases: readonly string[];
  }[];
  unfinishedResearch: string;
}

export const ATLAS_TOPIC_FAMILIES: readonly AtlasTopicFamily[] = [
  {
    key: "inositol",
    label: "Inositol: forms, benefits and risks",
    intro: "One research collection for chemically distinct inositol forms. Individual results can come from different people, species, routes and doses: benefits or harms from one form do not automatically apply to the others. Start with the less-obvious findings, then inspect the supporting research and unresolved limits.",
    aliases: ["inositol", "myo-inositol", "d-chiro-inositol", "scyllo-inositol", "ip6", "phytic acid", "phytate", "pinitol"],
    // Only umbrella-name searches expand. Searching for IP6 still means IP6 rather than every inositol form.
    searchNames: ["inositol", "inositols"],
    sections: [
      {
        key: "general",
        heading: "Unspecified inositol forms and adverse reports",
        summary: "Patient reports are signals to investigate, not incidence estimates or proof of a distinct post-supplement syndrome. Confirm the exact product and pre-existing symptoms before attributing causation.",
        aliases: [],
      },
      {
        key: "d-chiro",
        heading: "D-chiro-inositol: hormones and experimental epilepsy",
        summary: "Human male-hormone studies were very small and uncontrolled. A separate animal seizure study suggests an effect but does not establish an oral treatment for epilepsy in people.",
        aliases: ["d-chiro-inositol", "d-chiro", "d chiro", "dchi"],
      },
      {
        key: "scyllo",
        heading: "Scyllo-inositol: neurological research and safety",
        summary: "Investigational ELND005 reached the human brain but did not demonstrate benefit on the main Alzheimer's clinical outcomes; high-dose safety findings must not be transferred to myo-inositol.",
        aliases: ["scyllo-inositol", "scyllo", "elnd005", "azd-103"],
      },
      {
        key: "ip6",
        heading: "IP6 / phytic acid: metabolic markers, minerals and oncology",
        summary: "Human studies address uric acid, diabetes-related markers, mineral bioavailability and a small chemotherapy adjunct pilot. Those endpoints do not establish prevention of gout, diabetic complications or cancer.",
        aliases: ["ip6", "phytic acid", "phytate", "phytates"],
      },
      {
        key: "myo",
        heading: "Myo-inositol: psychiatric, metabolic and epilepsy evidence",
        summary: "Small psychiatric trials, a combined diabetic erectile-dysfunction trial, animal epilepsy studies and one rare-genetic-epilepsy case merit separate comparison. No established PSSD cure follows from them.",
        aliases: ["myo-inositol", "myoinositol", "myo inositol"],
      },
      {
        key: "pinitol",
        heading: "D-pinitol and other derivatives",
        summary: "D-pinitol is a methylated D-chiro-inositol derivative with preclinical neurological research; evidence for human treatment is not established.",
        aliases: ["pinitol"],
      },
    ],
    unfinishedResearch: "The source-linked overview above synthesizes published studies across the forms, but some studies are not yet promoted to separate, individually supervisor-reviewable Atlas findings. Automated, versioned archival of the complete cross-conversation research record is still being developed. Missing individual cards are not evidence of no effect.",
  },
];

export const atlasTopicFamily = (key: string): AtlasTopicFamily | undefined =>
  ATLAS_TOPIC_FAMILIES.find((family) => family.key === key);

export const atlasSearchFamily = (query: string): AtlasTopicFamily | undefined => {
  const folded = atlasSearchFold(query.trim());
  return ATLAS_TOPIC_FAMILIES.find((family) =>
    family.searchNames.some((name) => atlasSearchFold(name) === folded));
};
