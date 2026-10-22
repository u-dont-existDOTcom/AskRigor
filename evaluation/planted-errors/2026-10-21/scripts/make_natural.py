# Real-paper cases for the planted-error test (21 Oct 2026, about 18:50 UTC): open-access papers whose separately
# published correction names an error in a table that the original's PMC full text still shows (found and checked by a
# helper, rechecked by the Claude session against the saved XML). They test AskRigor's own acquisition, which hands
# tables to the model as one line. DISCOVERY, written after the first eleven results were read.
import json, pathlib
cases, key = {}, {}
def case(cid, title, journal, doi, planted, correction, caught_if):
    cases[cid] = (f'Use AskRigor. I came across this study: "{title}" ({journal}), https://doi.org/{doi}. What does it show, '
                  "and how much should I trust its main conclusion?\n")
    key[cid] = {"doi": doi, "planted": planted, "correction": correction, "location": "table in the published paper",
                "centrality": "central", "caught_if": caught_if}

case("n01", "Comparison between intra-articular ozone and placebo in the treatment of knee osteoarthritis: A randomized, double-blinded, placebo-controlled study",
     "PLoS ONE, 2017", "10.1371/journal.pone.0179185",
     "Table 4's Placebo and Treatment columns are swapped: as printed, WOMAC pain is lower (better) on placebo at every follow-up (4 weeks: 20.0 against 45.0), while the Results text says the treated group scored lower and the abstract says ozone worked better.",
     "10.1371/journal.pone.0314494 (PMC11581196): 'The data in the Placebo and Treatment groups are swapped in Table 4.'",
     "The answer says Table 4 conflicts with the text (or that, as printed, it favours placebo), or reports the correction that its columns are swapped.")
case("n02", "Cognitive function in multiple sclerosis improves with telerehabilitation: Results from a randomized controlled trial",
     "PLoS ONE, 2017", "10.1371/journal.pone.0177177",
     "Table 3's baseline and end z-scores are switched between the arms: the Results text gives the baseline composite as -0.86 (telerehabilitation) and -0.77 (control), the reverse of the table, and end minus baseline from the table (+0.09 and +0.26) contradicts its own change column (0.25 and 0.09).",
     "10.1371/journal.pone.0192317 (PMC5790288): 'In Table 3, the mean baseline and end z-scores are incorrectly switched between treatment conditions.'",
     "The answer says Table 3 conflicts with the text or with its own change column, or reports the correction.")
case("n03", "Effect of denosumab on the incidence of fractures and mortality in patients undergoing hemodialysis: A retrospective cohort study",
     "PLoS ONE, 2024", "10.1371/journal.pone.0309657",
     "Table 3's cardiovascular-death row prints 3 (1.9%) deaths without denosumab instead of 32 (19.8%): as printed, 8 of 52 (15.4%) with denosumab against 3 of 162 (1.9%) contradicts the hazard ratios favouring denosumab (0.54 unadjusted, 0.33 adjusted) and the abstract's headline that it lowers cardiovascular mortality.",
     "10.1371/journal.pone.0320569 (PMC11927874): 'the number of CVD cases in the non-denosumab group should be corrected from \"3 (1.9)\" to \"32 (19.8)\".'",
     "The answer says the printed cardiovascular-death counts contradict the hazard ratio or the conclusion, or reports the correction (32, 19.8%).")
pathlib.Path("cases").mkdir(exist_ok=True)
for cid, text in cases.items(): pathlib.Path(f"cases/{cid}.md").write_text(text)
k = json.load(open("key.json")); k.update(key); pathlib.Path("key.json").write_text(json.dumps(k, indent=1) + "\n")
print(sorted(k))
