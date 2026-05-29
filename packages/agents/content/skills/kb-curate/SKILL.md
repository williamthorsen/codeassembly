---
name: kb-curate
description: Audit a knowledge base for vault-wide hygiene — broken wikilinks, hardcoded paths, tag drift, stale verification, and supersede-chain defects — and optionally apply a curated safe set of fixes
user-invocable: true
---

# Curate a knowledge base

Report vault-wide hygiene findings for a single knowledge base and, with `--apply`, perform only the two mechanically safe fixes. A bundled helper does the mechanical work — it resolves the KB, walks every note, runs the detection rules, and (under `--apply`) delegates tag canonicalization to `kb-edit` and rewrites stale path-qualified wikilinks inline. You do the judgment work — read the findings, decide which report-only items to act on, and run the named follow-up commands.

The split is deliberate: detection is exhaustive and mechanical; remediation is conservative. The helper auto-fixes only what is mechanically safe and leaves everything else as a report-only finding that names the operator's next step.

For a single note's edit, use `kb-edit`. For new notes, use `kb-add`. For finding notes, use `kb-retrieve`.

**Announce at start:** "Using kb-curate to {audit | audit and fix} the {kb name} knowledge base."

## Arguments

| Argument            | Description                                                                                  | Required |
| ------------------- | -------------------------------------------------------------------------------------------- | -------- |
| `--kb <name>`       | The knowledge base to curate. Falls back to a discovered `.kb/`, then the registry default.  | No       |
| `--apply`           | Perform the two safe fixes (tag canonicalization, path-only wikilink rewrites). Default off. | No       |
| `--stale-after <n>` | Verification-staleness threshold in whole days. Positive integer; defaults to 90.            | No       |

A value-bearing flag accepts both `--kb coding` and `--kb=coding`. With no flags, the helper produces a read-only report.

### KB selection

The knowledge base is resolved the same way as `kb-add`: `--kb <name>` (explicit) beats a discovered `.kb/` folder, which beats the registry's default-marked entry. A read-only report run accepts a KB marked `readonly: true` in `kb.yaml`; `--apply` against a readonly KB is refused with `readonly-kb`. Curating spans a single KB per run — wikilink resolution and supersede chains are only valid within one vault, so curating several vaults is a shell loop over `--kb`.

## Runtime dependencies

- **`node` ≥ 24** — the bundled helper inherits the Node version floor of `@codeassembly/kb-core`.
- **Sibling `kb-edit.mjs`** — required only for `--apply` tag canonicalization. The helper resolves it next to its own bundle; if the skills are deployed without co-location, tag fixes fail with a clear message while the read-only report and the wikilink sweep are unaffected.

## Detection categories

The helper reports findings across five categories. Each finding carries a rule code and a severity aligned with the `kb-core` rule contract.

| Rule code               | Severity | Meaning                                                           |
| ----------------------- | -------- | ----------------------------------------------------------------- |
| `wikilinks.unresolved`  | error    | A `[[Target]]` does not resolve to any vault note.                |
| `wikilinks.ambiguous`   | warning  | A `[[Target]]` basename matches more than one note.               |
| `paths.user-home`       | error    | A hardcoded `/Users/{name}/` path; use `~/` instead.              |
| `frontmatter.tag-alias` | warning  | A `tags` entry is a known alias of a canonical tag.               |
| `frontmatter.*`         | error    | Other frontmatter defects (missing, parse, required, type, date). |
| `verification.unmarked` | warning  | The note has no `last-verified` field.                            |
| `verification.stale`    | warning  | `last-verified` is older than `--stale-after` days.               |
| `supersede.dangling`    | error    | A `superseded-by`/`supersedes` target is not a vault note.        |
| `supersede.cycle`       | error    | The note participates in a `superseded-by` loop.                  |
| `supersede.asymmetric`  | warning  | `A.superseded-by → B` without the matching `B.supersedes → A`.    |

## Remediation under `--apply`

Only two fixes are applied; everything else stays report-only.

- **Tag canonicalization** — for each note with a `frontmatter.tag-alias` finding, the helper invokes `kb-edit --retag` once with the note's current tags, so `kb-edit` remains the sole writer of frontmatter. `kb-edit` rewrites each tag through the KB's alias map.
- **Path-only wikilink rewrites** — a cross-file sweep that normalizes a link's stale path prefix when its basename resolves to exactly one note. The rewrite preserves any `|alias`, `#anchor`, and the path-qualified style; unresolved and ambiguous links are never auto-rewritten.

Each fix returns a per-finding result reporting `ok: true/false` and the operation invoked. A single fix failure does not abort the run.

### Report-only follow-ups

The remaining findings name the operator's next step:

- **Stale or unmarked verification** → re-confirm the note, then `kb-edit <path> --verify`.
- **Supersede defects** → repair with `kb-edit <old> --supersede-with <new>`, or correct the offending frontmatter field.
- **Unresolved or ambiguous wikilinks, hardcoded paths** → resolve manually; these are too context-dependent to auto-fix.

## Process

### 1. Run the read-only report first

Always start without `--apply`. Read the findings and decide which report-only items warrant action.

```bash
node "$(dirname "$SKILL_PATH")/kb-curate.mjs" --kb coding
node "$(dirname "$SKILL_PATH")/kb-curate.mjs" --kb coding --stale-after 30
```

### 2. Apply the safe fixes when warranted

```bash
node "$(dirname "$SKILL_PATH")/kb-curate.mjs" --kb coding --apply
```

### 3. Handle the result

The helper prints a JSON object to stdout. On success the payload carries `ok: true`, the run `mode` (`report` or `apply`), the resolved `kb`, the `findings` array, a severity `summary`, and (under `--apply`) an `applied` array of per-fix results. Under `--apply`, the reported `findings` are the residual findings after the fixes ran.

On failure, `ok: false` plus a categorical `error` code:

| Code               | What it means                                                           | What to do                                                     |
| ------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------- |
| `invalid-args`     | Unknown flag, missing value, or a non-positive-integer `--stale-after`. | Correct the invocation. The message names the specific defect. |
| `no-kb-resolvable` | No `.kb/` discovered, no registry default, and `--kb` matched nothing.  | Confirm the `--kb` name or run from inside the vault.          |
| `readonly-kb`      | `--apply` was used against a KB marked `readonly: true` in `kb.yaml`.   | Drop `--apply` for a read-only report, or use a writable KB.   |

System failures (out-of-disk, permission denied) print to stderr and exit non-zero. They are out of band and never appear as a structured `error` code.

## Completion

A hygiene report for the resolved KB, partitioned by severity, with each report-only finding naming its follow-up command. Under `--apply`, the safe fixes are written and the residual findings plus per-fix results are reported so the user can verify what changed and what remains.
