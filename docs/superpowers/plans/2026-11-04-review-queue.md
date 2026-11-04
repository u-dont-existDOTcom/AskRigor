# A review queue for cards that weren't saved, and the lanes' review

The owner, 4 November 2026: "can we make sure that when a finding is not accepted, it's put into a review queue anyway to
check it so we don't lose findings on technicalities?", and "GPT pro gave some good suggestions on your prompt".

## Why

A lane's fluvoxamine finding was refused twice. The refused card was reported to the lane and then forgotten: nothing
stored its text, and the server logs almost nothing, so no one could read what it said or why it failed. The card check
is about a card's form, so a refusal says nothing about the finding's worth.

## Where it goes

An issue in the private findings repository, labeled `unsaved-card` alone. That needs no migration, role or review action,
and it fits the privacy notice as it stands: saved cards go to the same repository for the owner's review, and their
`ARF-####` id lets a person ask for deletion. A database table was the other choice. It would survive GitHub failing,
but it needs a migration, two role scripts and new review actions, for a failure that is rare and retried anyway.

No card list reads the label, so the publisher, the replacement rule and the owner's lists never see it. The reviewer
reads the list in GitHub.

## What is kept

- A card the final check refused; a card that didn't read as one, as the call gave it; a checked card whose answer hadn't
  passed; a card whose save failed. Not a card saved, a save that may still finish, a card declared personal only, a paid
  private account's card, or a dev account's with saving off.
- The copy passes the screens a saved card does. It is written to work on any shape, since a card that doesn't read is one
  of the cases. See `apps/research-mcp/src/findings/unsaved-card.ts`.
- An open step of the answer goes by its kind, because a step can quote the answer, and the answer is never stored.

## Noise

A lane fixing a card makes several refused versions. Each distinct card gets one issue, and the same card again writes
nothing. A card saved later from the same research closes each copy whose every claim it carries, compared exactly. A copy
with a finding that was dropped or reworded stays open on purpose: dropping the finding to pass the check is the loss the
owner asked to stop. Closing runs after the save has answered, so it never slows or fails one.

## What it doesn't change

- The six blocking checks: a kept copy changes no status and adds no step.
- The tool list: `saved.reason` is free text, and the note and line use fields that exist.
- A rescue goes through the final check again, so nothing unverified reaches a page.

## GPT Pro's review

All six points went into the lane message (owner-pages `askrigor/nine-lanes-paste-in-2026-11-04.txt`). Two reached the
method too: the quick-answer test fails a finding only when the quick answer already gives its useful point, not on a
mention, and it doesn't fail one for weak evidence. HRP 20.6.38 carries the first in FindingsCardForAPerson. Reading that
rule again also showed that its last line still described replacement as it was before #411, so it changes too.

## Before a release

1. The owner names the release of this PR (question 242).
2. Create the `unsaved-card` label in the findings repository before the switch: an issue filed with a label that doesn't
   exist may lose it, and the queue finds copies by the label.
3. HRP 20.6.38's manifest, plugin and connector receipts as for #411. No migration, no role script, no tool-list change.
4. After the switch, one refused card through a dev account with saving on, read back from the list and closed by hand.
