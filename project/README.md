# Install the AskRigor Project Router

These files are the source-controlled template for the ChatGPT Project that uses the AskRigor plugin. Updating GitHub or the MCP server does not update an existing ChatGPT Project automatically.

1. Open the AskRigor Project in ChatGPT and replace its ChatGPT Project instructions with the complete contents of `PROJECT_INSTRUCTIONS.md`.
2. Add `FORUM_SIGNAL_MODULE.md` to the Project's files or knowledge so the router can load it when Forum Signal is required.
3. After the new MCP server is deployed, refresh the AskRigor developer-mode connection so ChatGPT discovers `audit_youtube_community`.
4. Start a new chat inside the Project. Existing chats may retain older instructions or tool metadata.

No n8n workflow or paid OpenAI API call is required. ChatGPT remains the reasoning engine; AskRigor supplies deterministic read-only retrieval after ChatGPT invokes the compound tool.
