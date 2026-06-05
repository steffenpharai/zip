# Architecture Decision Records (ADRs)

This directory contains architecture decision records — short documents
that capture an important architectural decision, the context that led
to it, and the trade-offs accepted.

We follow the format proposed by Michael Nygard:
- **Title** — short noun phrase, ADR number for ordering
- **Status** — proposed / accepted / superseded by ADR-XXXX
- **Context** — the forces at play, the situation being responded to
- **Decision** — what we're going to do
- **Consequences** — what becomes easier and what becomes harder

ADRs are immutable once accepted. If a decision changes, write a new ADR
that supersedes the old one.

## Index

| # | Status | Title |
|---|---|---|
| [0001](./0001-monorepo-with-submodule.md) | Accepted | Monorepo with `zip-brain` as submodule |
| [0002](./0002-uno-owns-time.md) | Accepted | UNO owns time (motion control on the MCU, not the brain) |
| [0003](./0003-uart-500k-baud.md) | Accepted | UART at exactly 500000 baud |
| [0004](./0004-sticky-bus-topics.md) | Accepted | Sticky pub/sub topics on the brain |
| [0005](./0005-wheels-locked-default.md) | Accepted | Wheels locked by default on the bench |
| [0006](./0006-llm-on-jetson-deferred.md) | Accepted | LLM-on-Jetson deferred; hybrid PC-brain architecture |
| [0007](./0007-v1-archived-as-predicate.md) | Accepted | V1 archived as predicate, not migrated |

## Writing a new ADR

1. Copy the lowest-numbered file as a template.
2. Use the next available number (zero-padded to 4 digits).
3. Open as `proposed`. Discuss in a PR.
4. Once merged, update status to `accepted`.
5. Add to the index above.
6. Never edit body text after accepting; write a superseding ADR instead.
