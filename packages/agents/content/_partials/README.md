<!-- readme-type: content -->

# Partials

Partials are reusable Markdown fragments shared across rulebooks, skills, subagents, and platform guidance. The install pipeline expands include directives at install time, before frontmatter merging, marker injection, and link rewriting. It never writes a partial as a standalone file; instead, it inlines the content into each consumer.

This README is the canonical reference for the partial system. The expander is implemented in `packages/agents/src/lib/directive-expander.ts`.

## Choosing a bucket

Shared Markdown belongs in one of two buckets. The bucket is chosen by _when_ the agent needs the content, not by _what kind_ of content it is; the choice decides whether the agent reliably sees it at all.

- **`_partials/`: Content that the agent must reproduce, or must apply as it writes.** Output blocks, option menus, render formats, checklists to work through, and the doctrine for an act that it performs every time (what belongs in a comment, how tight a ticket must be). Inlined at install time, so it is in context the moment the agent acts.
- **`_data/`: Content that the agent consults when a situation arises.** Resolution tables, classification rubrics, ranking criteria. Accessed through a runtime Markdown link and read only when the situation calls for it.

A runtime link is an optional read. When the model already has a strong prior for what the content looks like (and it does, for anything resembling a standard option menu or output block), it generates from that prior instead of following the link. Emphasis is not a remedy: A `<HARD-GATE>` reading "follow its options and output format exactly; do not improvise" preceded one such link, and the agent improvised the block anyway. Never put must-reproduce content behind a runtime link.

Doctrine is not automatically reference material. A doctrine applied by the agent every time it performs the act (comment discipline, whenever it writes a comment) binds only when it is already in context, and behind a link it does not bind at all, however well written. A doctrine consulted only when a decision arises stays in `_data/`.

Inlining is not free (every consumer contains the partial's full text), so content that the agent needs only sometimes stays in `_data/`. A spec that is partly apply-time and partly reference splits into those two parts: The binding contract becomes a partial, and the reference material stays in `_data/` and includes the partial. There is still one source of truth. If a doctrine does not have a reference-only part, it is a partial outright, and a `_data/` doc does not remain for it.

Inline a spec **once per skill, as a section**, and point every use site at it with an in-file anchor (`[option format](#option-format)`). Anchor-only links pass through the link rewriter untouched. A skill with two use sites would otherwise contain the block twice, and a reference from inside a numbered procedure cannot contain a long block inline. An in-file anchor does not require an extra read, because the content is already in context; the filesystem lookup is the defect, not the pointer.

### Skill-local pointers are required

Several skill bodies (`collaborate`, `design-and-plan`, and `refine-plan` among them) contain a pointer to the option-format rules at their question-asking steps, duplicating the universal rule in `AGENTS.md`. That duplication is intentional, and a DRY-driven refactor must not strip it. The rule and its rationale are stated in the repo-local `codeassembly-repo-conventions` rulebook (`.agents/content/guidance/rulebooks/`), under "Skill-local reinforcement".

## Directive grammar

Three include shapes are recognized. Each must occupy a full line, with optional leading and trailing whitespace. That whitespace affects recognition alone; injected lines keep the partial's own indentation rather than the directive's, so a directive cannot appear inside a list item. Inline directives inside prose or code spans are not expanded.

| Shape         | Syntax                                           | Use                                                                               |
| ------------- | ------------------------------------------------ | --------------------------------------------------------------------------------- |
| Self-close    | `<!-- include: path / -->`                       | Inline a partial without slot content (or use the partial's empty-slot defaults).  |
| Open + close  | `<!-- include: path -->` ... `<!-- /include -->` | Inline a partial and pass slot content into its `<!-- children -->` placeholder.  |
| Children slot | `<!-- children -->`                              | Inside a partial: Marks where the caller's slot content is substituted.           |

Self-close is matched before open so that a path with a trailing slash is read correctly as a self-close, not as an open directive whose path ends with a slash.

The `<!-- children -->` placeholder is a partial-side directive. It appears at most once per partial. If a partial does not have `<!-- children -->` and the caller provides slot content, the expander throws `slot-without-children`. If a partial has `<!-- children -->` and the caller does not provide any slot content (bare self-close, or empty open/close pair), the placeholder line is removed and surrounding lines join verbatim.

## Directive placement

If a host heading follows a directive and is deeper than the shallowest heading that the injection contributes, it renders as a subsection of the injected content rather than of the host body. Place every directive where the next host heading is at or above that level. The `codeassembly-content-specification` rulebook states the rule that an author follows, under "Injection-point placement"; this section explains the level computation behind it.

The deciding level is what the injection contributes, not a fixed `##`. A partial contributes its headings as authored, and `##` for any guidance hook that it declares, since hooks resolve after includes expand and so are filled inside the host. For example, `subagents/_partials/review-writes-scaffold.md` opens at `###`, and the `###` sections following it are its correct siblings. A hook declared by the host contributes `##` on its own, because a bound rulebook's title is demoted one level to fit.

Slot content is the caller's own text and contributes nothing here: A heading passed into a partial's `<!-- children -->` is authored in the host beside the section that follows it. Its nesting is already visible where it is written. `codeassembly validate` enforces the rule.

## Path resolution

Include paths are resolved relative to the source-tree directory of the file that contains the directive. The resolved target must remain inside `packages/agents/content/` (lexical containment is checked, not symlink resolution). The expander throws `out-of-tree` for an out-of-tree reference.

A partial's own includes are resolved relative to that partial's directory, not the caller's. This means a deeply nested partial can include a sibling partial without knowing where its caller is.

### What breaks when a partial moves between host kinds

Two things that a partial may contain are resolved against the host that inlines it rather than against the partial, so neither survives a move between host kinds.

A **relative Markdown link** cannot serve both a skill host and a rulebook host. A skill's links resolve against `<slug>/SKILL.md` in skills-dir space; a rulebook's resolve against `guidance/rulebooks/<slug>.md` in content-root space. One authored target therefore names two different files, and a skill-shaped one resolves outside a rulebook's linkable roots and fails the run. Write the target as `{harness_home_dir}/...` inside inline code when a partial must refer to a file from both.

A partial that `guidance/shared/AGENTS.md` inlines does not contain any relative link at all. That file is inlined into each harness's guidance file at the harness home root, where a source-tree-relative target names nothing, so the template-variable form is the only one that resolves to a file from there. `codeassembly validate` scans the expanded body and reports a relative target that it finds.

A **`{rulebook:<slug>}` token** cannot serve both a skill body and a support entry under `skills/`. The deployed rulebook set is available only to a host that resolves a declaration, and a source's support entries deliver to every consumer of the source, whichever rulebooks that consumer declares. The token renders in the skill but breaks the support entry's delivery.

## Path references in installed content

Installable content is rewritten at install time. Author cross-references in one of three forms, depending on intent:

- **Runtime references**: Paths that the agent reads or executes at runtime. Use `[text](relative/path.md)` for a Markdown link, or `{harness_home_dir}/...` inside inline code or a command (e.g., `{harness_home_dir}/skills/_data/work-types.json`), the form that a partial inlined at several depths can use. Both name a file by its place in the content tree, and the pipeline resolves both to where that file is deployed: A target naming a skill deployed by the same run resolves where that run wrote it, a target in one of the owning source's support entries resolves into that source's namespace, `skills/_sources/<name>/`, and anything else resolves to the harness home. `sync --global` anchors the first two under the harness home, and bare `sync` under the project root. Every other `{harness_home_dir}` expands to the platform home (e.g., `~/.claude`), where `scripts/` deploys.
- **Source-tree citations**: Prose pointing the reader to the canonical implementation, like a doc reference. A bare `packages/agents/content/...` path is acceptable in this case, but the file must be added to the allowlist in `packages/agents/content/__tests__/content-path-conventions.unit.test.ts`.
- **Self-referential prose** about the source tree itself (e.g., this paragraph) is treated as a source-tree citation.

The `content-path-conventions` regression test flags any raw `packages/agents/content/` string in installable Markdown outside the allowlist.

## Partial locations

Partials are stored in `_partials/` directories. The directory is recognized at any depth and is excluded from the install copy:

- `content/_partials/`: Cross-cutting partials shared across skills, subagents, and platform guidance.
- `content/subagents/_partials/`: Partials shared across subagents.
- `content/skills/_partials/`: Partials shared across skills.
- `content/skills/{name}/_partials/`: Partials internal to a single skill.

The `_partials` directory itself never appears in installed output.

## Install pipeline

For each `.md` source file, the install pipeline performs, in order:

1. **Expand includes.** `expandIncludes(srcPath, contentDir)` resolves all directive shapes recursively and substitutes slot content.
2. **Merge frontmatter** (subagents only). Platform-specific frontmatter overrides are merged into the source's frontmatter from the `_data/{platform}.yaml` of the content root from which the subagent resolved. A source without an overlay does not contribute any overrides.
3. **Rewrite tool-name placeholders.** `rewriteToolNames(content, harnessId)` replaces each `{tool:NAME}` placeholder with what that platform calls the tool. An unmapped name is a fatal install error that names the source file and line. See [Tool-name placeholders](#tool-name-placeholders).
4. **Inject the provenance marker.** A `GENERATED FILE` comment is added at the top of the output, with a `Source:` link to the original file.
5. **Rewrite paths** (skills only, post-write). Bare-relative Markdown links are rewritten to absolute platform paths.
6. **Write the destination file.**

For subagents, all steps run on the in-memory merged string before write. For directory-form skills, step 3 runs on each value of the in-memory `expandedDirContents` map before `writeExpandedSkillDir` writes files to disk; step 5 (path rewriting) then runs as a second pass over the written tree. For flat-file skills, step 3 runs on `expandedFileContent` before `writeFile`.

Expansion runs before the dry-run gate, so missing partials, cycles, and out-of-tree references are reported even when the run would not write any files.

## Tool-name placeholders

Subagent and skill body text reference tools using the `{tool:NAME}` placeholder so that the same source can install for platforms that name their tools differently. `NAME` is the canonical (Claude) tool name (`AskUserQuestion`, `Bash`, `Edit`, `Glob`, `Grep`, `Read`, `Task`, `Write`). The install pipeline rewrites each placeholder to the platform's own name for that tool, which `codeassembly` keeps in its harness table rather than reading from content.

The canonical set is closed and identical across platforms: Every platform names every canonical tool, so a name that one platform maps is mapped by all of them. Introducing a new canonical name is a change to `codeassembly` itself and is delivered in a release; content cannot add one.

When a placeholder names a tool outside that set, the rewriter aborts install with a fatal error that names the source file and line. The rewriter does not pass any name through unchanged; every match must resolve through the table. This catches typos (e.g., `{tool:Reed}`) and out-of-date placeholders at install time rather than at agent runtime.

**Authoring guidance:**

- Use `{tool:NAME}` for body prose that names a tool *as a tool*, not for English verbs ("Read the file", "Write a paragraph", "Read project guidelines" are not migrated).
- Preserve surrounding context: `` `Write` `` becomes `` `{tool:Write}` ``; bare `Write` becomes `{tool:Write}`.
- Do **not** use placeholders in frontmatter `tools:` values. Frontmatter is replaced wholesale by the overlay merger; placeholders there would create two overlapping mechanisms.
- The placeholder mechanism is body-only, applied to subagent and skill `.md` files. Guidance files (`content/guidance/`) are not passed through the rewriter.

## Verbatim slot substitution

When a partial contains `<!-- children -->`, expansion removes that line and inserts the caller's slot lines verbatim: It does not trim leading or trailing lines, and it does not collapse blank lines. Partial authors control the spacing on their side; caller authors control the spacing on theirs.

A consequence: Avoid placing blank lines on both sides of a `<!-- children -->` boundary. If the partial has a blank line above `<!-- children -->` and the caller's slot content begins with a blank line, the result is two consecutive blank lines.

## Common patterns

### Bare self-close: No slot

Use when the partial does not have a `<!-- children -->` placeholder, or when the caller wants the partial's empty-slot rendering:

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

- `<!-- slot: name -->`, `<!-- slot: name / -->`, `<!-- /slot -->`: Reserved for future named-slot support.
- `<!-- children -->`: The canonical default-slot placeholder. Use exactly this token; do not invent variants.
- `<!-- guidance-hook: name -->`: The guidance-hook directive, a separate mechanism with its own grammar. It occupies a full line, its name is kebab-case and letter-led, and a body may declare each hook once. It resolves after includes expand, so a hook declared by a partial is declared by each body that inlines it. A line that resembles the directive but does not match its shape, such as the plural `guidance-hooks:` or a token without a name, is rejected rather than deployed as a stray comment. Because a directive that nothing binds is removed line by line, a blank line separating two directives remains in the unbound render; a new directive goes on the line adjacent to the one that it joins. Keep the two grammars disjoint: A slot token never names a guidance hook, and a guidance-hook directive never takes an include parameter.

### Partial or guidance hook

Both put shared prose into a body, and they differ in who chooses the prose.

A **partial** resolves by path. The author writes `<!-- include: _partials/x.md / -->` and every consumer of the library gets that file, inlined at install time to byte-identical output. Use one for doctrine that the library asserts for everyone: comment discipline, the artifact conventions, anything whose content is not a matter of local taste.

A **guidance hook** resolves by binding. The author writes `<!-- guidance-hook: name -->` and leaves the slot empty; a `codeassembly.yaml` names which rulebooks fill it, per project or per machine. Use one when the right content differs by who is running (personal code-style preferences, a project's own glossary), which is exactly what a path fixed at authoring time cannot express.

A hook is filled only in a declared skill or subagent, the artifacts that a declaration covers. A directive in a rulebook body, a `skills/_data/` support entry, or a harness guidance file is always stripped, since none of them is rendered against a declaration. Declaring a hook is therefore safe anywhere; it simply does nothing where nothing can bind it. `packages/agents/docs/project-declaration.md` documents the binding syntax and the naming rules.

The expander rejects unrecognized parameters following `include:` with an `unrecognized-parameter` error. This stops a typo from being silently ignored.

## Frontmatter constraint

Partials must not contain YAML frontmatter (a leading `---` block). Subagent install merges frontmatter from a platform overlay file with frontmatter in the source `.md`; if a partial contained its own `---` block, the merge would conflict. The expander does not enforce this constraint at runtime; partial authors must avoid frontmatter explicitly.

## Errors

The expander reports structured errors for the following conditions. Each error includes the file path and line number of the offending directive (or, for slot-without-children, the caller's open-directive line).

| Reason                   | Cause                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| `cycle`                  | A partial transitively includes itself.                                                           |
| `not-found`              | The resolved path does not exist on disk.                                                         |
| `orphan-close`           | A close directive does not have a matching open.                                                  |
| `out-of-tree`            | The resolved path is outside `contentDir`.                                                        |
| `slot-without-children`  | The caller provided slot content but the partial does not have a `<!-- children -->` placeholder. |
| `unclosed-open`          | An open directive was never followed by a matching close.                                         |
| `unrecognized-parameter` | A directive uses `include:` syntax but does not match any recognized shape.                       |

## Borrowed content

`plain-speech.md` takes the term "mannered prose" and its two example pairs ("a dial worth turning" for "a parameter worth varying", "this point earns its keep" for "this point still matters") from Anthropic's Fable 5.1 prompting documentation, under "Writing density": https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-1
