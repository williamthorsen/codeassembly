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

### Required documentation

**Functions, classes, and components MUST have concise descriptions** - This is mandatory. Even if the purpose seems obvious today, future readers need context.

- Every function must have a description
- Every class must have a description
- Every component must have a description

### JSDoc parameters

**JSDoc params are only needed when parameter names are not self-explanatory:**

- Parameter names like `userId`, `isEnabled` are self-documenting
- Complex objects documented by TypeScript interfaces don't need additional JSDoc
- Only document params when the name alone doesn't convey purpose or constraints

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
