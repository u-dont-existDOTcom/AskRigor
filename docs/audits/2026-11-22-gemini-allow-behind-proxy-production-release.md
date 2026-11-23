# Production release, 2026-11-22 (release E2: Gemini's sign-in Allow behind the proxy, #514 on #511), with the sign-in step log on

- **Owner decision:** typed in the coordinator session's chat on 22 Nov 2026 at 16:51:20 UTC:
  "402a 403 1b 2a 404a 406 1a 2a 407b 408a 409 1a 2a". This release is 408a: question 408 (owner-pages
  `askrigor/OWNER-QUESTIONS.md#q408`), option a: "Release the second fix, with the sign-in step log on for your next
  try." Covered: merging #514, deploying main's merge of it (with #511, merged earlier the same day, which production had
  not run since release E was rolled back), and adding `ASKRIGOR_GEMINI_OAUTH_DIAGNOSTICS=enabled` to runtime.env. Nothing
  else: no Caddy change, no other setting, no other pull request (#512 and #513 stay unmerged; 407b: the Traditions tab
  is not released now).
- **What changed for people: Gemini's Allow now works behind the proxy.** Production's Caddy sends
  `Referrer-Policy: no-referrer` on every mcp.askrigor.com page, so a browser posts the consent form with `Origin: null`,
  which the same-site check refused (403 right after a good Auth0 login: the owner's Gemini links of 21 and 22 Nov).
  The check now also accepts `Origin: null` when the browser itself marks the request `Sec-Fetch-Site: same-origin`;
  a cross-site request is still refused. Checked from outside through https://mcp.askrigor.com with the headers a browser
  sends; the owner's own Gemini link is the full test, still to come. **The sign-in step log is on for the owner's Gemini
  test and goes off after it.** It records fixed stage and outcome names only (no ids, tokens, addresses or headers).
  Nothing else changed: the same 35 tools, protocols HRP 20.6.45 and Universal 20.5.46, no site, database or plugin change.
- **Contents:** M2 = `9c117aa7344cde90ec8a2ee46a3616d3e8b3f21e`, main's merge of **#514** (merged 16:58:37 UTC at its
  checked head `0f95d4b7`; `apps/research-mcp/src/gemini-sign-in/routes.ts`, `consentPostFromThisSite`, plus tests). Its
  first parent is `fabf1ea2`, main's merge of **#511** (Gemini's sign-in pages set `Referrer-Policy: same-origin`; the
  proxy still replaces it, so #511 alone changes nothing a browser sees), whose first parent is `2975ed0d` (release D).
- **Before deploying:** #514's seven checks passed at `0f95d4b7` (Deterministic verification, CodeQL, four Analyze,
  workflow-policy); no review thread or comment; the private-map check over its commit: nothing to refuse. Main was read
  as `fabf1ea2` two seconds before the merge.
- **Source and image:** image `sha256:e5cddf041189dc6f1be0624245aba0cbdb11f59abeacfeff2ad14d5f6b12b2fc` from `git archive`
  of M2; read-only git: migrations, infra/ (compose 15d3cc3a, both role scripts release b's), site/, ops/, protocols/,
  the plugin's packaged files, the tool-list fixtures, every package.json, the lockfile, every Dockerfile and compose file
  unchanged against 2975ed0d; the image's own code: #511's headers and #514's rule (six cases), and every earlier release's
  probe, passed.
- **Prior state (stage A, 17:01:43 UTC):** research-mcp on `2975ed0d`, healthy; runtime.env and the selector exactly as
  release E's stage A read them (SHA-256 b78e9bdd2429c3ba and 9057acd88cbe99d4; 103 names; no step log line).
- **Switch (stage B, 17:02:53 to 17:03:47 UTC, at 2205 quiet seconds):** rollback tag
  `askrigor-research:rollback-pre-9c117aa7344c` = 2975ed0d's image; rollback folder
  `/opt/askrigor/rollbacks/pre-9c117aa7344cde90ec8a2ee46a3616d3e8b3f21e` with a dump; migrate with nothing new; the role
  scripts re-run with the same bytes; runtime.env's build line only; **research-mcp on M2 from 17:03:40 UTC**, healthy,
  with the same 109 setting names and mounts.
- **Stage C (to 17:06:29 UTC):** /version names M2 with HRP 20.6.45; 35 tools equal the fixture; the three compiled tool
  lists and the 9 site pages unchanged; the probes in the live container passed; the promotion ran once on M2's selector
  and its timer is back on.
- **First acceptance (17:06:29 to 17:07:09 UTC): ACCEPTANCE_OK.** Release E's list without its referrer-policy check
  (the proxy overrides that header) and with the consent POST instead: `Origin: null` with `Sec-Fetch-Site: same-origin`
  answers 400 with AskRigor's "session" page (past the same-site check; only the session is missing), with
  `Sec-Fetch-Site: cross-site` 403. Gemini's four metadata addresses and the resource metadata 200 with issuer
  https://mcp.askrigor.com/oauth/gemini; /mcp/gemini initializes without a token; a made-up token gets 401 naming the
  resource metadata; manifests, user count, signed-out Atlas, D-1001 404, How to research 200; release C's
  `ASKRIGOR_SAFETY_LIMITS=on` and release D's lines kept.
- **Step log on (stage D, 17:07:15 to 17:07:57 UTC, at 2472 quiet seconds):** exactly one line
  `ASKRIGOR_GEMINI_OAUTH_DIAGNOSTICS=enabled` appended; runtime.env kept first as `runtime.env.before-stage-d` in the
  rollback folder; research-mcp recreated on M2 at 17:07:35 UTC, healthy; the setting present in the service (checked
  with `test -n`, never printed).
- **Second acceptance (17:07:57 to 17:08:43 UTC): ACCEPTANCE_OK**, with the step log line and its step lines seen (only
  the checks' own refused-for-no-session requests so far).
- **Plugin:** the installed package (0.1.0+codex.20261106053949.hrp.20.6.40.universal.20.5.46, 8 files, receipt
  23afe4908e5a8425...) equals M2's packaged files, which are unchanged since 2975ed0d: no reinstall. The connector probe
  through the installed app: 35 tools, tool list 0d6016087ee4bc5a, HRP 20.6.45 and Universal 20.5.46 on build M2, no
  out-of-date sentence.
- **The way back:** to release D: the selector and runtime.env from the rollback folder (the build line back to
  `2975ed0d` and the step log line removed), research-mcp recreated on `askrigor-research:rollback-pre-9c117aa7344c`
  (2975ed0d's image): the kit's `rollback.sh`. Only the step log off: `stage-d-undo-host.sh <M2>` (in the host's /root:
  `runtime.env.before-stage-d` back, research-mcp recreated on M2). No database change to undo.
- **Next:** the owner's Gemini test; then the step log off; then the Add page's Gemini section once a link works.
- **Kit:** `/home/joel/askrigor-releases/20261122-release-e2/` (README-RELEASE.md, RESULT.md, every log).
