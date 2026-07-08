---
doc_type: adr
---

# ADR: Withdraw Apply Contract

## Alternatives

The previous approach used `old_field`, but the current contract keeps the
merchant application number in `apply_no`.

## Decision

Use `apply_no` as the stable merchant-side identifier.
