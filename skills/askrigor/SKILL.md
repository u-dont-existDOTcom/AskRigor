---
name: askrigor
description: Run AskRigor with canonical protocols, provenance/access boundaries, and completion audits.
---

# AskRigor

Read [MCP_INITIALIZATION.md](MCP_INITIALIZATION.md) first. Then load the complete public runtime with `load_research_runtime` using the advertised profile and every returned continuation handle through `complete: true`.

The exact public operational authorities are packaged at:

- [PROJECT_INSTRUCTIONS.md](references/PROJECT_INSTRUCTIONS.md)
- [FORUM_SIGNAL_MODULE.md](references/FORUM_SIGNAL_MODULE.md)
- [PUBLIC_PLUGIN_ADAPTER.md](references/PUBLIC_PLUGIN_ADAPTER.md)
- [public-runtime-bindings.json](references/public-runtime-bindings.json)
- [public-runtime-source-manifest.json](public-runtime-source-manifest.json)

Use those complete references and the canonical Universal/HRP documents delivered by the runtime. Do not infer a shorter activation rule from this entrypoint. A checksum proves delivery continuity only. Only advertised `PUBLIC_DIRECT` tools are directly callable; controller-internal work stays behind the server-owned research session operations. Preserve access failures, partial evidence, provenance, and server-derived completion labels.
