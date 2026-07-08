Evaluate whether the Markdown document is clean final-state copy for its
declared document type.

Pass when:

- The document describes the current public or operational truth.
- Rationale is relevant to the reader and belongs in the current document type.
- Constraints are current product or operational constraints.
- ADR and runbook history is structured in an appropriate section.

Fail when:

- The document includes AI drafting history, self-correction, or revision notes.
- The document explains rejected prior designs outside an allowed section.
- The document tells the reader what was removed, changed, or no longer used
  when the reader only needs the current contract.
- The document describes the author's process, feedback loop, or internal
  cleanup work instead of the final content.

Return a score from 0 to 1. A score of 0.9 or higher means the document is
publishable for final-state hygiene.
