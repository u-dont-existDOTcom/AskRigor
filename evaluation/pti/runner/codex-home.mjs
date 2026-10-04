// A clean Codex home for PTI runs and judgments: a minimal config.toml and a
// link to the owner's existing ChatGPT login, nothing else. Node built-ins only.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Even a fresh home syncs the account's ChatGPT apps and remote plugins (on
// 2026-10-04 that included the AskRigor development plugin), so they are
// switched off, with the browser, computer-use, image and agent features a
// plain chat lacks.
export const DISABLED_FEATURES = [
  "apps", "plugins", "remote_plugin", "plugin_sharing", "browser_use", "browser_use_external",
  "browser_use_full_cdp_access", "computer_use", "in_app_browser", "image_generation", "multi_agent", "goals",
  "skill_search", "skill_mcp_dependency_install", "tool_suggest", "memories"
];

/** Creates the scratch folder, home and empty workspace; returns their paths and the child environment. */
export function createCleanCodexHome({ model, effort, webSearch }) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "pti-codex-"));
  const home = path.join(scratch, "codex-home");
  const workspace = path.join(scratch, "workspace");
  fs.mkdirSync(home, { mode: 0o700 });
  fs.mkdirSync(workspace);
  const userHome = process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex");
  const login = path.join(userHome, "auth.json");
  if (!fs.existsSync(login)) throw new Error(`No Codex login at ${login}; sign in to Codex first.`);
  fs.symlinkSync(login, path.join(home, "auth.json"));
  const config = [
    `model = ${JSON.stringify(model)}`,
    `model_reasoning_effort = ${JSON.stringify(effort)}`,
    `web_search = ${JSON.stringify(webSearch ? "live" : "disabled")}`,
    "",
    "[features]",
    ...DISABLED_FEATURES.map((name) => `${name} = false`)
  ].join("\n");
  fs.writeFileSync(path.join(home, "config.toml"), `${config}\n`);
  // API keys never reach the child, so Codex uses the ChatGPT login.
  const env = { ...process.env, CODEX_HOME: home };
  for (const name of Object.keys(env)) {
    if (/^(OPENAI_|ANTHROPIC_|CODEX_API_KEY$)/u.test(name)) delete env[name];
  }
  return {
    scratch,
    home,
    workspace,
    env,
    remove: () => fs.rmSync(scratch, { recursive: true, force: true }),
    describe: () => ({
      clean: true,
      disabled_features: DISABLED_FEATURES,
      plugins_synced: fs.existsSync(path.join(home, "plugins")),
      files: fs.readdirSync(home).sort()
    })
  };
}
