Before saving a spec file, scan adjacent tests for shared-setup runs.

**The diagnostic.** For each run of three or more nearly-identical tests, ask: How many tokens does a reader have to diff to find what's actually different between them? If the answer is more than a handful, the signal is buried. Refactor.

- **Parameterize** with `it.each` when the variation is small and the test body is structurally identical.
- **Extract a named helper** when the variation is bigger, when shared setup should disappear into a helper signature, or when assertion shapes differ per case.
- **Check the assertions, too.** When the rule is a count or predicate, specific-fixture-label assertions should not repeat per row. Assert specific data flow *once* in a focused test; assert structurally for the rest.

Do not collapse distinct intents. The smell is shared *setup with one variable*, not shared *shape with different intents*. Three tests that read as genuinely distinct behavioral claims stay as three `it` blocks even if their bodies superficially resemble each other.

Three or more `it` blocks with identical setup and a single varying input is the most common failure mode in interactive sessions. That material belongs behind a helper or a parameterized table, not in N copies of the same shape.
