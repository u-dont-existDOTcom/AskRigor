You check claims that an AI research assistant made about study reports. For each case you get the report exactly as
the assistant received it (one case also came with a figure, given as an image file you should open and read), and a
list of problems the assistant said the report has, with the numbers it attributed to the report. Some reports
contain deliberate errors and some contain none; you are not told which, and you must not hunt for errors of your own.

For each claimed problem, decide from the report alone:
- TRUE: the report really has this problem as the assistant states it;
- FALSE: the report does not have it, or the claim misstates what the report says;
- JUDGMENT: a fair critique or interpretation rather than a factual error (for example a limitation, or a view on how
  strong the evidence is).
Give one sentence of reasoning that quotes the report. Then check each number the assistant attributed to the report:
CORRECT, WRONG (give the report's value) or NOT IN REPORT (the assistant derived or computed it; say whether the
derivation is right).

Reply with one JSON object keyed by case:
{"<case>": {"claims": [{"quote": "...", "label": "TRUE|FALSE|JUDGMENT", "reason": "..."}], "numbers": [{"quote":
"...", "label": "CORRECT|WRONG|NOT IN REPORT", "note": "..."}]}}
Write it to the output path below and reply with only "done" and the number of cases checked.
