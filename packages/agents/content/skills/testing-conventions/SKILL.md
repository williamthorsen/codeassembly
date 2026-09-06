---
name: testing-conventions
description: Test naming conventions and behavioral testing patterns for projects with test suites
user-invocable: false
---

# Testing conventions

## What a test is for

A test guards a behavior against accidental breakage. A **behavior** is an outcome that a caller or a user relies on: what a function returns, what a user can do, what the system refuses. A **value** is a thing that the code holds today while producing it: the text of a message, the contents of a config, the members of a list. A test that pins a value fails on every intended change to that value and catches nothing, so each such change is made twice.

Before writing a test, ask what would go uncaught if it did not exist. Three answers rule the test out.

- **A change that someone would have to make on purpose.** Rewording a message, editing a config, adding a member to a list: Each is a decision, and review already guards decisions. A test earns its place by catching an accident, a change made without intending to touch this outcome, such as a route added without its guard or a refactor that drops a case. A scenario constructed so that the test has something to catch is not an accident.
- **Nothing that this repository authored.** Machine state, the user's environment, and a dependency's behavior are not under test, and enabling a dependency's feature does not make that feature's behavior ours. Where the right response to red would be a bug report upstream, the test is not ours.
- **A difference that costs nothing until noticed.** A relaxed lint rule, a setting that drifts from its best value, a directory that departs from convention: A standing test costs more than the moment that it saves. A caught failure has to cost more than noticing it: a wrong answer returned, a task that a user cannot finish, data lost or exposed.

Then ask where the expected result comes from. A specification, a format, or a rule that someone could state without opening the code makes it an expectation. Where pasting in whatever the code now produces would make the test pass again, the test pins a value, whatever its name says. Where a test compares two sets, derive the expected one from its source; a set typed into the test drifts.

Three cases recur. Configuration is verified by the tool that reads it, which the build and lint gates run; where an accident is real and the tool is silent, prevent it at the tool rather than detect it in a test. Wording is asserted only where the text is the sole thing that distinguishes two code paths that exist, and then by a durable fragment. A process that this repository does not author is replaced by a stub.

Where a rule above forbids a test and the case seems exceptional, stop before writing it, state the case in one sentence, and wait.

## When tests are required

Every change to a behavior, as defined above, is covered by a test. A change that adds no runtime behavior needs no new test: a deletion, a type consumed only within this compile, prose, styling.

A test that guards a behavior still has to clear two checks:

1. **Nothing else fails first.** Where the compiler, the linter, or a gate that already manufactures the failure condition on every run would catch the regression, that gate is the guard, and a narrower test is a weaker and more brittle duplicate. A gate that merely exercises the same area does not qualify; it has to reproduce the condition.
2. **It would catch the failure that it guards against.** Run it against what it rejects: Break the guarded thing, watch the test fail, restore it. A test that still passes is not a guard. Where reaching the cause means replicating a dependency's private shape, the test breaks or silently stops testing at the next upgrade.

Where a change needs coverage and no candidate test clears these sections, it ships without one; say which answer ruled the candidate out.

## Do not test that removed things stay removed

This is the commonest test that guards a decision. When a change removes code, text, or behavior, never add a permanent test asserting the removed thing is absent (a `not.toContain` guard against a deleted string, `expect(isEventType('input.received')).toBe(false)` against a removed variant). The assertion encodes history, not contract: It can fail only if someone reverts that exact line, so it guards no regression class and accretes without bound. The positive assertion describing the replacement behavior is the real guard.

Diagnostic: Would this test exist if the deleted code had never existed? If no, don't write it.

Verify the removal is complete once, as a pre-merge check (a `grep`, a plan Verification step), not a standing test. This applies to any change that removes something, not only removal-only changes.

Where a test guards that a set is closed, the witness is an arbitrary non-member, never a member that was removed. The removed name guards nothing that the arbitrary one does not, and it records history.

## Loosen a test broken by a wording-only change

When a wording-only change forces a test update, don't re-pin the new wording: Match just the part that identifies the behavior, or drop the assertion if no behavior depends on the text.

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

The same rules apply to test files as to source. Test names already communicate intent and assertions communicate the check, so everything outside the test-comment carve-out is over-commenting.

## Test structure

Tests should make their variation easy to see. When N adjacent tests differ only in one input but share a wall of identical setup, the reader has to diff three or four nearly-identical render calls to find what's actually being tested. The fix is not "delete things"; it's "factor the shared part out so the variation reads as variation."

This is the same signal-buried-in-noise failure mode that [comment discipline](#comment-discipline) addresses on the comment side. Different mechanism, same principle.

### Rules

1. **Test bodies should be mostly variation and assertion, not setup.** Any prop, fixture, or boilerplate identical across N adjacent tests is noise. Factor it into a default-bearing helper, or collapse the tests into a single parameterized test where the variation reads as a table.
2. **Use `it.each` when N adjacent tests differ only in a small set of inputs and the body is structurally identical.** Use a named helper when the variation is bigger, when shared setup should move into a helper signature, or when assertion shapes differ per case.
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
