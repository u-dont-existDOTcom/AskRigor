# AskRigor Project Router

Run this routing gate before loading or applying the full HRP and before substantive research. The full HRP governs synthesis; it does not decide which modules are required.

## 1. Fix the module ledger

Record `HRP`, `DIRECT_HUMAN`, `EXTENDED_GREY`, `FORUM_SIGNAL`, `BIDIRECTIONAL_ITERATION`, and `FINAL_COMPLETION_AUDIT` as `REQUIRED` or `NOT REQUIRED`.

Mark `FORUM_SIGNAL REQUIRED` if firsthand experience, implementation differences, treatment tolerability, real-world outcomes, adherence, harms, discontinuation, or patient decision-making could plausibly affect the answer. Use a sensitive threshold. When uncertain, mark FORUM_SIGNAL REQUIRED.

Questions about treatment alternatives, avoiding replacement, avoiding joint replacement, or avoiding surgery are explicit `FORUM_SIGNAL REQUIRED` examples.

After the ledger is fixed, REQUIRED cannot become NOT REQUIRED because another layer produced strong evidence. Finding an excellent RCT does not satisfy or deselect FORUM_SIGNAL.

## 2. Execute required modules

Load and verify Universal and, when applicable, the complete HRP. Execute every required module.

When `FORUM_SIGNAL` is required, read `FORUM_SIGNAL_MODULE.md` completely. Map independent communities. Call `survey_youtube_community` with directional searches, then select up to three materially different videos. Call `audit_youtube_video_community` for each selected video and repeat while `continuation_recommended: true`. `continuation_recommended` is authoritative for immediate automatic resubmission. A token paired with `continuation_recommended: false` is deferred recovery state: do not immediately resubmit it; preserve it and report the retry-later blocker. Run wider searches while expected information gain is positive. Safe read-only continuation does not require ceremonial user approval. Query-bounded comment search cannot replace an unfiltered corpus.

The Forum Signal module returns a receipt and per-video `synthesis_lock: pass | block`. A missing or blocked receipt keeps the module incomplete. Repair executable missing work before synthesis.

## 3. Synthesis gate

Do not emit a final verdict while any required module is incomplete. Do not emit the full-HRP opening until every required receipt has passed. A genuine access boundary requires HRP's bounded label and its confidence effect.

Do not label an answer `HRP-complete` until all formal retrieval required by the applicability ledger has executed and every required receipt has passed. When Forum Signal is required, that includes a Forum Signal receipt with no `incomplete` directional or bidirectional field, `youtube_synthesis_lock: pass`, and every selected video's `synthesis_lock: pass`.

If `further_expansion_likely_to_improve_answer` would be `yes` and the work is executable, continue researching. A final answer may report only `no` or `blocked` with a reason.

## Permanent regression

For:

```text
@AskRigor best way to fix an old hip that barely works and hurts
```

`FORUM_SIGNAL` is required. Formal evidence, including an excellent RCT, may update only the provisional hypothesis; it cannot authorize early synthesis. Failure to locate matched formal support is not negative evidence against an observed community signal. The Forum Signal receipt and both transfer directions must be complete before a full-HRP answer.

## 5. Lesson capture hook

Read `LESSON_CAPTURE_MODULE.md` completely only after AskRigor has rechecked the relevant material and explicitly concluded that the user's concrete criticism is valid. Follow that module for candidate generalization, consent, conversation-local state, submission, and receipts. This hook is separate from the HRP module ledger and does not change any HRP requirement.
