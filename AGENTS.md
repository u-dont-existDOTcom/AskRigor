# AskRigor lesson-queue checkpoints

Run `npm run lessons:status` using the maintainer's local GitHub authentication:

- at the start of every AskRigor development session;
- before designing a change related to the lesson queue or a relevant lesson category;
- before every release or deployment; and
- whenever the user asks for AskRigor project status.

Report the available result concisely: open candidates, needs review, accepted
but not incorporated, incorporated or closed, deletion eligible, and any
requested relevant-category count. An unavailable result is not a zero count:
report that status is unavailable and its allowlisted reason instead of
inventing queue totals.

Unreviewed lessons cannot silently expand the current task's scope or block an
unrelated release. Bring a potentially critical lesson relevant to the current
work to the user's attention and obtain direction before expanding scope.
