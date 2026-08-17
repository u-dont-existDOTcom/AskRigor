# OpenAI Action schema compatibility design

## Objective

Make the generated AskRigor Custom GPT Action document importable by OpenAI's
editor without changing MCP behavior, protocol authority, provider semantics,
or the deployed request and response contracts.

## Evidence and root cause

The current generated document includes `components.securitySchemes` but omits
`components.schemas`. OpenAI's importer rejects that shape because it expects
the `schemas` subsection to be an object whenever it evaluates `components`.

The generated descriptions for `get_youtube_comments` and
`audit_youtube_community` are 357 and 493 characters. Repository tests allowed
up to 700 characters, while the importer rejects operation descriptions longer
than 300 characters.

## Approaches considered

1. **Action-boundary compatibility fix (selected):** emit an explicit empty
   `components.schemas` object, keep concise Action-only migration guidance for
   the two legacy YouTube operations, and test every exported operation against
   the 300-character ceiling. This preserves richer MCP descriptions.
2. Shorten shared MCP descriptions. Rejected because the limitation belongs to
   the Custom GPT import boundary and MCP clients need not lose useful context.
3. Truncate descriptions generically in the OpenAPI generator. Rejected because
   silent truncation can cut required operation names or create ambiguous prose.

## Design

`createActionOpenApiDocument` will always emit `components.schemas` as an empty
object beside the existing Bearer security scheme. The two legacy YouTube
Action descriptions will be authored explicitly below 300 characters while
retaining all three routing facts: `action_response_too_large`,
`survey_youtube_community`, and `audit_youtube_video_community`.

The deterministic OpenAPI test will require `components.schemas` to equal an
object and every operation summary and description to be at most 300
characters. The generated packet will then be regenerated from source.

## Verification and limits

Use a red-green regression cycle against the current generator, run the focused
Action/OpenAPI tests, regenerate the checked packet with no unexplained drift,
then run the complete deterministic, site, deployment-policy, and portable
repository-audit gates. Final confirmation still requires importing the live
schema in the user's unpublished Custom GPT editor because OpenAI does not
publish a standalone validator reproducing every editor check.

