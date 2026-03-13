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

## Git commits

These mistakes occur repeatedly despite explicit instructions in the `commit` skill.

### Process-oriented titles

Commit titles must describe the **code change**, not the process. Titles like "Address review findings," "Apply feedback," or "Fix issues from review" are never acceptable — they tell readers nothing about what changed. Describe what the diff does: "Fix null check in layout resolver," "Remove unused layout fields."

### Title length

72 characters max. This is a hard limit, not a guideline. Count characters before committing. If the title is too long, shorten it — don't just let it overflow.

### Hard line breaks in commit body

Do not insert newlines to wrap the commit body at a fixed column width. Write naturally as continuous text. Let the terminal or viewer handle wrapping. This applies to both prose paragraphs and list items.

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
