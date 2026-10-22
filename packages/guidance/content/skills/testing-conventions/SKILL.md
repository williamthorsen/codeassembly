---
name: testing-conventions
description: What a test is for, how to name and structure it, and how it calls git and other external programs. Consult before writing or changing a test.
user-invocable: false
---

# Testing conventions

## What a test is for

A test guards a behavior against accidental breakage. A **behavior** is an outcome that a caller or a user relies on: what a function returns, what a user can do, what the system refuses. A **value** is a thing that the code contains today while producing it: the text of a message, the contents of a config, the members of a list. A test that pins a value fails on every intended change to that value and catches nothing, so each such change is made twice.

Before writing a test, ask what would go uncaught if it did not exist. Three answers rule the test out.

- **A change that someone would have to make on purpose.** Rewording a message, editing a config, adding a member to a list: Each is a decision, and review already guards decisions. A test is justified when it catches an accident, a change made without intending to touch this outcome, such as a route added without its guard or a refactor that drops a case. A scenario constructed so that the test has something to catch is not an accident.
- **Nothing that this repository authored.** Machine state, the user's environment, and a dependency's behavior are not under test, and enabling a dependency's feature does not make that feature's behavior ours. If the right response to red would be a bug report upstream, the test is not ours.
- **A difference that costs nothing until noticed.** A relaxed lint rule, a setting that drifts from its best value, a directory that departs from convention: Maintaining a standing test takes more effort than noticing the difference would. A caught failure has to be worse than noticing it: a wrong answer returned, a task that a user cannot finish, data lost or exposed.

Then ask where the expected result comes from. A specification, a format, or a rule that someone could state without opening the code makes it an expectation. If pasting in whatever the code now produces would make the test pass again, the test pins a value, whatever its name says. When a test compares two sets, derive the expected one from its source; a set typed into the test drifts.

Three cases recur. Configuration is verified by the tool that reads it, which the build and lint gates run; if an accident is real and the tool is silent, prevent it at the tool rather than detect it in a test. Wording is asserted only when the text is the sole thing that distinguishes two code paths that exist, and then by a durable fragment. A process that this repository does not author is called through an adapter and replaced by a fake, as [External programs](#external-programs) states.

If a rule above forbids a test and the case seems exceptional, stop before writing it, state the case in one sentence, and wait.

## When tests are required

Every change to a behavior, as defined above, is covered by a test. A change that does not add runtime behavior does not need a new test: a deletion, a type consumed only within this compile, prose, styling.

A test that guards a behavior still has to clear two checks:

1. **Nothing else fails first.** If the compiler, the linter, or a gate that already reproduces the failure condition on every run would catch the regression, that gate is the guard, and a narrower test is a weaker and more brittle duplicate. A gate that merely exercises the same area does not qualify; it has to reproduce the condition.
2. **It would catch the failure that it guards against.** Run it against what it rejects: Break the guarded thing, watch the test fail, restore it. A test that still passes is not a guard. If reaching the cause means replicating a dependency's private shape, the test breaks or silently stops testing at the next upgrade.

If a change needs coverage and these sections rule out every candidate test, it is merged without one; say which answer ruled the candidate out.

## Where a test goes

A test's **tier** is what it starts or builds to observe a behavior. The cheapest tier calls the code in the test's own process. An **expensive tier** spawns an entry point as a process, starts a runtime or an engine such as a database, or builds a full fixture. An engine counts as expensive whether it runs in the test's process or in another. A project's own tier names may classify tests on another axis, such as what they reach, and a test takes its label from the project's definition; nmr's, for example, labels a test that runs an embedded engine `tool`. The rules below concern cost.

- **Tier placement.** Test each case at the cheapest tier that can observe it. An expensive tier covers only what a cheaper tier cannot observe: that the entry starts, parses its arguments, wires its dependencies, and reports its exit status, with one smoke example per entry or verb. A branch of logic, a message, or a field of output is a case for the cheapest tier, even when the entry is the only caller that exercises it.
- **Consolidate before adding.** Write a new example only for a behavior that the existing examples cannot be extended to cover. Cases that share setup and action are one table-driven test, as [Test structure](#test-structure) states. When the examples do not mutate a fixture, build it once per file, not once per example.
- **Delete what is superseded, in the same change.** A higher-tier example is superseded when cheaper coverage observes each of its assertions, apart from the entry wiring that the smoke example covers. A change that adds the cheaper coverage deletes the examples that it supersedes, once the new tests pass the second check in [When tests are required](#when-tests-are-required). A port or a rewrite follows the same rule: The change that contains the port deletes the old suite rather than keeping it to catch regressions.
- **Justify each expensive addition.** A change that adds an example at an expensive tier states, in its plan or its pull-request description, why a cheaper tier cannot observe that example. The justification does not belong in a test comment.
- **Use the cheapest setup that fits.** Give an expensive tier the cheapest setup that fits its time budget, such as an in-process engine when few files need one. Add infrastructure, such as a server, a container, or a shared test package, only after a run of the suite at CI's parallelism shows that the cheaper setup does not fit.
- **Keep setup cost independent of the number of files.** Design expensive setup so that adding or splitting a test file does not add to it, for example by starting one engine for the suite rather than one per file.
- **Fix the design, not the timeout.** When a hook, a test, or a tier needs a longer timeout, in the test or in config, treat that as a sign of bad design and make it do less work: smaller data and injected dependencies, as [Test data](#test-data) states, or setup shared across files. A raised timeout hides a cost that grows with each file and with CI load. Raise one only when none of these fixes applies, and state why in the plan or the pull-request description, not in a test comment.

## Test data

- **Use the smallest data that proves the behavior.** A test renders or builds only the records that its assertion needs. Production data, such as a full catalog, appears only in a smoke test whose subject is that data.
- **Make data that a test cannot replace injectable.** When the code under test reads data or a dependency from a module-level singleton, fix the code: Take the value as a parameter, or read it from a context or provider whose default is the real value. Do not test against the real data, and do not mock this repository's module by its path, which keeps the singleton and ties the test to a file layout.

```tsx
// ❌ Avoid: The component reads the singleton, so every test renders the full catalog
function ScopePicker() {
  return <ul>{scopeCatalog.map((scope) => <li key={scope.id}>{scope.label}</li>)}</ul>;
}

// ✅ Good: The context defaults to the real catalog, and the test supplies two scopes
const ScopeCatalogContext = createContext(scopeCatalog);

function ScopePicker() {
  const catalog = useContext(ScopeCatalogContext);
  return <ul>{catalog.map((scope) => <li key={scope.id}>{scope.label}</li>)}</ul>;
}

it('renders one item per scope', () => {
  const scopes = [
    { id: 'read', label: 'Read' },
    { id: 'write', label: 'Write' },
  ];
  render(
    <ScopeCatalogContext.Provider value={scopes}>
      <ScopePicker />
    </ScopeCatalogContext.Provider>,
  );
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
});
```

## Do not test that removed things stay removed

This is the commonest test that guards a decision. When a change removes code, text, or behavior, never add a permanent test asserting the removed thing is absent (a `not.toContain` guard against a deleted string, `expect(isEventType('input.received')).toBe(false)` against a removed variant). The assertion encodes history, not contract: It can fail only if someone reverts that exact line, so it does not guard any regression class, and such assertions accumulate without limit. The positive assertion describing the replacement behavior is the real guard.

Diagnostic: Would this test exist if the deleted code had never existed? If no, don't write it.

Verify the removal is complete once, as a pre-merge check (a `grep`, a plan Verification step), not a standing test. This applies to any change that removes something, not only removal-only changes.

When a test guards that a set is closed, the witness is an arbitrary non-member, never a member that was removed. The removed name guards nothing that the arbitrary one does not, and it records history.

## Loosen a test broken by a wording-only change

When a wording-only change forces a test update, don't re-pin the new wording: Match just the part that identifies the behavior, or drop the assertion if the behavior does not depend on the text.

## Naming of tests

**Always** use test names that describe the specific behavior being tested.
**Never** use vague or meaningless terms.

### Avoid these meaningless patterns

- ❌ **"handles X"**: Too vague, doesn't describe what happens
- ❌ **"does X correctly"**: Meaningless (all tests verify correctness)
- ❌ **"works with Y"**: Doesn't specify the expected outcome
- ❌ **"processes Z properly"**: "Properly" is subjective and unclear

### Use specific behavioral descriptions

- ✅ **"returns 0 when map is empty"**: Clear condition and outcome
- ✅ **"throws error for invalid input"**: Specific behavior under specific condition
- ✅ **"preserves existing data when adding new item"**: Describes what remains unchanged
- ✅ **"removes only items matching criteria"**: Specifies selective behavior

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

Tests should make their variation easy to see. When N adjacent tests differ only in one input but share a large block of identical setup, the reader has to diff three or four nearly-identical render calls to find what's actually being tested. The fix is not "delete things"; it's "factor the shared part out so that the variation reads as variation."

This is the same signal-buried-in-noise failure mode that [comment discipline](#comment-discipline) addresses on the comment side. Different mechanism, same principle.

### Rules

1. **Test bodies should be mostly variation and assertion, not setup.** Any prop, fixture, or boilerplate identical across N adjacent tests is noise. Factor it into a helper that supplies defaults, or collapse the tests into a single parameterized test in which the variation reads as a table.
2. **Use `it.each` when N adjacent tests differ only in a small set of inputs and the body is structurally identical.** Use a named helper when the variation is bigger, when shared setup should move into a helper signature, or when assertion shapes differ per case.
3. **Test the rule, not the data.** Prefer counts, predicates, and structural assertions (`expect(getVisibleChipCount()).toBe(N)`, `expect(queryPillElement()).toBeInTheDocument()`) over enumerating specific fixture labels in every row. Assert specific data flow _once_, in a focused test, not per row of a table.

### Diagnostic

Before writing a third test in the same `describe` block, scan the previous two: How many tokens does a reader have to diff to find what's actually different between them? If the answer is more than a handful, the signal is buried. Parameterize the trio or extract a helper before continuing.

### When N copies are right

The smell is shared _setup with one variable_, not shared _shape with different intents_. Three tests that read as genuinely distinct behavioral claims should stay as three `it` blocks even if their bodies superficially resemble each other. Do not collapse distinct intents into a table.

### Audit before save

<!-- include: ../../_partials/test-structure-audit-checklist.md / -->

## Test organization

- **Use function/class reference as describe argument**: `describe(myFunction, ...)` instead of `describe('myFunction', ...)`

### Test file length

A test file runs in one test worker, and a file that keeps its fixtures makes an append cheaper than a split, so a file grows until it is the slowest unit in the suite. Before adding tests to a file that the addition would leave past the ceiling, split the file by aspect, then add the tests to the file that their aspect names.

- **Ceiling.** The `max-lines` setting that the project's lint configuration applies to test files. When the lint does not set one, 500 lines, counting every line.
- **Aspect.** A group of the subject's behaviors that shares setup and reads without the rest of the file. Each split file contains one aspect.
- **Naming.** Each split file keeps the subject's name and adds the aspect after it, followed by any segment that the project's naming requires: `sync.test.ts` becomes `sync.retirement.test.ts`, and `sync.tool.test.ts` becomes `sync.retirement.tool.test.ts`.
- **Setup.** A split does not add expensive setup. When the file starts an engine or another expensive fixture of its own, share that setup across files first, as [Where a test goes](#where-a-test-goes) states, then split.
- **Fixtures.** Move the fixture builders that the split files share out of the test files, into a module in a `test-utils/` directory beside the tests (beside `__tests__/` when the tests live in one, never inside it), so that a new aspect file needs only one import.

## Keep passing tests quiet

A passing test prints nothing beyond the runner's report. Output that the code under test writes to the console, stdout, or stderr during a passing run appears between the results, and it hides the warning or stack trace that matters when a run fails.

When the code under test writes output, intercept it in the test that triggers it, and restore it when that test ends:

- **Capture** the output when it is the behavior, such as a CLI's report or a warning on which a caller relies, and assert on a durable fragment of it, as [What a test is for](#what-a-test-is-for) states for wording.
- **Silence** the output when it is incidental to the behavior under test.

Intercept only the channels that the test expects to fire. A silencer installed for a whole file or suite, or one that covers every channel, hides the unexpected output that this rule exists to surface.

The `typescript-testing-conventions` skill names the TypeScript techniques.

## Mocking principles

Mock only what matters in component tests. Don't forward irrelevant props or replicate complex implementation details.

```typescript
// ✅ Good: Focused on test needs
jest.mock('@atlaskit/component', () => ({
  Component: ({ children, isOpen }: Props) =>
    isOpen ? <div data-testid="component">{children}</div> : null
}));

// ❌ Avoid: Unnecessary complexity
jest.mock('@atlaskit/component', () => ({
  Component: ({ children, isOpen, width, onClose, ...props }: ComplexProps) =>
    <div {...props} style={{ width }}>{isOpen && children}</div>
}));
```

### External programs

A test that runs an external program to produce its inputs verifies the program rather than this code, and it depends on the copy installed on the machine that runs it: its version, its config, and its background processes. A `git commit` in a test repository, for example, can start a background maintenance run that is still writing into `.git/` when the test removes the directory.

- Code calls an external program whose behavior is not the subject of the test, such as git, through a small adapter that the code receives as a dependency.
- Tests of that code pass a fake adapter that returns fixed answers.
- Only the adapter's own test runs the real program, and it checks that the adapter parses the program's output as the code expects.
- A test does not create a repository, or any other state of a real program, to produce an input that a fake could return.

A test whose subject is the program's effect on real state, such as a command that initializes a repository, runs the program because that effect is the behavior under test.

The `typescript-testing-conventions` skill shows the TypeScript shape.

### Code that uses a database

A database is a program like any other in [External programs](#external-programs): A test starts one only when its subject is SQL.

- Logic that only passes through SQL, such as assembling a view, gating a command, or ordering and reporting, is tested at the cheapest tier against a fake client that returns fixed rows and errors, such as a SQLSTATE. Mock at the boundary of the module containing the SQL when that is simpler than faking the client.
- The database tests worth writing cover what the schema does not already state: that the migrations apply, transactional bookkeeping, upserts and idempotence, and queries.
- Do not write a test per constraint, such as inserting a duplicate row to expect the error. The test that the migrations apply covers the schema.

## Additional patterns

### Omit "should" from test names

Describe what the code actually does when the test passes:

- ✅ "returns false for unknown gates"
- ❌ "should return false for unknown gates"
