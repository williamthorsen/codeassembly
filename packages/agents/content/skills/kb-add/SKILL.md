---
name: kb-add
description: Capture a new note into the knowledge base via agent-mediated classification with a confirm-by-default flow and an --auto escape hatch
user-invocable: true
---

# Capture a new knowledge-base note

Add a new note to the knowledge base. A bundled helper does the mechanical work — it resolves which knowledge base to write to, generates UTC dates, canonicalizes known-alias tags, validates the proposed frontmatter against the destination KB's schema, and writes the file atomically. You do the judgment work — pick the folder, the type, the title, and the tags; survey the destination KB's existing layout; run `kb-retrieve` to find related notes; and compose the body, including cross-references where they aid comprehension.

The split is deliberate: the helper is narrow and mechanical; the classification and composition are wide and judgment-driven. Treat the helper as a guardrail (it refuses to write notes that fail validation or collide with an existing file), not as a classifier.

**Announce at start:** "Using kb-add to capture {short description of the note}."

## Arguments

| Argument          | Description                                                                             | Required |
| ----------------- | --------------------------------------------------------------------------------------- | -------- |
| `--type`          | The note's `type` field (e.g. `howto`, `concept`, `reference`, `tutorial`).             | Yes      |
| `--title`         | The note title; also doubles as the filename.                                           | Yes      |
| `--kb`            | Explicit knowledge base name; overrides the discovered `.kb/` and the registry default. | No       |
| `--folder`        | KB-relative folder under which to write the note. Defaults to the KB root.              | No       |
| `--tags`          | Comma-separated tag list. Known aliases are canonicalized at write time.                | No       |
| `--last-verified` | `YYYY-MM-DD` date the note's claims were last verified.                                 | No       |

A value-bearing flag accepts both `--type howto` and `--type=howto`. The note body is read from stdin to EOF; an empty body is allowed when a stub note is appropriate.

### KB selection

By default the helper writes to the knowledge base discovered by walking up from the current directory for a `.kb/` folder. When no `.kb/` is discovered, it falls back to the registry's default-marked entry. `--kb <name>` overrides both, naming a specific entry from the merged `kb.yaml` registry. The chosen KB is surfaced in the proposal so you can redirect the user via `--kb` if it is wrong.

## Runtime dependencies

- **`node` ≥ 24** — the bundled helper inherits the Node version floor of `@codeassembly/kb-core`.

## Modes

- **Default mode**: Gather context, propose placement and body, present the proposal to the user, write only after confirmation.
- **Auto mode (`--auto`)**: Gather context, pick the best inference, write silently. The agent never asks clarifying questions in this mode.

The `--auto` flag is consumed by you, not by the bundled helper; it controls whether you present the proposal for confirmation before invoking the helper.

## Process

### 1. Gather context

Read the note content from the conversation or, if the user pointed to one, from a file. Identify the topic, the intent (procedural vs explanatory vs reference-style), and any obvious entities (libraries, tools, concepts).

### 2. Survey the destination KB

List the top-level folders of the resolved knowledge base and a representative sample of notes from the folder most likely to fit the new note's topic. This survey informs the folder choice and reveals naming conventions already in use.

### 3. Cross-reference via kb-retrieve

Invoke the `kb-retrieve` skill on the note's topic terms. Read the top-ranked candidates; they are the inputs for your cross-referencing decisions in step 5. This step is mandatory in both default and auto modes — the proposal should always either embed cross-references or explicitly note that none are warranted.

### 4. Classify

Pick the placement and metadata:

- **Folder**: An existing folder when one fits; a new folder when the topic is genuinely new to the KB.
- **Type**: One of the destination KB's `types` (the default vocabulary is `howto`, `concept`, `reference`, `tutorial`).
- **Title**: A concise, descriptive title. For `type: howto`, propose imperative-led titles ("Configure pnpm workspaces") not interrogative ones ("How do I configure pnpm workspaces?"). The title is also the filename — keep it within a sane length and avoid filesystem-hostile characters.
- **Tags**: Topic and category tags drawn from existing tag vocabulary where possible. Known aliases will be canonicalized at write time by the helper.

### 5. Compose the body

Write the note body. Embed cross-references inline where the reference contributes at the point of mention; group tangential references under a `## See also` heading at the end. Prefer file-relative or KB-relative links.

### 6. Present the proposal (default mode)

In default mode, present the proposed KB, folder, type, title, tags, and body to the user. Wait for confirmation or a redirect. In auto mode, skip this step.

### 7. Invoke the helper

Pipe the composed body to the bundled helper. A heredoc keeps multi-line bodies legible without the quoting and escaping gymnastics that `echo "$BODY"` invites once the note contains backticks, blank lines, or shell metacharacters:

```bash
cat <<'EOF' | node "$(dirname "$SKILL_PATH")/kb-add.mjs" \
  --type <type> --title "<title>" \
  [--kb <name>] [--folder <kb-relative-folder>] \
  [--tags <comma,separated>] [--last-verified YYYY-MM-DD]
<note body, may span multiple lines and contain any characters>
EOF
```

Or, when the skill directory is known:

```bash
cat <<'EOF' | node {platform_home_dir}/skills/kb-add/kb-add.mjs \
  --type howto --title "Configure pnpm workspaces" --tags "pnpm,workspaces"
Configure pnpm workspaces by adding a `pnpm-workspace.yaml` at the repo
root that lists each package directory under `packages:`.
EOF
```

The helper prints a JSON object to stdout:

- `ok: true` with `path`, `kb`, `frontmatter`, `originalTags`, `canonicalTags` on success.
- `ok: false` with `error`, `message`, and optional `details` on a recoverable failure.

### 8. Handle the result

On `ok: true`, report the written path and the canonicalization audit trail. When `canonicalTags` differs from `originalTags`, surface which tags were canonicalized so the user can confirm the change matches their intent.

On `ok: false`, route by the `error` code:

- `no-kb-resolvable` — no `.kb/` discovered, no registry default, and no `--kb` resolved. Ask the user where the note should go (or, in auto mode, fail visibly with the categorical reason).
- `invalid-args` / `invalid-title` — Surface the helper's message and propose a corrected invocation.
- `schema-validation` — Surface the findings; either correct the proposed frontmatter or, when the user is willing, declare a new type in the KB's `.kb/schema.yaml`.
- `collision` — A note already exists at the target path. Decide whether to re-title, append the new material to the existing note (read it first, then write a follow-up edit), or abort.

## Completion

A written note at the reported path, with valid frontmatter per the destination KB's schema, plus the canonicalization audit trail so the user can verify which alias tags were rewritten.
