# Ticket evaluation

A ticket is a request, report, or suggestion — not a contract. The author may have framed it poorly, missed the actual problem, scoped it too narrowly, proposed an unsound fix, or filed work that turns out to be inadvisable. Before designing to a ticket, evaluate it on its merits:

- **Is the problem real?** Reproduce or verify the underlying observation, not just the framing.
- **Is the scope right?** Look for related instances of the same defect class, neighboring code paths, or assumptions that don't hold beyond the ticket's frame.
- **Is the proposed solution sound?** A ticket may include a recommended fix that solves the symptom but not the cause, or that fixes the cause less well than an alternative. Apply the [design priorities](./design-priorities.md) lens — a convenient-but-wrong fix is unsound, even if it matches surrounding code.
- **Is the title accurate?** "Flaky test in X" may be a hygiene anti-pattern that exists in three places. Reframe titles when the underlying truth is broader or different.

When evaluation surfaces a divergence from the ticket as written, raise the observation to the user before designing — but lead with the substantive finding, not the ticket. The ticket's job was to start the conversation; once it has started, the codebase reality and the user's judgment govern, not the original wording.
