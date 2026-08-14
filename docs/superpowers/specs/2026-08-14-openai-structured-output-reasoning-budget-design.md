# OpenAI structured-output reasoning budget fix

**Date:** 2026-08-14  
**Branch:** `feature/anonymized-lesson-capture`  
**Scope:** Lesson privacy generalization only

## Problem

The live lesson Action correctly failed closed with
`privacy_service_unavailable` before reaching GitHub. An exact diagnostic of
the pinned `gpt-5-nano-2025-08-07` Responses request returned HTTP 200 but
ended `incomplete` with `max_output_tokens`: all 1,152 generated tokens were
reasoning tokens, with no `output_text` item.

An otherwise identical, non-stored diagnostic using
`reasoning: { effort: "minimal" }` completed with one parseable structured
output, preserved the fixed metadata, used 185 output tokens, and used no
reasoning tokens. No lesson issue was created during diagnosis, and production
was restored to the pre-Action image with Actions disabled.

## Constraints

- Retain the reviewed pinned model and `store: false` boundary.
- Retain strict structured output, pre- and post-model privacy screening,
  metadata preservation, the hard monthly budget, and fail-closed behavior.
- Do not increase GitHub App scope, expose credentials, log model output, or
  change the lesson candidate contract.
- Keep the change limited to this simple privacy classification/generalization
  request.

## Considered approaches

1. **Set minimal reasoning effort — selected.** This directly prevents the
   observed default-reasoning exhaustion and succeeded against the exact live
   request without expanding the token or model boundary.
2. **Increase `max_output_tokens`.** This could allow default reasoning to
   finish, but adds avoidable latency and spend and does not bound how much of
   the allowance reasoning consumes.
3. **Change models.** This would require a broader cost, behavior, policy, and
   acceptance review and is unnecessary for the observed fault.

## Design

Add exactly `reasoning: { effort: "minimal" }` to the Responses API request in
the OpenAI lesson anonymizer. Keep the existing 1,200-token output ceiling and
all response validation unchanged.

The regression test will exercise the real request-construction path through
the injected fetch boundary and require the exact minimal-reasoning parameter.
It must fail against the current implementation before production code is
changed. The minimal production change is then the single request property.

## Verification and deployment

1. Run the focused anonymizer test and record the expected red failure.
2. Add the single request property and rerun the focused test to green.
3. Run the repository's complete deterministic test command.
4. Review the final diff and build a new immutable image from the resulting
   commit.
5. Transactionally deploy only the research service with the protected Action
   state mount; automatically restore the pre-Action Compose/image on failure.
6. Verify health, MCP availability, OpenAPI, unauthenticated denial, and the
   authenticated synthetic Action path.
7. Submit the same synthetic candidate twice. Require one private issue, the
   same public candidate ID, and an incremented anonymous occurrence count.
8. Verify the private issue contains only generalized fields and expected
   metadata/labels, mark it synthetic, and close it.
9. Exercise a non-mutating failure-isolation case and verify that MCP remains
   healthy.

## Rollback

On any failed gate, restore the exact saved pre-Action Compose file, set
`ASKRIGOR_ACTIONS_ENABLED=false`, recreate only the research service, and
verify the prior image is healthy and `/actions/lessons` is unavailable. The
public privacy notice may remain because it truthfully describes an optional
submission path.
