# Treatment-landscape deployment and installation plan

**Goal:** Carry the merged treatment-landscape repair through exact production
deployment, installed-plugin synchronization, Custom GPT editor installation,
and fresh product-interface acceptance without conflating those surfaces.

## Authority and starting state

- Owner standing instruction on 2026-08-22: continue authorized product work
  through Custom GPT installation and always ensure the plugin is current.
- Canonical source and deployed baseline: AskRigor `main` PR #54 merge
  `6d8ae92943fb2ae875b055221d85b146713e2aed`.
- Previous treatment-landscape implementation boundary: PR #49 merge
  `458190ab1be0849fba3f5193d59321a9c7f0d8df`; the generic Spark
  candidate-quality repair supersedes its release artifact before deployment.
- Current production image:
  `askrigor-research:6d8ae92943fb2ae875b055221d85b146713e2aed`,
  image ID
  `sha256:a0e98726a32b81d8e0de4c0171f06c2460f2fe2303bc03d0942c70306d98f17a`.
- Current live HRP: 20.5.20, SHA-256
  `803060fb07fb0ed9198c066db9c3dbbc7579395833485b35d59730cfcc5b5f23`.
  Universal remains 20.5.14.
- The connected AskRigor app exposes the intended frozen 17-tool MCP catalog
  and current live manifests. The personal plugin is synchronized and
  reinstalled as `0.1.0+codex.20260822072920`, with matching source and installed
  package SHA-256
  `d196d783895e3ed093e33f6779b91ae9bb4bdafb3550de327c5f91a9643876c6`.
- Target Custom GPT packet: 7,946-character Instructions SHA-256
  `019277ee0b3943c85bf70f521b1a28069f5e7fed9a9c1d9223527b5cd469a532`,
  21-operation OpenAPI SHA-256
  `280a26ddbcd512357f12733f896cd32b166102d45524492642618a403c0f5540`,
  and empty Knowledge.

## Completion gates

1. Merge this standing release/plugin synchronization rule through reviewed
   GitHub checks so the deployed commit is recoverable from default-branch
   state.
2. Run the complete deterministic, site, deployment-policy, and lesson-status
   preflight on the exact release commit.
3. Build a secret-free Git archive named by the exact release commit; verify
   digest and membership before transferring it.
4. On the VPS, preserve the current image and Compose file as concrete rollback
   points, build the exact new image, run a disposable hardening/health/contract
   gate, and recreate only the research service.
5. Verify the exact image/container, loopback/public health, 21-operation
   OpenAPI, HRP 20.5.20 and Universal 20.5.14 manifests/integrity, Action auth
   boundaries, logs, and rollback state.
6. Verify the connected app has exactly 17 MCP tools, the current live
   manifests, and a successful read-only probe. Separately compare an exact
   installed-package receipt covering `plugin.json`, `SKILL.md`, and packaged
   assets/inventory with the reviewed source package. If installed bytes cannot
   be read back, preserve a non-secret package/registration receipt and rollback
   path, mark currency unverified, and reinstall the exact reviewed package.
   Use `npm run plugin:receipt` on both source and installed paths; require the
   aggregate digest and every inventory member digest to match.
7. Use an authenticated browser/editor surface if available: replace all
   Instructions with the exact generated artifact, keep Knowledge empty, import
   the exact live schema, retain API-Key/Bearer auth and privacy URL, save, and
   verify the persisted configuration before closing the editor.
8. Start a fresh GPT chat and run the bounded synthetic acceptance cases for
   protocol loading, treatment-space coverage, distinct-program rendering,
   plain-language status translation, compact citations, transcript access,
   and the lesson-consent safe boundary.
9. Record sanitized deployment/plugin/editor/UI receipts, rerun applicable
   gates, merge the evidence PR, and verify exact post-merge workflows.

## Current completion state

- [x] PR #54 merged after all required checks passed.
- [x] Complete deterministic, site, deployment-policy, and lesson preflight
  passed.
- [x] Exact 401-member secret-free merge archive was verified and transferred.
- [x] Production rollback was armed and only `research-mcp` was recreated.
- [x] Public health, 21 Actions, 17 MCP tools, exact protocols, auth boundaries,
  and a bounded real-identity Spark packet passed.
- [x] Personal plugin source and installed package match byte-for-byte after
  reinstall.
- [ ] Install the exact Instructions and live schema in the Custom GPT editor,
  keeping Knowledge empty.
- [ ] Upload the exact Spark scout skill and run fresh product checks.
- [ ] Merge the final installation/UI evidence after those owner-observed steps.

## Rollback and stop conditions

- If the disposable image fails, do not activate it.
- If post-activation direct checks fail, restore the saved Compose file and
  rollback image, recreate only the research service, and verify recovery.
- Do not print or copy runtime/editor credentials, cookies, storage, private
  lesson content, provider bodies, or authenticated response bodies.
- If no authenticated editor-control capability exists, complete deployment
  and plugin verification, open the exact editor target if possible, preserve
  installation as blocked rather than inferred, and identify the one required
  owner interaction. Continue automatically as soon as that surface becomes
  available.
- Do not publish or alter public visibility unless separately required by the
  existing accepted publication state; installation and save come first.

## Preflight receipt

- Read-only VPS check on 2026-08-22 confirmed the documented host, healthy
  production research and Caddy containers, root-owned `0600` runtime
  environment, and 92 GB free capacity. Deployment and direct acceptance then
  produced the exact receipts in `docs/custom-gpt-action-live-acceptance.md`.
- Connected-app readback exposed exactly 17 AskRigor tools. Direct runtime
  checks returned HRP 20.5.20 plus Universal 20.5.14, and the personal plugin
  reinstall produced matching source/installed package receipts.
- Lesson checkpoint at `2026-08-22T05:28:10.089Z`: 1 open, 1 needing review, 0
  accepted but not incorporated, 3 incorporated or closed, 0 deletion eligible.
  The unreviewed candidate is unrelated and does not expand this release.
