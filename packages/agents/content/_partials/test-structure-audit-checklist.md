Before saving a spec file, scan adjacent tests for shared-setup runs.

- **Parameterize** with `it.each` when the variation is small and the test body is structurally identical.
- **Extract a named helper** when the variation is bigger, when shared setup should disappear into a helper signature, or when assertion shapes differ per case.
- **Check the assertions, too.** When the rule is a count or predicate, specific-fixture-label assertions should not repeat per row. Assert specific data flow _once_ in a focused test; assert structurally for the rest.

Three or more `it` blocks with identical setup and a single varying input is the most common failure mode in interactive sessions. That material belongs behind a helper or a parameterized table, not in N copies of the same shape.
