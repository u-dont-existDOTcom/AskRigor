/**
 * Public evidence dossier, 16 November 2026.
 * A source-linked synthesis of independent public studies and deidentified community signals.
 * NOT a clinical guideline or a conclusion that chemical isomers are interchangeable.
 * Facts are paraphrased; each claim has a traceable public citation.
 */
export interface DossierCitation {
  label: string;
  url: string;
}
export interface DossierEvidence {
  title: string;
  context: string;
  quantified: string;
  interpretation: string;
  certainty: "moderate" | "low" | "very low" | "unconfirmed";
  sources: readonly DossierCitation[];
}
export interface DossierForm {
  key: string;
  heading: string;
  bottomLine: string;
  evidence: readonly DossierEvidence[];
  safety: readonly string[];
}
export interface InositolDossier {
  date: string;
  comparisons: readonly { form: string; promisingFor: string; evidence: string; safety: string }[];
  forms: readonly DossierForm[];
  generalNotes: readonly string[];
}

const pub = (pmid: string, label: string): DossierCitation =>
  ({ label, url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` });
const atlas = (number: string, label: string): DossierCitation =>
  ({ label, url: `https://askrigor.com/atlas/findings/${number}` });

export const INOSITOL_DOSSIER: InositolDossier = {
  date: "16 November 2026",
  comparisons: [
    {
      form: "Myo-inositol",
      promisingFor: "PCOS metabolic measures, selected panic/OCD studies; epilepsy research is experimental",
      evidence: "Most human research of the family, but clinical effect estimates and results vary by indication",
      safety: "Best-characterized short-term tolerability of these forms; mainly gastrointestinal effects in trials. Rare long-term neuropsychiatric harms are not quantified",
    },
    {
      form: "D-chiro-inositol (DCI)",
      promisingFor: "PCOS biochemical measures; testosterone and epilepsy are early research leads",
      evidence: "Small PCOS trials, two uncontrolled 10-man hormone studies, one striking rat seizure experiment",
      safety: "May materially shift testosterone/estrogen balance. Long-term human endocrine and neurological safety unclear; supplement identity varies",
    },
    {
      form: "Myo + D-chiro combinations",
      promisingFor: "PCOS research, especially insulin and menstrual endpoints",
      evidence: "Small and heterogeneous head-to-head trials; the popular 40:1 ratio is not proven optimal",
      safety: "Each component's effects and actual label amounts matter; no reliable safety superiority established",
    },
    {
      form: "Scyllo-inositol / ELND005",
      promisingFor: "Experimental amyloid-targeting neurological research",
      evidence: "A 353-person Alzheimer's randomized trial showed biomarker effects but not primary cognitive/functional benefit",
      safety: "High-dose Alzheimer trial arms stopped after serious infection/death imbalance. Not a standard consumer therapy",
    },
    {
      form: "IP6 / phytic acid",
      promisingFor: "Exploratory uric acid, glycation and mineral-absorption research",
      evidence: "Small human trials for biomarkers; no demonstrated cancer, gout or diabetic-complication prevention",
      safety: "Can reduce iron and zinc absorption in phytate-rich diets; ordinary dietary and high-dose capsule effects must be distinguished",
    },
    {
      form: "D-pinitol",
      promisingFor: "Experimental glucose-control research in type 2 diabetes",
      evidence: "One 66-person placebo-controlled study plus related exploratory studies; not interchangeable with DCI",
      safety: "Too few human data for a comparative long-term safety ranking",
    },
  ],
  forms: [
    {
      key: "general",
      heading: "Across inositol forms: best-supported outcomes and overall safety",
      bottomLine: "The most reproducibly studied area is insulin/glucose physiology, especially in PCOS. Direct patient-important benefits are less certain than changes in laboratory markers.",
      evidence: [
        {
          title: "Glucose-control meta-analysis (2018)",
          context: "20 randomized studies enrolling 1,239 people; pooled different inositol-family interventions and populations.",
          quantified: "Mean fasting glucose was 0.44 mmol/L lower (95% CI 0.23–0.65 mmol/L lower); fasting insulin was 38.49 pmol/L lower. BMI and HbA1c did not show a clear pooled difference.",
          interpretation: "Suggests insulin-sensitizing activity, not proof of reduced diabetes complications. Pooled forms and patient groups cannot identify which stereoisomer is best.",
          certainty: "low",
          sources: [pub("29980312", "2018 glucose-control meta-analysis")],
        },
        {
          title: "PCOS evidence synthesis and guideline (2023–2024)",
          context: "Systematic review of 30 trials (2,230 participants) informing international PCOS guidance.",
          quantified: "Only 19 of 30 trials contributed to quantitative meta-analyses. Many clinically important outcomes had low or very-low certainty; no reliable universal effect size can be assigned across doses and formulations.",
          interpretation: "Some metabolic and menstrual findings may benefit, but ovulation, hirsutism, weight, clinical pregnancy and live-birth outcomes remain uncertain. Guidelines do not endorse one dose, isomer or 40:1 ratio as best.",
          certainty: "low",
          sources: [pub("38163998", "PCOS systematic review"), { label: "2023 international PCOS guideline", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10477934/" }],
        },
        {
          title: "Large pregnancy prevention trial did not confirm meaningful benefit (2025)",
          context: "464 women with PCOS randomized; 224 active and 228 control contributed to the primary analysis. Myo-inositol 4 g/day plus folic acid versus folic acid control.",
          quantified: "Gestational diabetes, preeclampsia or preterm birth occurred in 56/224 (25.0%) versus 61/228 (26.8%): 1.8 fewer cases per 100, with 95% CI ranging from 9.8 fewer to 6.3 more per 100.",
          interpretation: "A large, rigorous null result for this pregnancy endpoint; it cannot exclude effects on other outcomes or populations. Potential supplement adverse effects: 6.9% active versus 9.1% control.",
          certainty: "moderate",
          sources: [pub("40920401", "2025 randomized PCOS pregnancy study")],
        },
      ],
      safety: [
        "Water-solubility cannot tell D-chiro-inositol from myo-inositol: both dissolve in water; specific chromatographic identity testing is needed.",
        "Four commercial combination supplements tested in a 2026 laboratory-method application note had DCI at 0%, about 35%, 108%, and 117% of stated label amounts. These four convenience samples are not an industry-wide failure rate.",
        "The highest number of human exposures does not prove that myo-inositol is safe for every person or at every psychiatric-research dose.",
      ],
    },
    {
      key: "d-chiro",
      heading: "D-chiro-inositol: hormones, PCOS, epilepsy and uncertain PFS relevance",
      bottomLine: "Most promising as a research tool for steroid metabolism and glucose physiology. The epilepsy effect in rats is unusually large, but its relevance to human epilepsy, PFS and PSSD remains unestablished.",
      evidence: [
        {
          title: "Testosterone rose in 10 healthy male volunteers (2021)",
          context: "Uncontrolled one-month pilot at 1 g/day with no placebo group.",
          quantified: "Mean testosterone +23.4%, estrone −85%, estradiol −14.4% (estradiol change statistically inconclusive), DHEA +13.8%; ten volunteers.",
          interpretation: "These are pre/post hormone measurements, not placebo-adjusted effects and not evidence of improvement in genital sensation or post-finasteride syndrome.",
          certainty: "very low",
          sources: [pub("34078260", "DCI aromatase/hormone pilot"), atlas("P-1216", "Atlas finding: DCI and testosterone")],
        },
        {
          title: "A second pilot in older men with low testosterone (2021)",
          context: "10 older men took 600 mg DCI twice daily for 30 days; still no control group.",
          quantified: "Testosterone 222.8 → 262.8 ng/dL (+40.0 ng/dL; +18.0%). Estradiol 42.24 → 34.15 pg/mL (−19%). Erectile-function score 11.5 → 13.6 (+2.1 points).",
          interpretation: "Could reflect DCI, chance, expectation or other time-related changes. Important: the measured testosterone increase was modest in absolute terms, not proof of treating clinically important symptoms.",
          certainty: "very low",
          sources: [pub("34763665", "DCI older-men pilot with full table")],
        },
        {
          title: "PCOS DCI placebo trials and combinations",
          context: "Two placebo-controlled DCI trials at 600–1,200 mg/day; combined 64 women in the 2024 systematic review. Another small study compared different myo:DCI ratios.",
          quantified: "DCI vs placebo: pooled free testosterone about 0.46 ng/dL lower (95% CI 0.15–0.76 lower), but small trials. In one small ratio trial, menstrual regularity was 5/8 on 40:1 versus 1/8 on 5:1.",
          interpretation: "The direction for androgen outcomes in women with PCOS differs from the small studies in men. The 8-versus-8 ratio comparison is far too small to establish an ideal ratio or fertility benefit.",
          certainty: "low",
          sources: [pub("38163998", "2024 PCOS systematic review, subgroup tables")],
        },
        {
          title: "Large reduction in visible seizures in kainate-treated rats (2025)",
          context: "Adult male rats after chemically induced status epilepticus, 1 mg/kg DCI injected twice daily for 28 days; video observation for eight weeks.",
          quantified: "Graph-reading estimates: during treatment about 4.1 visible motor seizures/rat in controls versus 0.4 with DCI (~90% fewer); weeks 5–8 after treatment, about 4.6 versus zero observed. Cumulative duration was approximately 50 versus 12 seconds/rat during treatment.",
          interpretation: "Numbers are approximate figure readings, not exact individual data. EEG was not performed for the DCI and scyllo groups; zero observed convulsions does not mean all electrical seizures were prevented. No human DCI epilepsy trial identified.",
          certainty: "very low",
          sources: [pub("39632506", "2025 DCI/scyllo/myo rat epilepsy experiment")],
        },
      ],
      safety: [
        "Lowering circulating estrogens is not automatically desirable. Estradiol supports male sexual function, mood and bone physiology; controlled long-term hormone studies are lacking.",
        "DCI-related male testosterone findings do not establish a PFS or PSSD cure; patients with those disorders can have normal blood testosterone.",
        "A manufacturer-method study identified mislabeled DCI in some combination products, so simple solubility or an ordinary generic inositol assay cannot verify it.",
      ],
    },
    {
      key: "scyllo",
      heading: "Scyllo-inositol: experimental neurobiology, clinical null results and important safety",
      bottomLine: "Has actual human central nervous system drug-trial exposure but no proven benefit on primary cognition/function outcomes. The high-dose safety imbalance warrants serious caution.",
      evidence: [
        {
          title: "Alzheimer phase 2 clinical trial (2011)",
          context: "353 randomized patients, 78-week planned study; primary analysis: 250 mg twice daily (84 people) versus placebo (82 people).",
          quantified: "No established improvement on either primary cognitive battery or daily-function scale at 78 weeks. Cerebrospinal fluid amyloid-beta marker changed (p=0.009), but its magnitude does not provide a clinically meaningful treatment effect.",
          interpretation: "Brain penetration and a biomarker change do not establish improved memory, functioning, or prevention of Alzheimer's disease.",
          certainty: "moderate",
          sources: [pub("21917766", "ELND005 Alzheimer randomized trial")],
        },
        {
          title: "Serious adverse events in Alzheimer study",
          context: "Investigational scyllo-inositol 250/1,000/2,000 mg twice daily versus placebo in older adults with Alzheimer disease.",
          quantified: "Serious adverse events in active groups 21.6%–23.1% versus 13.3% placebo (about 8.3–9.8 more per 100). Deaths: 0 placebo, 1 at 250 mg, 5 at 1,000 mg, 4 at 2,000 mg.",
          interpretation: "Higher doses were stopped after an infection/death imbalance. Most deaths were considered unrelated by investigators; causation is not established. These results cannot be transferred to ordinary myo-inositol.",
          certainty: "low",
          sources: [pub("21917766", "Original Alzheimer safety trial"), atlas("P-1227", "Atlas: scyllo-inositol safety")],
        },
        {
          title: "Down syndrome safety trial (2017)",
          context: "23 young adults without dementia; oral 250 mg once or twice daily for four weeks versus placebo.",
          quantified: "No serious adverse events or deaths were reported, and no clear cognitive or behavioral treatment effect was detected in this small, brief trial.",
          interpretation: "The short low-dose safety result cannot negate the different high-dose Alzheimer signal or establish general neurological benefit.",
          certainty: "low",
          sources: [pub("28453471", "Small Down syndrome trial")],
        },
        {
          title: "Animal epilepsy model (2025)",
          context: "Scyllo-inositol by injection after severe induced status epilepticus; video-observed motor seizures.",
          quantified: "The study reported no visible spontaneous seizures in scyllo-treated rats during weeks 5–8, the four weeks after dosing stopped; exact clinical-effect size in humans is unknown.",
          interpretation: "A striking preclinical research lead, not a demonstrated oral treatment for epilepsy or recovery from PSSD/PFS.",
          certainty: "very low",
          sources: [pub("39632506", "Rat epilepsy experiment")],
        },
      ],
      safety: [
        "Scyllo-inositol is not equivalent to myo-inositol, D-chiro-inositol or dietary IP6 and should not inherit their safety reputation.",
        "The higher-dose Alzheimer's drug studies are not a basis for individual dosing or claims about a persistent post-scyllo syndrome.",
      ],
    },
    {
      key: "ip6",
      heading: "IP6 / phytic acid: uric acid, glucose markers, minerals and cancer claims",
      bottomLine: "Human trials show biochemical possibilities, not proof of preventing gout, diabetes complications or cancer. Mineral absorption is the clearest concrete safety issue.",
      evidence: [
        {
          title: "Fasting uric acid in hyperuricemic adults (2019)",
          context: "31 participants randomized to 600 mg IP6 twice daily or placebo in a crossover experiment; 25 contributed to the reported per-protocol result.",
          quantified: "Fasting serum uric acid was lower after the two-week IP6 period; the accessible abstract does not give a reproducible numeric change in mg/dL. Gout attacks were not studied.",
          interpretation: "A modest pilot biomarker signal with a more favorable restricted analysis; not evidence that IP6 prevents gout.",
          certainty: "low",
          sources: [pub("31119466", "IP6 uric-acid crossover study"), atlas("P-1218", "Atlas finding")],
        },
        {
          title: "Glycation biomarkers in type 2 diabetes (2018)",
          context: "Randomized crossover involving 33 completing adults given calcium-magnesium phytate/IP6 for 12 weeks.",
          quantified: "HbA1c and circulating advanced glycation-end products decreased during the IP6 exposure versus comparison, but the source abstract does not supply the exact between-condition effect size.",
          interpretation: "A biomarker trial; no randomized demonstration of reduced neuropathy, kidney disease, cardiovascular events or other diabetic complications.",
          certainty: "low",
          sources: [pub("29941991", "Phytate glycation crossover study"), atlas("P-1220", "Atlas finding")],
        },
        {
          title: "Iron and zinc bioavailability: quantified trial review (2024)",
          context: "Narrative review of 42 human intervention studies of phytate, dephytinization and phytase.",
          quantified: "13/17 (76%) studies of phytate-rich meals observed lower iron or zinc bioavailability; removing phytate helped in 11/14 trials and adding phytase in 9/11.",
          interpretation: "Strong evidence that phytate in meals can impair mineral absorption. It is not a direct estimate of long-term iron-deficiency risk from a specific IP6 capsule.",
          certainty: "moderate",
          sources: [pub("39683463", "2024 human phytate mineral review"), atlas("P-1219", "Atlas review")],
        },
        {
          title: "Chemotherapy-adjunct pilot and cancer treatment claims (2010)",
          context: "Only 14 breast-cancer chemotherapy patients compared IP6 plus free inositol with vitamin C, not placebo or IP6 alone.",
          quantified: "Seven versus seven patients in a small combination comparison; no reliable cancer-free survival, recurrence or infection-prevention effect size was demonstrated.",
          interpretation: "Cannot support claims that IP6 prevents or treats cancer or improves chemotherapy survival.",
          certainty: "very low",
          sources: [atlas("P-1221", "Atlas chemotherapy-adjunct pilot")],
        },
      ],
      safety: [
        "IP6 is a phosphorylated inositol compound with mineral-binding chemistry, not an interchangeable substitute for free myo-inositol.",
        "Separate food-phytate effects from the dose and timing of supplemental IP6; nutritional risk depends on dietary mineral intake and nutritional status.",
      ],
    },
    {
      key: "myo",
      heading: "Myo-inositol: PCOS, glucose control, panic/OCD, sexual function and epilepsy",
      bottomLine: "Has the broadest human evidence in the family. Results are mixed: a few small psychiatric studies look promising, pooled psychiatric trials are inconclusive, and a large PCOS pregnancy trial was null.",
      evidence: [
        {
          title: "Panic disorder: small placebo-controlled crossover (1995)",
          context: "21 completers, 12 g/day for four weeks in a randomized crossover trial.",
          quantified: "Panic frequency and severity improved more with inositol than placebo; exact episodes per week and between-arm change were not recoverable from the abstract.",
          interpretation: "Clinical signal worthy of replication, but too few people and too short a period for dependable treatment guidance.",
          certainty: "low",
          sources: [pub("7793450", "Panic disorder placebo crossover")],
        },
        {
          title: "Panic disorder: comparison with fluvoxamine (2001)",
          context: "20 completers took inositol up to 18 g/day and fluvoxamine up to 150 mg/day for one month each, crossover.",
          quantified: "First-month panic attacks/week fell by 4.0 with inositol versus 2.4 with fluvoxamine: 1.6 more attacks per week prevented on average, in this tiny sample; broader anxiety scores were similar.",
          interpretation: "An active-comparator trial, not evidence that inositol beats placebo in a larger sample or has comparable long-term effectiveness.",
          certainty: "low",
          sources: [pub("11386498", "Panic disorder fluvoxamine crossover")],
        },
        {
          title: "OCD monotherapy signal versus failed augmentation",
          context: "Double-blind crossover in 13 OCD patients at 18 g/day for six weeks/arm; a separate 10-person crossover added inositol to ongoing serotonin reuptake inhibitor treatment.",
          quantified: "Small monotherapy study reported lower OCD symptom scores, exact group differences not in abstract. Adjunctive study reported no meaningful between-period difference; neither provides a reliable responder rate.",
          interpretation: "Do not infer that the small monotherapy result replicates or that augmentation works.",
          certainty: "low",
          sources: [pub("8780431", "OCD crossover monotherapy"), pub("11281989", "OCD SSRI augmentation trial")],
        },
        {
          title: "Pooled psychiatric trials did not confirm consistent clinical benefit (2014)",
          context: "Meta-analysis of seven depression trials (242 total) and four anxiety trials (70 total).",
          quantified: "No statistically conclusive pooled reductions in depression, anxiety or OCD scores or discontinuation; exact effect magnitude differs by indication and was not recoverable from the abstract.",
          interpretation: "This limits the strength of early favorable panic/OCD headlines; small trials and diagnosis mix leave open the possibility of a narrow responder subgroup.",
          certainty: "moderate",
          sources: [pub("24424706", "Depression/anxiety meta-analysis")],
        },
        {
          title: "Diabetic erectile dysfunction: combination with folic acid (2006)",
          context: "176 men with type 2 diabetes randomized to myo-inositol 4 g/day plus folic acid 400 µg/day, or placebo, for a reported 12-week course.",
          quantified: "Study reported an erectile-function benefit but the accessible abstract did not supply the numerical score difference.",
          interpretation: "Combination treatment, not proof of an independent myo-inositol effect or restoration of PSSD genital sensation.",
          certainty: "low",
          sources: [pub("17121317", "Diabetic erectile-dysfunction trial")],
        },
        {
          title: "Electrographic seizures decreased in kainic-acid rats (2022)",
          context: "14 rats (7 per group) implanted for EEG after the intervention; each monitored for three hours a day over three days.",
          quantified: "Mean recorded seizure episodes per rat during monitored sessions: 165.0 in untreated epileptic rats versus 60.9 after myo-inositol, about 63% fewer. Source reports ±25.7 and ±19.3, respectively.",
          interpretation: "Direct electrophysiology strengthens the animal signal but the restricted EEG sampling and chemically induced model cannot predict treatment benefit in people.",
          certainty: "very low",
          sources: [pub("35163126", "2022 myo-inositol rat EEG study")],
        },
        {
          title: "Rare genetic epilepsy: striking but confounded human case (2025)",
          context: "One child with PLCB1-related developmental and epileptic encephalopathy received enteral myo-inositol in addition to conventional antiseizure drugs.",
          quantified: "Up to 45 electrical seizures/day before treatment; a two-week seizure-free interval after supplementation began, followed by years with lower seizure burden.",
          interpretation: "Other antiseizure medicines changed, so one case cannot assign cause or establish an effective dose for unrelated epilepsy.",
          certainty: "very low",
          sources: [pub("40880844", "PLCB1 epilepsy human case")],
        },
        {
          title: "Post-antibiotic gut/mood hypothesis: report and negative follow-up",
          context: "Public LessWrong anecdotes claimed improvement after antibiotics, followed by a request for nonrespondents.",
          quantified: "Among four respondents with a proposed target digestive/mood profile: two neutral, one slight improvement, one negative. This was self-selected, not a four-person trial or prevalence sample.",
          interpretation: "Hypothesis remains untested; no direct evidence that antibiotics depleted brain inositol or that a new gut/mood syndrome responds reliably.",
          certainty: "unconfirmed",
          sources: [{ label: "Original LessWrong account", url: "https://www.lesswrong.com/posts/DTQfPfpcqEzCqzcsn/luck-based-medicine-inositol-for-anxiety-and-brain-fog" }, { label: "Follow-up including nonresponse", url: "https://www.lesswrong.com/posts/h9hzdJSykyPFGe5CX/inositol-non-results" }],
        },
        {
          title: "PSSD forum benefits and persistent adverse-symptom reports",
          context: "Selected public forum reports, usually from people with an established baseline of medication-related symptoms.",
          quantified: "One individual claimed recovery after repeated courses of high-dose inositol (18 g/day). Another individual described anxiety, insomnia and anhedonia lasting over two months after suspected high-dose exposure. Incidence and causality cannot be calculated.",
          interpretation: "A possible improvement/harm signal, not a controlled PSSD treatment, a recognized post-inositol disorder or evidence that reports share the same mechanism as lion's mane.",
          certainty: "unconfirmed",
          sources: [{ label: "PSSD improvement report", url: "https://www.reddit.com/r/PSSD/comments/sju4yu/pssd_cureinositol_works_just_not_always_the_first/" }, { label: "PSSD worsening report", url: "https://www.reddit.com/r/PSSD/comments/qqtows/be_careful_with_inositol/" }, atlas("P-1228", "Atlas adverse-report signal")],
        },
      ],
      safety: [
        "Reported high doses in psychiatric experiments are research exposures, not dose recommendations. Short trials cannot quantify uncommon persistent harms.",
        "Myo-inositol is the best studied of these forms for ordinary human short-term tolerability, but no trial establishes that it reverses PSSD, PFS, post-lion's mane or post-ashwagandha symptoms.",
      ],
    },
    {
      key: "pinitol",
      heading: "D-pinitol: insulin-sensitizing research, not D-chiro-inositol itself",
      bottomLine: "One small randomized diabetic trial suggests an effect on glucose measures, but the outcome magnitude and long-term safety remain uncertain.",
      evidence: [
        {
          title: "Type 2 diabetes placebo-controlled trial (2012)",
          context: "66 people already taking oral diabetes drugs randomized to 1,200 mg/day D-pinitol or placebo (33 per group).",
          quantified: "HbA1c, fasting glucose and insulin-resistance markers reportedly fell more with D-pinitol; the abstract does not provide the absolute between-arm changes.",
          interpretation: "An exploratory adjunct to established diabetes treatment, not proof of reducing complications or safely replacing medication. D-pinitol is a methylated derivative of DCI, not the same compound.",
          certainty: "low",
          sources: [pub("22179130", "D-pinitol type 2 diabetes trial")],
        },
      ],
      safety: [
        "Human safety evidence is much thinner than for myo-inositol, and formulation-specific controls matter.",
      ],
    },
  ],
  generalNotes: [
    "Best investigated use by evidence volume: PCOS and metabolic laboratory outcomes for myo-inositol and DCI. Best demonstrated human cure for epilepsy, PSSD, PFS, Alzheimer's or post-supplement syndromes: none.",
    "Safest in absolute terms cannot be ranked: populations, doses, products and adverse-event ascertainment differ. Myo-inositol has the most ordinary human short-term tolerability evidence; that is not proof it cannot cause unusual psychiatric effects.",
    "The compounds differ chemically: myo and DCI are free stereoisomers, scyllo is a different stereoisomer, IP6 is a phosphorylated inositol, and D-pinitol a methylated derivative. Do not carry efficacy or risk from one to another without evidence.",
    "Selected safety anecdotes are not incidence data. Both positive and negative experiences should be retained with dose, baseline condition, independent author count and follow-up; one person's repeated posts count once.",
    "A specific application note from a chromatography manufacturer found that some marketed DCI combinations did not contain their claimed DCI amounts. This is a signal for batch-specific isomer testing, not a representative market survey.",
    "This is an evidence map and focused research synthesis, not an exhaustive systematic literature review or personalized treatment advice. The linked Atlas findings and scientific articles retain their own review status.",
  ],
};
