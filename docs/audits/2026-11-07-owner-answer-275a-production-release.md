# Production release, 2026-11-07 (owner answer 275a)

- **Owner decision:** "275a", typed in chat on 7 Nov at about 12:13 UTC in the session that made this release, with
  276a in the same message.
- **Contents:** the public site only, from two merged pull requests:
  - #423: the Support page's Bitcoin address, and the "What's new" lines of the 6 Nov release (merged at 01:11:16 UTC
    as `ac93e5c9`; its own site release waited for this answer);
  - #429: the Support page's "Ask for a bigger research job" section (an email link with a fixed subject and four
    questions, listed on the page too; no form or script), the privacy notice's "Emails, research jobs and payments"
    section (effective November 7, 2026) and one roadmap line.

  No backend, migration, role script, compose file, `runtime.env`, tool list or plugin file changed, so no app needs a
  refresh. The research-use notice's version is separate and didn't change, so nobody is asked to accept it again.
- **Before deploying:** all seven CI checks passed on #429's head `f391f00e`. `npm run lessons:status` ran at 12:15:28
  UTC, just after the release rather than before it: open 42; needs review 5; accepted but not incorporated 1;
  incorporated or closed 41; deletion eligible 0; lane items unrecorded 2.
- **Source:** #429 merged at 12:14:19 UTC as `2dff293bfb2b9b4b3a64e686bb519eb841397ff7`, which holds #423 too.
- **Archive:** made in a checkout of `2dff293b` with its own script, which validated the 8 pages. Its tar equals the
  separately built one (`eef8a8d6cfde3b2ef787c4ab0ffad95d02f0005fb0a2e7113c272384e8760284`); the archive is 323,317
  bytes, SHA-256 `95997b235ad89c6f4bbc82e5f2b82428e3f8d70d758e549013ddb33239e5d790`, checked again on the host; the
  merge's installer has SHA-256 `c7992a2fa69a752456b1fbbf0b54a8ef1126c9c1a77288cc058147b98b945735`.
- **Install (12:15 UTC):** staged root-only on the host; the site before was release `e853e09a`. The installer
  activated release `2dff293b` with the Atlas upstream and the proxy secret read on the host from `runtime.env`, never
  printed or sent to the laptop; the proxy configuration was valid and the proxy recreated; research-mcp stayed up and
  healthy.
- **After (12:15 UTC):**
  - the eight pages and `robots.txt` on askrigor.com equal the merge's files byte for byte; the privacy page reads
    "Effective November 7, 2026" and the terms "Effective November 6, 2026";
  - through askrigor.com the Atlas, its stylesheet, changes, map and sitemap answer 200, the private account page 200,
    an unknown Atlas page 404, sign-in 302 and `/atlasx` 404; the Atlas's security headers are in place and it sets no
    cookie; `askrigor.com/atlas` equals `mcp.askrigor.com/atlas`.
- **Rollback:** reinstall the `e853e09a` site release
  (`/opt/askrigor/site/releases/e853e09a0c008090f5801cad94f1b5979201503d`); the backend doesn't change.
