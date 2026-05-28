---
name: revise-comments
description: Revise comments in target files per the comment-discipline rules, editing in place
user-invocable: true
---

# Revise comments

Apply the comment-discipline audit to a target file set. Edits comments in place per the deletion rules and carve-outs. The default workflow is `/revise-comments` after a feature is implemented; explicit paths support cleaning up legacy code.

## Invocation

- `/revise-comments` — default target is files changed on the current branch, including committed and uncommitted work.
- `/revise-comments <path> [<path>...]` — explicit file or directory targets. Directories are processed recursively.
- `/revise-comments --dry-run [...]` — produce the summary without applying edits. Triage and dry-run are unified under this flag.

## Process

1. **Read the discipline doc.** Read `{platform_home_dir}/skills/_data/comment-discipline.md` before any edits. The audit below depends on its definitions; do not derive them from memory.

2. **Resolve the target file set.**

   With no argument, the target is the union of files changed on the current branch (committed, staged, unstaged, and untracked). Obtain `default_branch` via `node {platform_home_dir}/skills/derive-session-context/derive-session-context.mjs`, then:

   ```bash
   (
     git diff --name-only --diff-filter=AM "$(git merge-base "$default_branch" HEAD)..HEAD"
     git diff --name-only --diff-filter=AM
     git diff --cached --name-only --diff-filter=AM
     git ls-files --others --exclude-standard
   ) | sort -u
   ```

   With explicit arguments: for each argument, if it is a file, add it to the set; if it is a directory, add all comment-supporting files under it recursively.

3. **Apply the audit per file.** Read each target file. For each comment, apply the audit checklist below. Decide one of three actions: kept, deleted, or rewritten. In normal mode, apply edits in place via the Edit tool. In `--dry-run` mode, record the proposed action without editing.

4. **Honor the carve-outs.** See the next section.

5. **Emit the summary.** After processing all targets, emit one table per file with non-trivial decisions.

## Audit checklist

<!-- include: ../../_partials/comment-audit-checklist.md / -->

## Carve-outs

- **Test files.** Path contains `__tests__/` or filename matches `*.spec.*` / `*.test.*`. Inside a test file, keep comments that explain non-obvious setup, indirect assertions, or intentional skips (see the discipline doc's "Test comments" section). The deletion rules still apply to everything else inside the test file.
- **`eslint-disable` rationales.** Lines beginning with `eslint-disable`, `eslint-disable-next-line`, `eslint-disable-line`, or the block forms `/* eslint-disable */` and `/* eslint-enable */`. Keep the rationale, tightened to name only why the rule is suppressed at that line. Strip surrounding context, ticket references, and design discussion.

## When to pause and ask

The default is to act. Pause and ask the user when one of these holds:

- A test comment could plausibly be non-obvious setup, but the test name already conveys the setup intent.
- An `eslint-disable` rationale sits at the boundary between tight and over-scoped.
- A file header describes potentially load-bearing architecture (composition order, threading model, invariants across functions), so the "tutorial-style file header" rule is not unambiguously applicable.

## Summary format

After processing, emit one Markdown table per file. Skip files with zero decisions. The same format appears in normal and `--dry-run` runs; in dry-run mode, append `(dry-run)` to the heading.

```
revise-comments summary

src/lib/payload.ts
| Line | Action    | Rule                                       |
| ---- | --------- | ------------------------------------------ |
| 1-2  | deleted   | 7: tutorial-style file header              |
| 6    | rewritten | 2, 8: conversation + process commentary    |
| 8    | kept      | 10: "why" inline                           |
```

Line numbers anchor to the pre-edit file, so the summary can be cross-referenced against `git diff` output. Multiple rules on one line are comma-separated.

## Safety

<HARD-GATE>
Never edit files outside the resolved target set. Resolve the set once at the start of the run and stay within it. Do not follow imports, expand to siblings, or touch files reachable from a touched file but outside the original set.
</HARD-GATE>

## Worked example

A small file demonstrating multi-comment revision end-to-end.

**Before** (`src/lib/payload.ts`):

```ts
// Helpers for building the request payload sent to the orchestrator API.
// Originally added in PR #423 to consolidate the type narrowing logic.

import type { Payload } from './types';

// Build the canonical payload shape. We discussed inlining but it's used at three call sites.
export function buildPayload(input: Input): Payload {
  // react-select types value as a union; narrow to array.
  const items = Array.isArray(input.value) ? input.value : [input.value];
  return { items };
}
```

**After:**

```ts
import type { Payload } from './types';

/** Build the canonical payload shape. */
export function buildPayload(input: Input): Payload {
  // react-select types value as a union; narrow to array.
  const items = Array.isArray(input.value) ? input.value : [input.value];
  return { items };
}
```

**Summary emitted:**

```
revise-comments summary

src/lib/payload.ts
| Line | Action    | Rule                                       |
| ---- | --------- | ------------------------------------------ |
| 1-2  | deleted   | 7: tutorial-style file header              |
| 6    | rewritten | 2, 8: conversation + process commentary    |
| 8    | kept      | 10: "why" inline                           |
```
