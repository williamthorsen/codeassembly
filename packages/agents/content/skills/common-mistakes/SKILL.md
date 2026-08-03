---
name: common-mistakes
description: Common mistakes to avoid across categories with cross-references to specific rule files
user-invocable: false
dependencies:
  rulebooks:
    - williamthorsen-code-layout-preferences
    - williamthorsen-typescript-preferences
---

# Common mistakes

This file has high importance because it describes mistakes commonly made despite explicit contrary instructions.

## Rule compliance

### Following categorized guidance

When implementing rules, follow complete guidance from the appropriate category:

- **Language mechanics** → See `consult-williamthorsen-typescript-preferences` skill
- **Development processes** → See `development-workflows` skill
- **Code organization** → See `consult-williamthorsen-code-layout-preferences` skill
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

This is a frequently repeated mistake. Do not insert newlines to wrap the commit body at a fixed column width. Every tool that displays commit messages (GitHub, Bitbucket, terminal pagers) handles wrapping. Manually broken lines create ragged text, produce unnecessary diffs when reflowed, and make commit messages harder to search.

Write each paragraph or list item as a single unwrapped line. Let the viewer handle wrapping.

Wrong:

```
Add no-automated-tests-in-test-plan rule to summarize-change and
review-criteria skills. Add PR comment labeling rules to review-criteria
(finding IDs map to descriptive labels like `fixme:`, `warning:`).
```

Right:

```
Add no-automated-tests-in-test-plan rule to summarize-change and review-criteria skills. Add PR comment labeling rules to review-criteria (finding IDs map to descriptive labels like `fixme:`, `warning:`).
```

## Pull requests

### Test plans

- Never include automated quality checks (CI, linting, type-checking, formatting) in test plans. They run automatically.

## Editing generated files

Files installed by the agents installer (under `~/.claude/`, `~/.agents/`, and other platform homes) are **generated artifacts**. The source of truth lives in `williamthorsen/codeassembly` under `packages/agents/content/`.

Look for a provenance marker at the top of the file. Generated files carry one of two formats:

- **YAML frontmatter:** three `# GENERATED FILE …` comment lines immediately after the opening `---`
- **No frontmatter:** three `<!-- GENERATED FILE … -->` comment lines at the top

If you see a marker, **do not edit the file in place** — the change will be silently overwritten on the next `codeassembly install`. Instead:

1. Edit the source file in `williamthorsen/codeassembly` (the marker's `Source:` line links directly to it)
2. Open a PR against that repo
3. After merge, re-run `codeassembly install` to pick up the change

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

### Finding IDs out of context

- Finding IDs (`F1`, `W2`, `T3`, etc.) belong only in review documents. Never use them in commit messages, PR descriptions, tickets, or plans.
- When posting findings as PR comments, use descriptive labels (`fixme:`, `warning:`, `todo:`, `suggestion:`, `recommendation:`) instead. See `review-criteria` skill for the full mapping.
