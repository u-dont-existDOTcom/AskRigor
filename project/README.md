# Install the AskRigor conversation files

These source-controlled files serve two distinct ChatGPT installation surfaces.
Updating GitHub or the MCP server does not update an existing ChatGPT Project automatically, and it does not update an existing Custom GPT automatically.

`AGENTS.md` and `CODEX-CURRENT-STATE.md` are repository-control files, not ChatGPT installation inputs.

## ChatGPT Project with MCP

1. Open the AskRigor Project and replace its ChatGPT Project instructions with the complete contents of `PROJECT_INSTRUCTIONS.md`.
2. Add `FORUM_SIGNAL_MODULE.md` to the Project's files or knowledge so the router can load it when Forum Signal is required.
3. After the new MCP server is deployed, refresh the AskRigor developer-mode connection so ChatGPT discovers `survey_youtube_community` and `audit_youtube_video_community`.

This MCP Project package is the read-only research integration. The lesson submission Action is not an MCP tool, and refreshing the developer-mode MCP connection does not install a Custom GPT Action.

## Custom GPT with the lesson Action

In the Custom GPT editor, install the separately configured AskRigor Action from
its OpenAPI document and add the complete `PROJECT_INSTRUCTIONS.md`,
`FORUM_SIGNAL_MODULE.md`, and `LESSON_CAPTURE_MODULE.md` instruction set. Action authentication and import are separate from the MCP Project connection. The lesson module alone does not create or authorize the Action.

After changing either installation, start a new chat. Existing chats do not acquire the new standing-consent behavior, and consent from an old chat never carries into a new one.

ChatGPT remains the reasoning engine. AskRigor MCP supplies deterministic
read-only retrieval and stateless continuation; only the separately installed,
consequential Custom GPT Action can submit an anonymized lesson candidate.
