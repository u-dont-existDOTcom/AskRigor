/** Owner answer 403 1b 2a, 22 Nov 2026. Adding a section needs only one entry here. */
export interface AtlasTraditionSection { key: string; label: string; description: string }
export const ATLAS_TRADITIONS: readonly AtlasTraditionSection[] = Object.freeze([
  { key: "tibetan-medicine", label: "Tibetan medicine (Sowa Rigpa)",
    description: "Tibetan medicine, also called Sowa Rigpa, with each finding naming its text, lineage or preparation." },
  { key: "ayurveda-and-siddha", label: "Ayurveda and Siddha",
    description: "Ayurveda’s texts, regional and household practices and modern products; Siddha is a separate Tamil system shown here with its own label." },
  { key: "tcm", label: "TCM: standardized Chinese medicine",
    description: "Chinese medicine standardized in China from the 1950s. This includes its textbooks, official list of approved medicines and how they are made, and ready-made products sold under a brand." },
  { key: "ccm", label: "CCM: classical Chinese medicine",
    description: "Classical Chinese texts and the lineages and schools that read them. Findings from Kampo name it as Japan’s own tradition of using the classical Chinese formulas." },
]);
export const traditionSectionOf = (key: string) => ATLAS_TRADITIONS.find((section) => section.key === key);
export const traditionsPath = (key?: string) => key === undefined ? "/atlas/traditions" : `/atlas/traditions/${key}`;
