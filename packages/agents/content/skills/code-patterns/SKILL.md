---
name: code-patterns
description: Code organization patterns including library adoption, documentation, and testing structure
user-invocable: false
---

# Code organization patterns

Rules for how code is structured, organized, and documented.

## Library adoption

### Research before implementation

- **Always investigate existing libraries before hand-rolling complex code** - Research and adopt reliable, lightweight solutions like `cli-table3` for table formatting and `chalk` for terminal colors
- **Don't write complicated functions solvable by lightweight libraries** - Use established libraries like `semver` instead of custom parsing
- **Prefer chalk for terminal colors** - Use `chalk.red()` instead of manual ANSI escape codes

## Documentation

The positive baseline for descriptions on functions, methods, classes, and components lives in [`comment-discipline.md`](../_data/comment-discipline.md). The subsections below cover documentation form.

### JSDoc parameters

**JSDoc params are only needed when parameter names are not self-explanatory:**

- Parameter names like `userId`, `isEnabled` are self-documenting
- Complex objects documented by TypeScript interfaces don't need additional JSDoc
- Only document params when the name alone doesn't convey purpose or constraints

### Section separators

Do not use multi-line boxed separators (`// --------` / `// Label` / `// --------`) or rulered headings (`// --- Label ---`, `// -- Label ---…`). They wrap awkwardly and add noise without carrying information. Two canonical forms replace them:

- **Inline heading** — the default for primary-content sections:

  ```ts
  // -- Canvas dimensions --
  ```

- **Region fold** — for supporting or collapsible blocks (helpers, types, styles, getters, type guards, sub-functions):

  ```ts
  // region | Helpers
  function findAgent(...) { ... }
  // endregion | Helpers
  ```

## Code comments

Comments are written for the future reader, not the recent conversation. The full rule set (positive baseline, ten deletion rules, carve-outs for test comments and `eslint-disable` rationales) lives in [`comment-discipline.md`](../_data/comment-discipline.md).

<!-- include: ../../_partials/comment-audit-checklist.md / -->

## Naming

Follow the naming rules in [naming-conventions.md](../_data/naming-conventions.md): no abbreviations, unit-of-measure suffixes on numerics, verb-led function names, boolean prefixes (`is`, `has`, `should`, `does`).

## Testing patterns

### Test structure

- **Use parameterized tests** with `it.each([...])` to avoid verbose, repetitive test cases
- **Use function/class reference as describe argument** - `describe(myFunction, ...)` instead of `describe('myFunction', ...)`
- **Place tests in `__tests__` directory** as sibling to the file being tested

### Mocking principles

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
