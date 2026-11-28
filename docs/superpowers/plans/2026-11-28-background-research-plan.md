# Background research planning

Owner answer 435a, 28 November 2026 at 09:33 UTC, moves the dev-account planner wait out of plain-answer registration so the AI can load its protocol sections during that time.

- Sign and return the existing plain-answer receipt, with the action and argument for plan retrieval in the first text and `next_step`.
- Run the existing planner with the same inputs, learn-mode history, timeout and retry. Use the same result formatter for the follow-up, including the normal menu, light and aside lanes, Atlas material, and failure guidance.
- Key the handoff by account and receipt in process memory. Share the registration's existing outer deadline with all readers. Expiry and process restart clear the handoff. The signed receipt still supports the manual screen and menu.
- Allow `plan_research` to use the receipt in place of a supplied menu. Apply the regular planning checks to the retrieved menu.
- Publish the same tool schemas. Record `get_research_plan` as an ordinary action and keep the eventual lane on its registration row.
- Use offline tests with a fake clock and deferred planner to cover early registration, ready and waiting readers, expiry, account isolation, restart, and planning without a separate retrieval. Run the frozen-list fixtures and full suite with two workers, then scan the committed range for private-map leaks.
