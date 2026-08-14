---
name: testing-conventions
description: Test naming conventions and behavioral testing patterns for projects with test suites
user-invocable: false
---

# Testing conventions

## When tests are required

**Default rule:** Every code change that creates or modifies testable behavior must include tests that cover that behavior. The burden is on justifying the exception, not the rule.

**Carve-outs** — the following categories are exempt from the test requirement:

- **Generated CSS classes and pure visual styling** — output is non-deterministic or meaningful only visually
- **Static configuration files** — JSON/YAML/TOML files with no runtime logic
- **Type-only changes** — type definitions, interfaces, and type aliases that produce no runtime code
- **Markdown and documentation content** — prose files with no executable behavior
- **Build scripts and tooling** — scripts whose correctness is verified by the build or lint pipeline rather than unit tests, and that expose no independently testable API surface
- **Removal-only changes** — a change that only deletes code, text, or behavior introduces no new positive behavior to cover, so it needs no new test.

If a change does not fall into one of these categories, it requires tests. When in doubt, write the test.

### Do not test that removed things stay removed

When a change removes code, text, or behavior, never add a permanent test asserting the removed thing is absent (a `not.toContain` guard against a deleted string, `expect(isEventType('input.received')).toBe(false)` against a removed variant). The assertion encodes history, not contract: It can fail only if someone reverts that exact line, so it guards no regression class and accretes without bound. The positive assertion describing the replacement behavior is the real guard.

Diagnostic: Would this test exist if the deleted code had never existed? If no, don't write it.

Verify the removal is complete once, as a pre-merge check (a `grep`, a plan Verification step), not a standing test. This applies to any change that removes something, not only removal-only changes.

### Loosen a test broken by a wording-only change

When a wording-only change forces a test update, don't re-pin the new wording: Match just the part that identifies the behavior, or drop the assertion if no behavior hangs on the text.

## Naming of tests

**Always** use test names that describe the specific behavior being tested.
**Never** use vague or meaningless terms.

### Avoid these meaningless patterns

- ❌ **"handles X"** - Too vague, doesn't describe what happens
- ❌ **"does X correctly"** - Meaningless (all tests verify correctness)
- ❌ **"works with Y"** - Doesn't specify the expected outcome
- ❌ **"processes Z properly"** - "Properly" is subjective and unclear

### Use specific behavioral descriptions

- ✅ **"returns 0 when map is empty"** - Clear condition and outcome
- ✅ **"throws error for invalid input"** - Specific behavior under specific condition
- ✅ **"preserves existing data when adding new item"** - Describes what remains unchanged
- ✅ **"removes only items matching criteria"** - Specifies selective behavior

### Test name formula

Use this pattern: `"when/if [condition], [action/outcome]"`

Examples:

- `"if no items match filter, returns empty array"`
- `"if email format is invalid, throws ValidationError"`
- `"when saving user preferences, updates timestamp"`
- `"preserves order when removing middle element"`

### What makes a good test name

1. **Specific**: Describes exact behavior, not general capability
2. **Conditional**: States the circumstances that trigger the behavior
3. **Outcome-focused**: What happens, not just that something happens
4. **Readable**: Anyone can understand the test purpose without reading the code

<!-- include: ../../_partials/comment-discipline.md / -->

## Comments in test files

Test files are governed the same as source. Test names already communicate intent and assertions communicate the check, so everything outside the test-comment carve-out is over-commenting.

## Test structure

Tests should make their variation easy to see. When N adjacent tests differ only in one input but share a wall of identical setup, the reader has to diff three or four nearly-identical render calls to find what's actually being tested. The fix is not "delete things"; it's "factor the shared part out so the variation reads as variation."

This is the same signal-buried-in-noise failure mode that [comment discipline](#comment-discipline) addresses on the comment side. Different mechanism, same principle.

### Rules

1. **Test bodies should be mostly variation and assertion, not setup.** Any prop, fixture, or boilerplate identical across N adjacent tests is noise. Factor it into a default-bearing helper, or collapse the tests into a single parameterized test where the variation reads as a table.
2. **Use `it.each` when N adjacent tests differ only in a small set of inputs and the body is structurally identical.** Use a named helper when the variation is bigger, when shared setup should disappear into a helper signature, or when assertion shapes differ per case.
3. **Test the rule, not the data.** Prefer counts, predicates, and structural assertions (`expect(getVisibleChipCount()).toBe(N)`, `expect(queryPillElement()).toBeInTheDocument()`) over enumerating specific fixture labels in every row. Assert specific data flow _once_, in a focused test, not per row of a table.

### Diagnostic

Before writing a third test in the same `describe` block, scan the previous two: How many tokens does a reader have to diff to find what's actually different between them? If the answer is more than a handful, the signal is buried. Parameterize the trio or extract a helper before continuing.

### When N copies are right

The smell is shared _setup with one variable_, not shared _shape with different intents_. Three tests that read as genuinely distinct behavioral claims should stay as three `it` blocks even if their bodies superficially resemble each other. Do not collapse distinct intents into a table.

### Audit before save

<!-- include: ../../_partials/test-structure-audit-checklist.md / -->

## Test organization

- **Use function/class reference as describe argument** - `describe(myFunction, ...)` instead of `describe('myFunction', ...)`

## Mocking principles

Mock only what matters in component tests. Don't forward irrelevant props or replicate complex implementation details.

```typescript
// ✅ Good - focused on test needs
jest.mock('@atlaskit/component', () => ({
  Component: ({ children, isOpen }: Props) =>
    isOpen ? <div data-testid="component">{children}</div> : null
}));

// ❌ Avoid - unnecessary complexity
jest.mock('@atlaskit/component', () => ({
  Component: ({ children, isOpen, width, onClose, ...props }: ComplexProps) =>
    <div {...props} style={{ width }}>{isOpen && children}</div>
}));
```

## Additional patterns

### Omit "should" from test names

Describe what the code actually does when the test passes:

- ✅ "returns false for unknown gates"
- ❌ "should return false for unknown gates"
