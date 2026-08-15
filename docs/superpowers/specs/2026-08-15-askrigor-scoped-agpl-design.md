# AskRigor Scoped AGPL Licensing Design

Date: 2026-08-15

## Decision

The owner approved `AGPL-3.0-or-later` for AskRigor software while retaining
separate control of complete protocols, health-research policy, research and
release evidence, fixtures, site editorial/legal content, and archived or
third-party material.

The license change controls reuse outside the canonical repository. It does not
grant anyone GitHub write or merge access and does not amend protocol authority.

## Boundary

Unless a file carries a separate notice, the AGPL grant covers the repository
except these reserved path classes:

- `protocols/`;
- `project/`;
- `docs/`, except the generated software-interface files
  `docs/custom-gpt-action-openapi.json` and `docs/tool-inventory-v0.1.0.json`;
- `site/`;
- `tests/fixtures/`; and
- `tools/`.

Reserved material receives no new license grant. Third-party material retains
its existing rights and notices. Exact complete protocol bytes remain
authoritative only through the existing AskRigor authority chain.

## Artifacts

- `LICENSE.md` is the human licensing map and scope notice.
- `LICENSES/AGPL-3.0-or-later.txt` is an unmodified copy of GNU's official
  AGPLv3 text, retrieved from `https://www.gnu.org/licenses/agpl-3.0.txt`.
- `tests/license-posture.test.ts` checks the scope boundary and official-text
  SHA-256 without attempting legal interpretation.

## Documentation and continuity

README and contribution guidance will identify the scoped grant. The canonical
current-state checkpoint and compliance report will record the owner decision,
exact validation, and the fact that no protocol or research content was
relicensed.

## Limits

The repository test proves file presence, exact license bytes, and the declared
scope strings. It does not offer legal advice, determine copyright ownership of
third-party material, or establish that every downstream operator complies with
AGPL. Any broader license, protocol-content license, trademark permission, or
change to the reserved paths requires a new explicit owner decision.
