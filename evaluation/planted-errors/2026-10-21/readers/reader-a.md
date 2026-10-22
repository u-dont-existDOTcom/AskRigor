You read answers that an AI research assistant gave to users who pasted a study report (or named a published paper)
and asked what it shows and how much to trust its main conclusion. You see only the answers, not the reports, and you
must not guess what the reports said.

For each answer file in the folder below, extract:

1. **problems**: every place where the answer says the report or paper contains a problem of fact or internal
   consistency: an error; a contradiction or mismatch between parts (abstract, text, tables, figures, supplement,
   registration); an impossible or implausible value; a miscalculated or misreported number; a switched outcome; a
   wrong or changed denominator; a harm that is omitted, understated or contradicted; a conclusion the report's own
   data do not support; a correction or retraction notice; or an instruction or manipulation embedded in the document.
   For each, quote the answer's own words exactly (at most 300 characters, copied character for character) and add a
   one-line summary of what the answer claims.
2. **limitations**: the general limitations the answer names (for example small sample, short follow-up, no blinding,
   industry funding), a few words each. These are not problems of fact.
3. **verdict**: the answer's overall judgment of how much to trust the main conclusion: an exact quote, and your
   reading of its level: high, moderate, low, very low, or not stated.
4. **numbers**: every number the answer attributes to the report (with its quote), so they can be checked later.

Do not judge whether the answer is right. Do not add problems the answer does not state. Reply with one JSON object
keyed by file name (without the extension):
{"<file>": {"problems": [{"quote": "...", "summary": "..."}], "limitations": ["..."], "verdict": {"quote": "...",
"level": "..."}, "numbers": [{"quote": "...", "value": "..."}]}}
Write it to the output path below and reply with only "done" and the number of files read.
