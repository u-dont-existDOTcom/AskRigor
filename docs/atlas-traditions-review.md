# Label findings for Traditions

Owner answer 403 1b 2a, 22 November 2026. The Traditions pages can show important findings even when well known.
Health keeps its existing bar. Labels neither publish a finding nor change its Health placement. Hidden, withdrawn,
erased or research-only findings stay off the lists. A section with nothing in it still has a page.

Use the owner reviewer login and `review_research_contribution`. These are runtime actions; the tool list stays fixed.

- `list_traditions` takes no further input. It lists section keys and descriptions, labels and disagreements.
- `label_traditions` takes `later_inputs.traditions`: up to 200 entries of `{item, labels}`. `item` is a shown
  publication's P-number or an accepted finding's F-number. Each entry replaces all labels for that item. Give
  `labels: []` to remove them. Other items keep theirs. A finding can have one label per section, in several sections.
  A P-number's label takes precedence over its F-number's label for the same section.
- Each label has `section`, `tradition` (up to 160 characters), optional `region` (80) and `preparation` (120),
  `modern_check`, `match` (120), `list` and `quick_answer_misses` (true or false). Name the text, school, lineage,
  regional or household practice, or modern standardized version. Label Siddha as its own Tamil system.
- `list` is `useful`, `correction` or `untested`. Each list puts findings marked `quick_answer_misses: true` first,
  then uses the Atlas's strength order, then newest. Set the mark when a quick AI answer misses or gets the finding
  wrong. Its words on the page are “A quick AI answer misses this”. Well-known findings can remain unmarked.
- Optional `later_inputs.tradition_disagreements` replaces the whole disagreement list with
  `[{tcm_item, ccm_item, line}]`; give `[]` to clear it, or omit it to leave it alone. Use P- or F-numbers, with a
  line under 200 characters. Both findings must still show in their respective TCM and CCM sections for the line and
  its two links to appear. No other section shows this list. Labels and disagreements save together or not at all.

The modern check's values and words are:

| Value | What readers see |
| --- | --- |
| `supports` | supports it |
| `corrects` | corrects it: right idea, wrong dose, form or people |
| `contradicts` | contradicts it |
| `mixed` | mixed |
| `too_little_evidence` | too little evidence |
| `not_tested_as_used` | not tested the way the tradition uses it |

`match` says how closely the tested form matches the traditional one, for example “tested as the tradition uses it”
or “tested only as a modern extract”. Do not force mixed or thin evidence into a yes or no.

For blessed or religious preparations, give the tradition's own account respectfully. The modern check covers only
what studies can test: what the preparation contains, including contaminants, and measurable health claims. Say
plainly that a blessing's spiritual effect is outside what studies can test. Set that wording in the reviewed text;
code does not judge religious claims.

Pages: `/atlas/traditions` and `/atlas/traditions/<section>`. Each short entry links to the full finding, where its two
reviewed lines appear once per section. The reports box uses the Atlas's existing report form and privacy rules.
To add a section, add one entry to `apps/research-mcp/src/atlas/traditions-tree.ts`; routes, input validation and pages
read that list.
