# Google/YouTube API Services compliance closeout plan

## Objective

Reconcile AskRigor's actual YouTube authentication and data lifecycle with its
repository controls, live Privacy Notice, and response to Google's review.
Preserve the server-side API-key architecture unless direct evidence shows an
end-user Google/YouTube OAuth path.

Baseline: `origin/main` at
`0f140272208d4698d531fc78ba0728194394d7f6`.

## Active requirements

- Inspect source, GitHub history, production configuration, running services,
  persistence, logs, and accessible Google Cloud projects without exposing
  credentials or private content.
- Distinguish Auth0 resource-server authentication from Google/YouTube OAuth.
- Trace `search.list`, `videos.list`, `commentThreads.list`, and
  `comments.list` fields through process memory, client responses, controller
  checkpoints, databases, logs, and backups.
- Correct the smallest causal implementation or disclosure defect. Do not add
  a fictitious OAuth revocation flow or weaken existing privacy gates.
- Validate on Node 24.18.0, deploy through the transactional public-site path,
  and verify the public URLs independently.
- Preserve an audit receipt and a paste-ready Google response without secrets.

## Active lesson contract

| Lesson | Trigger | Required behavior | Failure condition | Enforcement |
| --- | --- | --- | --- | --- |
| Exact current evidence | Compliance claims can drift from source or production | Tie every claim to current source, runtime, Cloud Console, or live-page evidence | A conclusion rests only on an old receipt or summary | Semantic + audit table |
| Bounded provider validation | A real YouTube call uses a credential and quota | Keep the call opt-in, minimal, sanitized, and outside hermetic CI | A secret, raw body, or uncontrolled call enters CI or the audit | Mechanical tests + changed-line scan |
| Public read-only safety | Read-only calls still expose public personal data and consume quota | Preserve early bounds, sanitized errors, no request/provider-body logs, and truthful partial states | A gate is weakened or logs/persistence gain raw payloads | Focused tests |
| Release-bound verification | The response cites a public policy | Deploy only reviewed bytes with rollback, then fetch the HTTPS pages independently | Local files are treated as live evidence | Site deployment tests + live byte/content checks |
| Owner-outcome completion | Passing tests alone does not answer Google | Complete architecture evidence, remediation, deployment, and exact response draft | Work stops at diagnosis or local green tests | Final audit receipt |

## Work sequence

1. Establish repository and Google review history, credential types, project
   inventory, endpoint set, and exact normalized fields.
2. Inspect the live container, non-secret environment shape, mounts, encrypted
   session store, databases, Docker/Caddy logging, and backup configuration.
3. Prove the source-to-storage graph with focused tests and identify factual
   gaps between implementation and disclosures.
4. Repair only verified gaps, update the Privacy Notice/data map/audit, and add
   regression tests for authentication, retention, persistence, and logging.
5. Run focused tests, site gates, `git diff --check`, and full `npm run verify`
   using Node 24.18.0.
6. Push a same-scope pull request, obtain green required checks, merge if policy
   permits, deploy the exact merged static site with rollback, and verify live
   Privacy, Terms, and Support pages.
7. Record final production and Google Cloud evidence and prepare the exact
   response in Google's requested order. External sending remains outside this
   task; the response is delivered to the owner ready to paste.

## Current evidence and open questions

- Production runs a healthy container from source commit
  `bfc2918476d2c4d5ae9b01df6c3a603fd3418596`; its YouTube request, session,
  and logging implementation is byte-equivalent to current `main` in the files
  inspected so far.
- Production has `YOUTUBE_API_KEY` configured. Its only configured OAuth issuer
  is the AskRigor Auth0 tenant; the credential-name inventory contains no
  Google OAuth client secret, authorization code, refresh token, or YouTube
  scope.
- Google Cloud project `askrigor-youtube` is project number `927421077304`, has
  YouTube Data API v3 enabled, has one API key, and has no OAuth clients or
  service accounts. Secure in-place comparison proved that this is the current
  production key. The current key is now restricted to the production IP and
  YouTube Data API v3, and all four official request types pass afterward.
- An archived AskRigor runtime key matched historical project
  `1000928389599`. It had no September 1–8 traffic and was deleted on September
  8 with Google's 30-day recovery window. The unrelated backup desktop OAuth
  client in that project was not changed.
- The live Privacy page already has the August 27 public-data/no-YouTube-OAuth
  disclosure. It trails current `main` only in later non-YouTube owner-review
  wording.
- The encrypted checkpoint has 72-hour idle and seven-day absolute expiry and
  excludes raw comments/provider bodies by strict state schema. The separate
  raw evidence cache was process-only and LRU-bounded but lacked a time TTL and
  normal finalization release. The candidate now enforces 72-hour idle and
  seven-day absolute expiry, hourly pruning, and successful-finalization
  release; the file store now prunes on startup and hourly while running.
- Focused application/site/deployment tests pass. The complete suite passes
  serialized with 1,840 tests passed and six skipped. Two default-parallel
  local runs exposed only host-load timeouts in unrelated tests that pass in
  isolation; the clean GitHub runner will execute the exact default gate.
