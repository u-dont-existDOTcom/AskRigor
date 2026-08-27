# YouTube identifier-membership terminal-boundary repair

Status: PR #111 merged and exact production/site release verified; preserved
product continuation advanced through the repaired boundary and is now blocked
by observed daily YouTube quota exhaustion

## Observed failure

A controlled production research session repeatedly advanced one selected
YouTube discussion through roughly two dozen continuation segments and then
returned `youtube_video_audit_identifier_membership_restart_required`. The
server restarted only that video as designed, but the replay deterministically
rebuilt the same fixed-size membership filter and stopped at the same
identifier. Repeating the authorized continuation therefore created an
executable restart loop instead of advancing the remaining selected videos.

The production YouTube project retained ample daily and per-minute quota during
the failure. This is a deterministic controller liveness defect, not provider
quota exhaustion.

## Google audit disclosure correction

The live privacy notice already disclosed public YouTube fields, provider
sharing, transient processing, retention, deletion requests, and the no-account
boundary, but it did not link the Google Privacy Policy. The Terms also did not
link YouTube's Terms of Service or state the required agreement. Before release:

1. Link the current Google Privacy Policy from an explicit YouTube API Services
   section and state that AskRigor uses only server-authenticated public-data
   requests, with no user OAuth or Authorized Data.
2. State the no-advertising and no-cookie behavior of AskRigor's static site and
   research API without making claims about separately controlled providers.
3. Link YouTube's Terms of Service and state that users of YouTube-backed
   features agree to be bound by them.
4. Bind those disclosures into the executable public-site validator and tests,
   then deploy and capture readable evidence before any audit submission.

## Governing repair

1. Preserve the fixed-size authenticated membership filter and fail closed on
   an identifier that may already belong to the accepted corpus after the exact
   sample is bounded.
2. Reclassify that deterministic ambiguity as a terminal nonretryable access
   boundary for the affected video. Preserve the last accepted segment index,
   cumulative counts, reply mismatches, and rolling corpus digest; do not count
   the rejected record and do not issue a continuation.
3. Return `completed_with_access_boundary` with `synthesis_lock: pass`, while
   explicitly withholding a complete-corpus claim. The server may use this
   receipt only for bounded non-ranking output.
4. Require the controller to validate an exact no-progress snapshot before it
   records the terminal boundary. A forged, decreased, advanced, or
   continuation-bearing snapshot must fail.
5. Leave migration, invalid, expired, lost-handle, provider-retry, and other
   incomplete states restartable. Do not enlarge the continuation filter or
   token without separate capacity and hostile-size evidence.
6. Prove that the stopped video leaves no executable retry frontier and that
   an independent selected video remains schedulable.

## Verification and release gates

- Add low-level continuation, MCP projection, Action-handle, controller, and
  session-scheduling regressions before implementation.
- Run focused suites, `npm run test:run`, and `npm run verify`.
- Review generated artifacts, public tool/Action inventories, privacy impact,
  and the complete diff. This repair must not change protocol XML, provider
  credentials, the five-operation Custom GPT surface, or the 21-tool MCP
  catalog.
- Open a pull request only after local gates pass. Before release, rerun the
  lesson checkpoint and retain an exact rollback commit/image.
- Deploy only an authorized exact merge, then verify direct controlled
  acceptance, the live manifests/catalog, the installed plugin receipt, and a
  fresh signed-in product continuation.

## Non-goals

- No quota-increase application or provider-account change inside the code
  repair. Postrelease production acceptance separately established a real quota
  need; the external application remains its own reviewed transaction.
- No acceptance of an identifier that may be a duplicate.
- No complete-corpus, effectiveness, ranking, or medical claim from the
  bounded video.
- No persistence of comment text, identifiers, continuation handles, user
  content, or credentials in repository evidence.

## Local verification receipt

- [x] Fail-first continuation, MCP, Action-handle, controller, and independent-
  scheduling regressions added.
- [x] Four affected files pass 106/106 tests together.
- [x] Final complete serial gate passes 106 files and all 1,411 runnable tests;
  six declared live tests remain skipped.
- [x] Typecheck, build, and whitespace/error diff checks pass.
- [x] Public-site validator, 22 page tests, and 28 deployment tests pass with
  the Google Privacy Policy, YouTube Terms, no-OAuth, and agreement disclosures.
- [x] Protocol XML, public Action count, MCP tool count, credentials, privacy
  data classes, and generated product artifacts remain unchanged.
- [x] PR #111 passed hosted checks and merged as `4cf17ae73ad2c2ffcfb55ab7ad8160fd83c86742`.
- [x] Exact backend and site releases pass health, schema, auth, catalog,
  protocol, legal-page, hardening, rollback, and installed-plugin verification.
- [x] The preserved product session crosses the repaired identifier boundary
  and advances 73 consecutive discussion transitions without a restart loop.
- [ ] Finalization remains pending at a genuine daily-quota boundary observed
  at 9,398/10,000 units; no product-acceptance receipt is claimed.

## Production release receipt

- Exact source archive: 549 members, 1,685,909 bytes, SHA-256
  `40f09379e7dfafca94d166fdf468c4a2ca8c2a9f953da86e1082729953182be9`.
- Active image ID:
  `sha256:2a6ac954f85bf3529187bdf7e690f59864e954854597f04bc4a68d7d26fb5945`;
  rollback image ID:
  `sha256:b5d90dd0e4dd96a620e7a92614d8e79214c264de7a37869bd1dd0f738ab9495b`.
- Public-site release:
  `/opt/askrigor/site/releases/4cf17ae-20260827-youtube-api-disclosures/site`;
  archive SHA-256
  `8f2eda1b1e73564b32d4ba45a09caaf805a1acb5a60487f99f8f178cb3a151e7`.
- Live catalog: exact 21 tools; Action schema: exact five operations; HRP:
  20.5.23; Universal: 20.5.15.
- Plugin: complete eight-member source and installed receipts pass; seven
  non-manifest members are byte-identical and the installed manifest differs
  only by its intentional cache-buster version.
