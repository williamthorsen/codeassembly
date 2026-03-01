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

### Error handling

- **Don't place non-failing code inside try/catch blocks** - Only wrap operations that can actually throw errors
- String concatenation, variable assignments, and other safe operations should be outside try/catch to clearly indicate what needs error handling
