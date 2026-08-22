# Treatment-landscape deployment and installation plan

**Goal:** Carry the merged treatment-landscape repair through exact production
deployment, installed-plugin synchronization, Custom GPT editor installation,
and fresh product-interface acceptance without conflating those surfaces.

## Authority and starting state

- Owner standing instruction on 2026-08-22: continue authorized product work
  through Custom GPT installation and always ensure the plugin is current.
- Canonical source baseline: AskRigor `main`
  `f8427b826b948b6592243f2a0b69a9e751e762cf`.
- Product implementation boundary: PR #49 merge
  `458190ab1be0849fba3f5193d59321a9c7f0d8df`.
- Current production image:
  `askrigor-research:386497415a187354c6396e69a902d5bece9a9c96`.
- Current live HRP: 20.5.18; target HRP: 20.5.19. Universal remains 20.5.14.
- The connected AskRigor app currently exposes the intended frozen 17-tool MCP
  catalog. Its backend is stale until deployment because the live HRP manifest
  is still 20.5.18. The generated remote-app wrapper does not contain the
  repository's `skills/askrigor/SKILL.md`, so source plugin-package currency is
  not yet verified.
- Target Custom GPT packet: 7,991-character Instructions SHA-256
  `9e5e7dab751def42a26ffdf971c666f58ecfc9016b1f0cf27e8846a132f146a9`,
  20-operation OpenAPI SHA-256
  `35a9a2d51a4a3629795ea0224473e6273caf88febbbc0fefbe0095b1e73cc0ce`,
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
5. Verify the exact image/container, loopback/public health, 20-operation
   OpenAPI, HRP 20.5.19 and Universal 20.5.14 manifests/integrity, Action auth
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
  production research and Caddy containers, exact old image, root-owned `0600`
  runtime environment, and 92 GB free capacity.
- Connected-app readback exposed exactly 17 AskRigor tools and returned HRP
  20.5.18 plus Universal 20.5.14. This proves connector/catalog compatibility
  and the backend deployment gap, not source plugin-package currency. The
  installed remote-app wrapper contains no `SKILL.md`; exact source-package
  installation is therefore required after the release commit is reviewed.
- Lesson checkpoint at `2026-08-22T00:27:23.677Z`: 1 open, 1 needing review, 0
  accepted but not incorporated, 3 incorporated or closed, 0 deletion eligible.
  The unreviewed candidate is unrelated and does not expand this release.
