---
name: anti-patterns
description: Common anti-patterns to avoid including dependency overrides and quick-fix shortcuts
user-invocable: false
---

# Anti-patterns to avoid

Common but problematic approaches that should be avoided in favor of proper solutions.

## Package management

### Dependency overrides

- **Never use package overrides as first solutions** - Avoid `pnpm.overrides`, `yarn resolutions`, or `npm overrides` to force dependency versions. These create technical debt and version conflicts
- **Don't bypass dependency resolution** - Let package managers handle transitive dependencies through proper update commands
- **Avoid version pinning shortcuts** - Use semantic version ranges and proper dependency management

## Development approach

### Quick fixes over proper solutions

- **Don't suggest hacks before exploring proper solutions** - Exhaust maintainable, ecosystem-respecting approaches first
- **Avoid configuration shortcuts** - Don't bypass intended workflows through configuration tricks
- **Never prioritize immediate convenience over maintainability** - Proper solutions prevent technical debt

## Code quality

### Shortcuts that create debt

- **Don't accept "good enough" solutions** - If it creates maintenance burden, it's not good enough
- **Avoid band-aid fixes** - Address root causes rather than symptoms

### Suppression directives

- **A suppression directive — a comment that tells a linter or type checker to ignore a specific warning — is a design signal, not a workaround.** The rule flagged the code because it matched a pattern that is usually wrong.
- **Try these in order before suppressing inline:** (1) change the code so the rule no longer triggers — usually the right answer; (2) reconfigure the rule if its default is wrong for the project; (3) define a scoped exception for a whole category that is legitimately exempt. Suppress inline only as a last resort — when the case is genuinely local and none of the above fits, such as an external boundary where the real type can't be known.
- **An `any` or a type assertion suppresses in the language what a directive suppresses in a comment.** Both silence the checker without changing what the code does, so both take the same ladder: model the type the value actually has, or return `unknown` and let the caller narrow it.
- **Every suppression you introduce carries a rationale** naming the rule, why it doesn't apply here, and what alternatives you rejected. Restating the rule is not a rationale.

```ts
// ❌ Suppress the warning
// eslint-disable-next-line complexity -- does a lot
function classify(order) {
  /* long, deeply nested */
}

// ✅ Change the code so the rule no longer triggers
function classify(order) {
  return isExpedited(order) ? classifyExpedited(order) : classifyStandard(order);
}
```

### Error handling

- **Don't place non-failing code inside try/catch blocks** - Only wrap operations that can actually throw errors
- String concatenation, variable assignments, and other safe operations should be outside try/catch to clearly indicate what needs error handling
