# Treatment-landscape workflow

This map explains the current implementation. Canonical behavior remains in
`protocols/HRP_Full.xml`, `project/PROJECT_INSTRUCTIONS.md`, and
`project/FORUM_SIGNAL_MODULE.md`.

## End-to-end flow

```mermaid
flowchart TD
    Q[Research question] --> I[Treatment-space inventory]
    I --> B[Repeated broad discovery batches<br/>up to six searches per batch]
    B --> R[Reciprocal candidate ledger<br/>batch, class, fingerprint, stable source]
    R --> C[Derived counts and normalized<br/>program signatures]
    C --> L{Aggregate landscape lock}
    L -- executable breadth gap --> B
    L -- access-only gap --> O[Bounded non-ranking answer]
    L -- selection coverage ready --> T[Creator transcript audit]
    T --> D[Per-video public discussion audit]
    D --> X[Community findings reopen<br/>formal and grey searches]
    X --> Y[Formal findings reopen community<br/>failure, harm, durability, and stage searches]
    Y --> L
    L -- breadth and depth complete --> S[Claim-level synthesis]
```

## Separate locks

```mermaid
flowchart LR
    A[Selection breadth] --> B[assess_treatment_landscape_coverage]
    C[Creator wording] --> D[get_youtube_transcript]
    E[Public discussion depth] --> F[audit_youtube_video_community]
    B --> G{Selection, depth, and overall locks pass?}
    D --> G
    F --> G
    G -- no, work executable --> H[Continue research]
    G -- no, terminal access only --> I[Name the boundary;<br/>no broad ranking]
    G -- yes --> J[Eligible for synthesis;<br/>not proof of efficacy]
```

The separate selection, per-video-depth, and overall locks do not judge whether
a treatment works or independently prove the semantic inventory is complete.
They check the supplied receipt-linked ledger and prevent a
deeply audited but narrow set—such as many near-identical exercise videos—from
standing in for a diverse treatment landscape. Candidate counts, normalized
program diversity, and independent-source counts are derived; invalid records
are excluded. Numeric ranges are planning warnings; decision-relevant or
uncertain omissions, missing directional searches, incomplete formal return
passes, unresolved selected-source receipts, and executable expansion are
blockers. A supported not-decision-relevant omission is only a warning.
Terminal gaps count only when a structured boundary matches the literal source
state and affected scope, is nonretryable, and records attempted recovery.
