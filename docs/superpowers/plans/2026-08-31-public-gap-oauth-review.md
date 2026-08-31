# Public AskRigor plugin with scoped case review

## Outcome

Keep the existing AskRigor MCP/plugin public. Public research operations remain
anonymous, and the evidence-gap form remains publicly reachable. Add one
read-only operation that can retrieve the existing private review projection
only when the request carries a validated OAuth access token with
`cases:review`.

The boundary is not whether a plugin may receive private text from its current
user. The boundary is whether it can retrieve durable submissions belonging to
other users.

## Smallest implementation

1. Accept an optional validated OAuth `AuthInfo` on `/mcp` requests without
   requiring login for anonymous operations.
2. Register one read-only evidence-gap review operation whose handler checks
   `cases:review` and reads only the existing review projection.
3. Provide protected-resource metadata for client discovery without creating
   an authorization server or choosing an identity vendor in this slice.
4. Test anonymous public tools, token rejection, scope enforcement, and private
   output boundaries.

## Non-goals

- No invite-only product or institutional program.
- No public participant-case directory.
- No home-grown user/password system.
- No external OAuth-provider account, production deployment, or plugin
  publication in this local iteration.
- No causal analysis or scientific reclassification.

## Assurance

Iteration lane with a targeted authorization/privacy hard gate. Run focused
tests and typecheck/build for affected packages. Full release verification is
deferred until a concrete deployment boundary.
