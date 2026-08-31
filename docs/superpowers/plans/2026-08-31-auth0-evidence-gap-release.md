# Auth0-backed public evidence-gap release

## Outcome

Release the already-built public self-serve prolactinoma intake and its one
OAuth-scoped owner review tool. AskRigor remains publicly installable: the 22
research tools and contribution form remain anonymous, participant recovery
keys remain case-specific, and only cross-user review requires
`cases:review`.

## Release boundary

1. Configure an Auth0 production tenant as the MCP authorization server using
   its free Auth for MCP capability, the OpenAI CIMD client, PKCE, the resource
   compatibility profile, and issuer identification.
2. Define the `cases:review` API permission, enable Auth0 RBAC, and assign it
   only to the owner reviewer identity. A successful login by another tenant
   user must not receive the review scope.
3. Give the application database role access only to
   `living_evidence.evidence_gap_submissions`; it receives no access to the
   broader research repository and no table-delete or schema-create privilege.
4. Publish accurate public notice text for participant submissions, private
   GPT review, Auth0 owner authentication, storage, withdrawal, and known
   redaction/retention limits before activating the form.
5. Reconcile and merge the stacked PRs in dependency order, preserve exact
   rollback images/configuration, deploy the exact reviewed merge, and enable
   the form and OAuth settings only after database migration and role checks.
6. Verify anonymous research, the public form, participant recovery,
   unauthorized/insufficient-scope review rejection, authorized owner review,
   protected-resource and Auth0 discovery metadata, and a fresh primary
   ChatGPT plugin OAuth flow.

## Non-goals

- No participant account or participant Auth0 login.
- No public raw case directory or public cross-user case retrieval.
- No treatment, diagnostic, causal, or verification claim.
- No generic community feature, institutional program, or recruitment staff
  workflow.
- No Railway database or new hosting platform.

## Evidence and rollback

Record the selected non-secret Auth0 issuer/resource/client-registration
metadata, exact source and image identities, database migration/grant checks,
site and MCP hashes, plugin catalog/package synchronization, direct and
primary-account acceptance, and the exact prior image/configuration rollback
path. Never place Auth0 credentials, access tokens, database passwords,
recovery keys, encryption keys, or participant content in Git or receipts.
