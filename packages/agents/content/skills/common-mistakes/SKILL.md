---
name: common-mistakes
description: Common mistakes to avoid across categories with cross-references to specific rule files
user-invocable: false
---

# Common mistakes

This file has high importance because it describes mistakes commonly made despite explicit contrary instructions.

## Rule compliance

### Following categorized guidance

When implementing rules, follow complete guidance from the appropriate category:

- **Language mechanics** → See `typescript-conventions` skill
- **Development processes** → See `development-workflows` skill
- **Code organization** → See `code-patterns` skill
- **Testing** → See `testing-conventions` skill and `typescript-testing-conventions` skill

Don't pick and choose from rules without considering the full context of each category.

### Process violations

- **Don't skip quality gates** - Always run linting, typechecking, and tests before considering work complete
- **Don't ignore build failures** - Address all build errors before proceeding
- **Don't bypass established workflows** - Follow defined processes even when they seem unnecessary

## Pull requests

### Test plans

- Never include automated quality checks (CI, linting, type-checking, formatting) in test plans. They run automatically.

## Cross-cutting issues

These mistakes span multiple categories:

### Type safety shortcuts

- Using `any` instead of proper types or `unknown`
- Adding type assertions to silence errors
- Ignoring TypeScript compiler warnings

### Documentation gaps

- Leaving functions/classes undocumented
- Assuming code is "self-documenting" without verification
- Not updating docs when behavior changes

### Test reliability

- Conditional expects that can silently pass
- Tests that pass coincidentally despite logical flaws
- Missing edge case coverage
