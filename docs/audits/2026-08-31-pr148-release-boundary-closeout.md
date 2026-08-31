# PR #148 release-boundary closeout

Date: 2026-08-31

Directive: [AskRigor issue #150](https://github.com/u-dont-existDOTcom/AskRigor/issues/150)

Typed completion claim: **OUTCOME for issue #150 cycle A only**. The broader
AskRigor product outcome remains open, and the local synthetic gap-to-research
loop remains behind the directive's separate Extra High review boundary.

## Outcome

The already-merged PR #148 frontier release is now release-complete. Current
`main@26623f982cca5a1fab23b495959f71b8970ad59f` was built and deployed as an
immutable production image. Production, plugin settings, the installed package,
the controlled Custom GPT editor, protocol manifests, and a fresh primary
ordinary Chat now agree on the governed release. No capability was removed or
consolidated.

The fresh product conversation is
`https://chatgpt.com/c/6a9573d8-19d8-83ea-a450-93d80a52252d`. It ran in ordinary
Chat mode with the AskRigor plugin and the account's Pro reasoning setting (the
owner-identified Extra High equivalent), completed in 2 minutes 4 seconds, and
successfully called operation 22.

## Immutable deployment and rollback

- Source: `26623f982cca5a1fab23b495959f71b8970ad59f`; archive SHA-256
  `d8d6a3726776803bf6db95526887d6ee3862d073dccbc21cbd450f32319b6726`.
- Image: `askrigor-research:26623f982cca5a1fab23b495959f71b8970ad59f`;
  image ID `sha256:5b36557c785738ecc4e57bc63653bbcc2f20bac59a7f3b3235af9a687c2bb40f`.
- Uploaded image archive: 108,832,256 bytes; SHA-256
  `89eadba8d33deb2799639d7a3a152729410e0c1d93580acc2d610a537cafa7ed`.
- Healthy container:
  `4a1ae631dfa7b87dbe6fadc0df32f9b1a973aa5270cc50f201ef5fb32be47d3a`.
  It runs as `node`, with read-only root filesystem, all capabilities dropped,
  and `no-new-privileges`.
- Rollback image: `askrigor-research:rollback-pr148-closeout-26623f9`, exact
  prior image ID
  `sha256:d3be6c3e11dc34146fd9bf38e06bf830ca88fb3df88ce6437395dacb93313443`.
  Compose rollback is preserved under
  `/opt/askrigor/rollbacks/pre-26623f982cca5a1fab23b495959f71b8970ad59f/`.

## Governed-surface synchronization

- Production MCP `tools/list`: 22 exact operations; final operation
  `get_research_frontier`.
- Universal: `20.5.15` / `2026-08-24` /
  `69c5186862ade61d6a97dc842b8c027324c7e2f3fd7147064a360049e0d25172`.
- HRP: `20.5.24` / `2026-08-31` /
  `dd494d5665331e42b91232245dbba0392ecc9918d63b2638ef35c6e7528604d1`.
- Installed plugin: `0.1.0+codex.20260831104512`, eight members, package
  SHA-256
  `fa45c89437048f12c70ad3af90987d451cbcf7b79a059a923d891487d893653d`.
  Complete readback proves all content current; another reinstall was not
  required.
- Plugin settings were explicitly refreshed and displayed all 22 operations,
  with none missing and operation 22 present.
- Controlled Custom GPT editor remained published and last edited August 31.
  Its 4,751-character editor Instructions SHA-256 is
  `8389f4a05544f2e42ec32284c2acf8971db7f745c907200533aaaca706d8f352`,
  exactly the reviewed 4,752-character artifact after the editor's single
  trailing-LF normalization. Its five-operation Action schema matches the
  reviewed source under the same trailing-LF normalization; live and source
  canonical JSON SHA-256 values both equal
  `9bbf7fccdd7e34fb7a2334dab05193f03ba826caf35109adc39320ef48788049`.

## Acceptance

Both direct and fresh ordinary-product checks passed:

- PubMed `40223676`: `api_visible_complete`, one record, exhausted.
- Frontier miss: `not_found` / `not_indexed` / currentness `not_assessed`.
  The product stated exactly that this means no stored frontier matched; it
  does not mean no external evidence exists.
- YouTube video `nIRABXSJwSw`: 65 retrieved, 65 returned for bounded analysis
  (50 top-level and 15 replies), continuation token present,
  `continuation_recommended:true`, completion `incomplete`, and synthesis
  `block`. It prohibited corpus-wide extrapolation and displayed no raw comment
  text.

The authenticated primary-account acceptance used a background Brave extension
tab because a separate headless profile would not share the required signed-in
session. It opened no new visible window and did not navigate any user tab.

## Verification and adequacy

- `npm run verify`: PASS; 118 test files passed, one declared skip; 1,559 tests
  passed, six declared skips; typecheck and production build passed.
- Predeployment and closeout lesson checkpoints at
  `2026-08-31T12:09:52.008Z` and `2026-08-31T12:47:27.385Z`: 0 open, 0 needs
  review, 0 accepted-not-incorporated, 4 incorporated/closed, 0 deletion
  eligible.
- Worker-to-contract: **ALIGNED**.
- Contract-to-owner: **ALIGNED FOR CYCLE A**.
- Operational adequacy: **PASS**.
- Scientific adequacy: **PASS for the bounded partial-corpus and frontier-miss
  semantics only**.
- Release adequacy: **PASS**.

The exact machine receipt is
`2026-08-31-pr148-release-boundary-closeout.json`. No architecture expansion,
new migration, synthetic backend, real health data, scientific conclusion, or
new product strategy was introduced.
