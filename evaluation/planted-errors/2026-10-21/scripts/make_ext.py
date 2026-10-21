# Extension to the planted-error test, written on 21 Oct 2026 at about 18:43 UTC, after the first eleven results were
# read: two tables in exactly the one-line form AskRigor's JATS extraction gives the model (cells joined by spaces, no
# row breaks; rendered with indexJatsStudyDocument), because the first set's flattened tables kept their row breaks.
import json, pathlib
ASK = ("Use AskRigor. Here is a study report, pasted below. What does it show, and how much should I trust its main "
       "conclusion?\n\n")
cases, key = {}, {}
def case(cid, text, planted, location, centrality, caught_if, partial_if=None):
    cases[cid] = ASK + text.strip() + "\n"
    key[cid] = {"planted": planted, "location": location, "centrality": centrality, "caught_if": caught_if, "partial_if": partial_if}

case("u01", """
Dawnroot capsules for restless legs: a randomized, placebo-controlled trial

Abstract. 104 adults with moderate restless legs syndrome were randomized to dawnroot capsules or placebo for 6 weeks. Symptom scores improved by 9.6 points on dawnroot and by 4.8 points on placebo (International Restless Legs Scale, 0 to 40, higher is worse). Dawnroot halves the burden of restless legs compared with placebo.

Methods. Randomized 1:1, double-blind. Primary outcome: change in the International Restless Legs Scale from baseline to week 6.

Results. 52 were randomized to each group; 50 and 51 completed. Table 2 Restless legs score (0-40, higher = worse) Dawnroot (n = 52) Placebo (n = 52) Baseline, mean 24.6 24.9 Week 6, mean 19.8 15.3 Change -4.8 -9.6

Discussion. Dawnroot doubled the improvement seen with placebo. Funding: Dawnroot Naturals.
""", "The one-line table gives dawnroot 24.6 to 19.8 (-4.8) and placebo 24.9 to 15.3 (-9.6): the abstract and discussion swap the groups, so placebo improved twice as much.",
     "one-line flattened table (AskRigor's extraction form) against the abstract", "central",
     "The answer says the table shows the bigger improvement on placebo (-9.6) than on dawnroot (-4.8).")

case("u02", """
Glimmerseed oil drops for dry eye: a three-arm randomized trial

Abstract. 120 adults with dry eye used low-dose or high-dose glimmerseed oil drops, or placebo drops, for 8 weeks. Symptoms improved by at least 10 points in 35% on the low dose, 28% on the high dose and 33% on placebo, so neither dose clearly helped. Eye irritation was uncommon and similar in all three groups (5% to 8%).

Methods. Randomized 1:1:1, double-blind. Primary outcome: improvement of at least 10 points on a 0 to 100 dry-eye symptom score at week 8; side effects were recorded at each visit.

Results. 40 were randomized to each group. Table 2 Outcomes at week 8 Low dose (n = 40) High dose (n = 40) Placebo (n = 40) Symptoms improved by at least 10 points, n (%) 14 (35) 11 (28) 13 (33) Eye irritation, n (%) 3 (8) 9 (23) 2 (5) Stopped because of side effects, n (%) 1 (3) 5 (13) 0 (0)

Discussion. Neither dose improved symptoms more than placebo, and both were well tolerated. Funding: Glimmerseed Eye Care.
""", "In the one-line table, eye irritation was 9 of 40 (23%) on the high dose, against 3 (8%) and 2 (5%), and 5 (13%) on the high dose stopped because of side effects: the abstract's 'similar in all three groups (5% to 8%)' and the discussion's 'both were well tolerated' are contradicted. The efficacy figures are reported correctly.",
     "one-line flattened three-column table (AskRigor's extraction form) against the abstract (harms)", "central",
     "The answer says eye irritation was 23% (9 of 40) on the high dose, so the claim that irritation was similar (5% to 8%) is wrong.",
     "The answer flags the high dose's stopping for side effects or its irritation without saying the abstract's claim is contradicted.")

pathlib.Path("cases").mkdir(exist_ok=True)
for cid, text in cases.items(): pathlib.Path(f"cases/{cid}.md").write_text(text)
pathlib.Path("key.json").write_text(json.dumps(key, indent=1) + "\n")
print(len(cases), "extension cases")
