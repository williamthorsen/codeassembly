# Comment discipline

This doc defines what does and does not belong in a code comment. It is loaded by the skills that fire when an agent writes or reviews code (`code-patterns`, `testing-conventions`, `code-simplification-reviewer`).

## The reader

The reader is the engineer six months later who has no chat transcript, no session context, and no recollection of the conversation that produced the code. Comments must serve that reader. Anyone with all that context already does not need a comment to recover it.

## The principle

Comments are written for the future reader, not the recent conversation.

Detail is routed, not omitted:

- Design rationale and rejected alternatives go in the commit message or PR description.
- Library reference (how the library works) belongs in the library's docs.
- Ticket and PR linkage is recoverable via `git blame`, `git log`, and code search.
- Author reasoning about the change ("matches X precedent") belongs in the PR description.
- The current-session conversation that produced the code does not persist anywhere.

Anything that survives this routing earns its place in the source.

## Positive baseline

Every non-trivial function, method, class, and component carries a one-line description. The description states what the code does, not how it does it. Trivial code, such as simple getters and one-line helpers whose name fully describes their behavior, may omit the description.

This baseline is non-negotiable. The deletion rules below govern volume and content beyond this baseline.

## Deletion rules

For each new or modified comment, cut the comment if any of the following apply.

1. **Restates what the code says.** If the comment paraphrases the line below it in English, delete it. A test named "renders `<Pill>` inside `<Chip>`" does not need a comment saying "this checks that `<Pill>` is inside `<Chip>`." The code already says it.
2. **References the conversation that produced the code.** No "we discussed," "as agreed," "this approach was chosen because." The chosen approach is the code; the alternatives belong in the ticket or PR description.
3. **References ephemeral artifacts.** No "see PR #N," "mirrors `OtherFile.spec.tsx`," "added by `TICKET-123`." `git blame` and code search recover these on demand. If the linkage matters to the design, it belongs in a commit message or a doc.
4. **Documents the library being used.** "Atlaskit Select renders a combobox role" belongs in the library's docs, not your code.
5. **Explains unreachable cases or hypothetical bugs.** "X is always >= 2 by construction" is reviewer-defensive padding. If an invariant matters, encode it as an assertion or a type, not prose.
6. **Duplicates a fact documented elsewhere.** If a constant carries JSDoc, its call site does not need a comment repeating it. One location per fact.
7. **Tutorial-style file headers.** A file header earns its place only when it documents non-obvious architecture (composition order, invariants across functions, threading model). It must not duplicate per-function JSDoc. If the default export already has a one-line JSDoc and the file is a single concept, no file header is needed.
8. **Process commentary.** "Centralizes the typing boundary," "matches the X precedent," "future readers should note…" These document the author's reasoning about the change, not the code's behavior. Put them in the PR description or the commit message.
9. **Domain leaks in shared code.** A `common/` component's JSDoc must not reference a specific consumer ("the planning-grid contract"). If the constraint is real, lift it to a type or a parameter; if not, drop the reference.
10. **"What" inline comments.** Inline comments answer "why," not "what." "Render the pill in place of the next chip" is what the code does. "react-select types value as a union; narrow to array" is why a cast exists. Keep the second kind.

## Carve-outs

A small set of comments survive the deletion rules. The carve-outs are positive permissions; they say what is OK to keep, not what must be added.

### Test comments

Legitimate reasons to write a comment inside a test:

- **Non-obvious setup.** When the fixture construction does not match the test name, a sentence explaining the setup is warranted.
- **Indirect assertions.** When the test must assert on a proxy (e.g., on a `className` because the styled behavior is not observable in jsdom), name the reason for the indirection.
- **Intentional skips.** When a test is skipped, the skip rationale is required.

Everything else is over-commenting. Test names already communicate intent; assertions communicate the check.

### `eslint-disable` rationales

Explain only why this specific lint rule is being suppressed here. Not the surrounding decision, not the test's overall purpose, not the design rationale for the code below. Just the suppression.

Good: `// eslint-disable-next-line no-explicit-any -- third-party Stripe type ships as any.`
Bad: `// eslint-disable-next-line no-explicit-any -- this test locks in the affordance for users with screen readers, see PR #456 for context.`

## Economy

Lines of code are lines of code, even when they are comments. They have to be maintained, scanned during review, and trusted as accurate. Every comment must earn its weight against that cost.

## Audit before save

<!-- include: ../../_partials/comment-audit-checklist.md / -->

## Before/after example

The before/after below is a representative composite drawn from observed cases. The test asserts on a `className` because the styled focus state is not observable in jsdom.

**Before:**

```tsx
// Originally added for TICKET-123 / PR #456 to lock in the focus affordance.
// This test mirrors the regression assertion in `Sibling.spec.tsx`. We discussed making the assertion more direct,
// but the styled behavior isn't observable in jsdom, so we assert on the className instead.
// Future readers should note that removing this test will regress the affordance.
// eslint-disable-next-line jest/no-conditional-expect -- needed because this test exercises both the focused and unfocused branches and we wanted to keep them in one test for parity with the Sibling.spec.tsx structure
it('applies the focused class to the selected option', () => {
  // ...
});
```

**After:**

```tsx
it('applies the focused class to the selected option', () => {
  // Asserts on className because the styled focus state is not observable in jsdom.
  // eslint-disable-next-line jest/no-conditional-expect -- focused and unfocused branches share one test
  // ...
});
```

What was cut:

- The ticket and PR references (rule 3).
- The pointer to `Sibling.spec.tsx` (rule 3).
- The "we discussed" conversation memorial (rule 2).
- The "future readers should note" process commentary (rule 8).
- The eslint-disable rationale that explained the broader test structure rather than the specific suppression (carve-out tightening).

What survived:

- A one-sentence explanation of the indirect assertion (test-comment carve-out).
- A tight `eslint-disable` rationale that names only why this rule is suppressed here.
