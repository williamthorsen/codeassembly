### Finalize (reserved last 3 turns)

Replace `### Criticality: (pending)` with the aggregate enum value (`none|low|medium|high`) and replace `### Summary`'s `(pending)` placeholder with the 1-2 sentence overall assessment.

Insights are not findings: They have no severity and never affect the criticality aggregate; a review with only insights and no findings is still `none`. Put any emitted insights under the `### Insights` section, one `#### I{n}: {title}` per insight with a `- **Description:**` line and an optional `- **Destination:** ticket comment | devlog`; omit the section when there are none. Gate each insight per the `review-criteria` insight gate first.
<!-- children -->
