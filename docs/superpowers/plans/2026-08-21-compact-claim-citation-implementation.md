# Compact claim citation implementation

## Problem

An anonymized lesson correctly requires traceable support for material factual
claims, but an unqualified implementation could make ordinary answers much
longer by repeating prose such as “this claim is supported by.” It could also
reduce clarity by placing several numbered sources after a paragraph without an
obvious claim-to-source mapping.

## Outcome

Make important claims directly auditable without turning citation mechanics
into extra narrative. Apply a materiality threshold, put the hyperlink on the
shortest meaningful claim phrase, label synthesis compactly as inferred, and
allow grouped citations only when their mapping remains obvious.

## Implementation

1. Add a sanitized regression matrix covering directly supported claims,
   inference from one or more sources, low-value connective prose, ambiguous
   citation groups, and unsupported important claims.
2. Add the complete reader-facing citation contract to the Project router and
   Forum Signal module.
3. Add a compact equivalent to the AskRigor skill, regenerate the Custom GPT
   Instructions and synchronization receipt, and keep the Instructions within
   the enforced 8,000-character editor limit.
4. Record the internal citation-density experiment and resulting product
   threshold without retaining private research or chat content.
5. Run focused regressions, the complete deterministic gate, applicable site
   checks, and final diff review.
6. Publish through a task branch and pull request, then disposition ARL-0007
   only after the merged repository evidence is complete.

## Acceptance

- Decision-important, quantitative, comparative, safety-related, causal,
  contested, time-sensitive, and surprising factual claims receive nearby
  source support.
- A directly supported claim hyperlinks its shortest meaningful phrase without
  a separate explanatory citation sentence.
- A synthesis or extrapolation is visibly marked `(inferred)`; each material
  source basis remains linked when more than one is used.
- Stable connective reasoning, user-supplied facts, and ordinary transitions do
  not require decorative citations unless they become decision-important.
- Sources may be grouped only when a reader can still tell which source
  supports which claim.
- If important support is unavailable, the answer says the claim is unverified
  or leaves it out; an adjacent source is never attached as if it entailed the
  claim.
- Generated Instructions remain within 8,000 characters and all applicable
  deterministic checks pass.

## Recovery

The task branch starts from `origin/main` at
`00780e945204d0fb4302b5425a3ae0d4d9b2cfd5`. Git history and the eventual pull
request provide the rollback point. The owner's dirty primary checkout and its
private untracked files remain untouched.

Completed: PR #47 merged reviewed head
`51e420c69b9e811d857977b95a310a93f4975637` as
`7b6dac66a67bbfb43bcabbbbf37c5dd60a0dc7a3`; protected checks passed before and
after merge. ARL-0007 was accepted, incorporated, and closed against that merged
evidence. The previous main commit remains reachable through the merge's first
parent and Git reflog. The exact generated Instructions still require owner-side
installation and a fresh GPT-UI run before product behavior is claimed.
