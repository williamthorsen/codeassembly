# Partials

Partials are reusable Markdown fragments shared across skills, subagents, and platform guidance. The install pipeline expands include directives at install time, before frontmatter merging, marker injection, and link rewriting. Partials never reach installed output as standalone files; their content is inlined into each consumer.

This README is the canonical reference for the partial system. The expander is implemented in `packages/agents/src/lib/directive-expander.ts`.

## Directive grammar

Three include shapes are recognized. Each must occupy a full line, with optional leading and trailing whitespace. Inline directives inside prose or code spans are not expanded.

| Shape         | Syntax                                           | Use                                                                               |
| ------------- | ------------------------------------------------ | --------------------------------------------------------------------------------- |
| Self-close    | `<!-- include: path / -->`                       | Inline a partial with no slot content (or use the partial's empty-slot defaults). |
| Open + close  | `<!-- include: path -->` ... `<!-- /include -->` | Inline a partial and pass slot content into its `<!-- children -->` placeholder.  |
| Children slot | `<!-- children -->`                              | Inside a partial: Marks where the caller's slot content is substituted.           |

Self-close is matched before open so that a path with a trailing slash is read correctly as a self-close, not as an open directive whose path ends with a slash.

The `<!-- children -->` placeholder is a partial-side directive. It appears at most once per partial. If a partial has no `<!-- children -->` and the caller provides slot content, the expander throws `slot-without-children`. If a partial has `<!-- children -->` and the caller provides no slot content (bare self-close, or empty open/close pair), the placeholder line is removed and surrounding lines join verbatim.

## Path resolution

Include paths are resolved relative to the directive-bearing file's directory in the source tree. The resolved target must remain inside `packages/agents/content/` (lexical containment is checked, not symlink resolution). Out-of-tree references throw `out-of-tree`.

A partial's own includes are resolved relative to that partial's directory, not the caller's. This means a deeply nested partial can include a sibling partial without knowing where its caller lives.

## Partial locations

Partials are stored in `_partials/` directories. The directory is recognized at any depth and is excluded from the install copy:

- `content/_partials/` — cross-cutting partials shared across skills, subagents, and platform guidance.
- `content/subagents/_partials/` — partials shared across subagents.
- `content/skills/_partials/` — partials shared across skills.
- `content/skills/{name}/_partials/` — partials internal to a single skill.

The `_partials` directory itself never appears in installed output.

## Install pipeline

For each `.md` source file the install pipeline performs, in order:

1. **Expand includes.** `expandIncludes(srcPath, contentDir)` resolves all directive shapes recursively and substitutes slot content.
2. **Merge frontmatter** (subagents only). Platform-specific frontmatter overrides from `_data/{platform}.yml` are merged into the source's frontmatter.
3. **Rewrite tool-name placeholders.** `rewriteToolNames(content, mapping)` replaces each `{tool:NAME}` placeholder using the platform's `_tools:` mapping from the same overlay YAML. An unmapped name is a fatal install error anchored to the source file and line. See [Tool-name placeholders](#tool-name-placeholders).
4. **Inject the provenance marker.** A `GENERATED FILE` comment is added at the top of the output, with a `Source:` link to the original file.
5. **Rewrite paths** (skills only, post-write). Bare-relative Markdown links are rewritten to absolute platform paths.
6. **Write the destination file.**

For subagents, all steps run on the in-memory merged string before write. For directory-form skills, step 3 runs on each value of the in-memory `expandedDirContents` map before `writeExpandedSkillDir` writes files to disk; step 5 (path rewriting) then runs as a second pass over the written tree. For flat-file skills, step 3 runs on `expandedFileContent` before `writeFile`.

Expansion runs before the dry-run gate, so missing partials, cycles, and out-of-tree references surface even when no files would be written.

## Tool-name placeholders

Subagent and skill body text reference tools using the `{tool:NAME}` placeholder so the same source can install for platforms that name their tools differently. `NAME` is the canonical (Claude) tool name (`Read`, `Write`, `Edit`, `Bash`, `Grep`, `Glob`). The install pipeline rewrites each placeholder using the platform's `_tools:` mapping, which lives at the top of each overlay YAML at `content/subagents/_data/{platform}.yml`.

```yaml
# content/subagents/_data/rovodev.yml
_tools:
  Bash: bash
  Edit: find_and_replace_code
  Glob: expand_folder
  Grep: grep
  Read: open_files
  Write: create_file
```

When a placeholder names a tool not present in the overlay's `_tools:` mapping, the rewriter aborts install with a fatal error anchored to the source file and line. There is no identity pass-through — every match must resolve through the mapping. This catches typos (e.g., `{tool:Reed}`) and out-of-date placeholders at install time rather than at agent runtime.

**Authoring guidance:**

- Use `{tool:NAME}` for body prose that names a tool *as a tool*, not for English verbs ("Read the file", "Write a paragraph", "Read project guidelines" are not migrated).
- Preserve surrounding context: `` `Write` `` becomes `` `{tool:Write}` ``; bare `Write` becomes `{tool:Write}`.
- Do **not** use placeholders in frontmatter `tools:` values. Frontmatter is replaced wholesale by the overlay merger; placeholders there would create two overlapping mechanisms.
- The placeholder mechanism is body-only, applied to subagent and skill `.md` files. Guidance files (`content/guidance/`) are not wired through the rewriter.

## Verbatim slot substitution

When a partial contains `<!-- children -->`, expansion removes that line and inserts the caller's slot lines verbatim — no leading-trim, no trailing-trim, no blank-line collapsing. Partial authors control the spacing on their side; caller authors control the spacing on theirs.

A consequence: Avoid placing blank lines on both sides of a `<!-- children -->` boundary. If the partial has a blank line above `<!-- children -->` and the caller's slot content begins with a blank line, the result is two consecutive blank lines.

## Common patterns

### Bare self-close — No slot

Use when the partial has no `<!-- children -->` placeholder, or when the caller wants the partial's empty-slot rendering:

```
<!-- include: _partials/shared-prose.md / -->
```

### Open/close with slot content

Use when the partial has `<!-- children -->` and the caller wants to fill it:

```
<!-- include: _partials/with-slot.md -->
Caller-provided slot lines.
Multiple lines are allowed.
<!-- /include -->
```

### Empty open/close pair

Functionally equivalent to bare self-close. Useful when the surrounding text reads more naturally as an explicit empty pair:

```
<!-- include: _partials/with-slot.md -->
<!-- /include -->
```

## Forward-compatibility constraints

The grammar reserves additional tokens for future use. Partial authors must not emit them in source content:

- `<!-- slot: name -->`, `<!-- slot: name / -->`, `<!-- /slot -->` — reserved for future named-slot support.
- `<!-- children -->` — the canonical default-slot placeholder. Use exactly this token; do not invent variants.

The expander rejects unrecognized parameters following `include:` with an `unrecognized-parameter` error. This protects the grammar from typos quietly slipping past.

## Frontmatter constraint

Partials must not contain YAML frontmatter (a leading `---` block). Subagent install merges frontmatter from a platform overlay file with frontmatter in the source `.md`; if a partial carried its own `---` block, the merge would conflict. The expander does not enforce this constraint at runtime — partial authors must avoid frontmatter explicitly.

## Errors

The expander surfaces structured errors for the following conditions. Each error includes the file path and line number of the offending directive (or, for slot-without-children, the caller's open-directive line).

| Reason                   | Cause                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `cycle`                  | A partial transitively includes itself.                                                  |
| `not-found`              | The resolved path does not exist on disk.                                                |
| `orphan-close`           | A close directive has no matching open.                                                  |
| `out-of-tree`            | The resolved path escapes `contentDir`.                                                  |
| `slot-without-children`  | The caller provided slot content but the partial has no `<!-- children -->` placeholder. |
| `unclosed-open`          | An open directive was never followed by a matching close.                                |
| `unrecognized-parameter` | A directive uses `include:` syntax but does not match any recognized shape.              |
