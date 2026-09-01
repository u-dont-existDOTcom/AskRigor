# Zero-spend ChatGPT MAST operational smoke receipt

Date: 2026-09-01

Directive: `askrigor-zero-spend-chatgpt-mast-operational-smoke-v1`

Completion claim: `SUBTASK_COMPLETE_PARENT_OPEN`

## Boundary

Exactly one predeclared MAST NOHARM pilot case family (`All001`, eleven
variants) was exercised. Two response packets used identical common payloads;
the audited differences were limited to the BARE/HRP condition instructions and
necessary opaque packet identifiers. The outputs were then randomized under a
preserved seed and sent to a separate condition-blind evaluator chat.

No provider API credentials, paid model API calls, external submissions, HRP
tuning, or owner relay were used. Total external spend was USD 0.

## Source-bound chats

| Role | Condition | Mode | Source message | Exact output SHA-256 |
| --- | --- | --- | --- | --- |
| [Response](https://chatgpt.com/c/6a9748bc-4cc8-83ea-9fe2-e22898877d85) | BARE | Extra High | `1352d0c7-67fb-4ac2-8aa6-5f36d9756ef1` | `ca177655f219634377e56f688072f1c94c653f44b77f6ff7fcb11da9b15ad585` |
| [Response](https://chatgpt.com/c/6a9748a4-9bc0-83ea-a5e3-872e1e959543) | HRP | Extra High | `ed4fd149-c28e-4576-8e9f-5914028b8b15` | `d8ec575e4599c46694d53e49c1af790663e13c214102222d39f2d307d0875b8a` |
| [Evaluator](https://chatgpt.com/c/6a974a63-b9f8-83ea-b8d8-3ab86416b291) | condition-blind | Extra High | `1582b411-4599-4e2f-b2c4-209dcb046b73` | `68608e5e50abc222067946f371b6aecdb48450ed118e200e928e0d6dffa35c55` |

The exact outputs and condition map are retained only in the private mode-0600
artifact directory. The evaluator verdict was frozen before the condition map
was disclosed.

The factual return packet was routed automatically to the
[Project Manager Chat](https://chatgpt.com/c/6a974f49-19b4-83ea-becf-2974dde6fc66)
as source message `b1eefa1f-e605-42c7-8a72-6013ddf38fd3`. Its exact packet
SHA-256 is
`71798f68d9874f3b3720706fbadb01917ef9f379041c4200406a73a6bfd5348a`.

## Adequacy states

- Operational alignment: accepted. The deterministic receipt schema and
  repository acceptance gate passed for the one-family, zero-spend smoke.
- Scientific adequacy: reserved for the Project Manager Chat. Codex made no
  scientific interpretation, comparison, MAST-performance claim, or general
  HRP-effect claim.
- Release adequacy: not applicable. This slice changed evaluation tooling and
  receipts only; it did not change or deploy the AskRigor product, backend, or
  Custom GPT.

## Verification

Evaluated source head:
`4e293fbd563c99a3d439313f4d37e82f0899a8e3`.

- `npm run verify`: pass under Node 24.18.0.
- Vitest: 138 files passed, 1 skipped; 1,665 tests passed, 6 skipped.
- TypeScript build: pass.
- `scripts/accept-zero-spend-chatgpt-mast-smoke.mts`: returned
  `ZERO_SPEND_CHATGPT_MAST_SMOKE_ACCEPTED` for `All001`.

The machine-readable source receipt is
[`2026-09-01-zero-spend-chatgpt-mast-smoke-receipt.json`](./2026-09-01-zero-spend-chatgpt-mast-smoke-receipt.json).
