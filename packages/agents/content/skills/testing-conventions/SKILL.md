---
name: testing-conventions
description: Test naming conventions and behavioral testing patterns for projects with test suites
user-invocable: false
---

# Testing conventions

## When tests are required

**Default rule:** every code change that creates or modifies testable behavior must include tests that cover that behavior. The burden is on justifying the exception, not the rule.

**Carve-outs** — the following categories are exempt from the test requirement:

- **Generated CSS classes and pure visual styling** — output is non-deterministic or meaningful only visually
- **Static configuration files** — JSON/YAML/TOML files with no runtime logic
- **Type-only changes** — type definitions, interfaces, and type aliases that produce no runtime code
- **Markdown and documentation content** — prose files with no executable behavior
- **Build scripts and tooling** — scripts whose correctness is verified by the build or lint pipeline rather than unit tests, and that expose no independently testable API surface

If a change does not fall into one of these categories, it requires tests. When in doubt, write the test.

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

## Additional patterns

### Omit "should" from test names

Describe what the code actually does when the test passes:

- ✅ "returns false for unknown gates"
- ❌ "should return false for unknown gates"
