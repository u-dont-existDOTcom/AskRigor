# Install the AskRigor conversation files

These source-controlled files serve two distinct ChatGPT installation surfaces. Updating GitHub or the MCP server does not update an existing ChatGPT Project automatically, and it does not update an existing Custom GPT automatically.

`AGENTS.md` and `CODEX-CURRENT-STATE.md` are repository-control files, not ChatGPT installation inputs.
`CUSTOM_GPT_CONTROLLED_INSTRUCTIONS.md` is the dedicated Custom GPT generator source. `CUSTOM_GPT_ACTION_MODULE.md` is retained for historical/technical MCP projection context; neither is pasted separately into the editor.

## ChatGPT Project with MCP

1. Open the AskRigor Project and replace its ChatGPT Project instructions with the complete contents of `PROJECT_INSTRUCTIONS.md`.
2. Add `FORUM_SIGNAL_MODULE.md` to the Project's files or knowledge so the router can load it when Forum Signal is required.
3. After the new MCP server is deployed, refresh the AskRigor developer-mode connection so ChatGPT discovers `survey_youtube_community` and `audit_youtube_video_community`.

This MCP Project package is the read-only research integration. The lesson submission Action is not an MCP tool, and refreshing the developer-mode MCP connection does not install a Custom GPT Action.

## Custom GPT with research and lesson Actions

In the Custom GPT editor, copy only the generated
`../docs/custom-gpt-instructions.md`, keep Knowledge empty, and import
`https://mcp.askrigor.com/actions/openapi.json`. The generator projects the
dedicated controlled instruction source and exactly four authenticated research
operations plus the consented lesson write. Low-level research operations stay
inside the server and the 21-tool MCP catalog. Action authentication and import are separate from the MCP Project connection. The generated instructions alone do not create or authorize an Action.

After changing either installation, start a new chat. Existing chats do not acquire the new standing-consent behavior, and consent from an old chat never carries into a new one.

ChatGPT performs only the exact bounded semantic work package returned by the
controller. AskRigor owns retrieval, session advancement, and finalization;
only the separately installed consequential lesson Action can submit an
anonymized lesson candidate.

These conversation files route work but do not replace or summarize the complete
canonical `../protocols/HRP_Full.xml` or
`../protocols/Universal_Instructions.xml`. Current explicit owner correction
and those complete files remain authoritative over Project text, manifests,
release records, checkpoints, or lessons.
