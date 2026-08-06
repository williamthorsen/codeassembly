---
name: kb-add
description: Capture a new note into the knowledge base via agent-mediated classification with a confirm-by-default flow and an --auto escape hatch
user-invocable: true
---

# Capture a new knowledge-base note

Add a new note to the knowledge base. A bundled helper does the mechanical work — it resolves which knowledge base to write to, reports that base's declared structure, generates UTC dates, canonicalizes known-alias tags, composes a typed assertion record, writes the file atomically under the KB's assertions root (`content/assertions/`), and records the note's folder in the base's taxonomy. You do the judgment work — pick the topic folder, the Diátaxis label, the title, and the tags; run `kb-retrieve` to find related notes; and compose the body, including cross-references where they aid comprehension.

The split is deliberate: the helper is narrow and mechanical; the classification and composition are wide and judgment-driven. Treat the helper as a guardrail (it refuses a title that cannot be a filename and will not overwrite an existing file), not as a classifier.

**Announce at start:** "Using kb-add to capture {short description of the note}."

## Arguments

| Argument               | Description                                                                                                                                                                   | Required |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `--auto`               | Skip the proposal step and route any domain the write declares to `provisional:`. See [Modes](#modes).                                                                        | No       |
| `--diataxis`           | The note's Diátaxis label (e.g. `howto`, `concept`, `reference`, `tutorial`).                                                                                                 | No       |
| `--domain-description` | One-line description for a domain the write declares. Carries prose, not a path — the path comes from `--folder`. Without it the domain is declared bare.                     | No       |
| `--folder`             | Topic subpath beneath the assertions root (`content/assertions/`). The helper owns the `assertions/` segment — pass the topic only. Defaults to `content/assertions/` itself. | No       |
| `--kb`                 | Knowledge base name, or `@default` for the registry default. Overrides `.kb/` discovery; the registry default is reachable only via `--kb @default`.                          | No       |
| `--survey`             | Report the destination's shape and exit. Takes `--kb` alone; writes nothing and reads no stdin. See [step 2](#2-survey-the-destination-kb).                                   | No       |
| `--tags`               | Comma-separated tag list. Known aliases are canonicalized at write time.                                                                                                      | No       |
| `--title`              | The note title; also doubles as the filename.                                                                                                                                 | Yes      |

A value-bearing flag accepts both `--diataxis howto` and `--diataxis=howto`. The note body is read from stdin to EOF; an empty body is allowed when a stub note is appropriate.

### KB selection

By default the helper writes to the knowledge base discovered by walking up from the current directory for a `.kb/` folder. When no `.kb/` is discovered and no `--kb` is given, the helper refuses to write rather than guessing a destination. `--kb <name>` names a specific entry from the merged `kb.yaml` registry and overrides discovery; `--kb @default` is the only way to reach the registry's `default_kb`. The chosen KB is surfaced in the proposal so you can redirect the user via `--kb` if it is wrong.

## Runtime dependencies

- **`node` ≥ 24** — the bundled helper inherits the Node version floor of `@williamthorsen/kb`.

## Modes

- **Default mode**: Gather context, propose placement and body, present the proposal to the user, write only after confirmation.
- **Auto mode (`--auto`)**: Gather context, pick the best inference, write silently. The agent never asks clarifying questions in this mode.

`--auto` does two jobs. It tells you to skip the proposal step, and it is passed through to the helper, where it routes any domain the write declares to `provisional:` rather than `domains:` — an unconfirmed placement is by definition unreviewed, and the taxonomy should say so.

## Placement

The declared taxonomy is the primary placement signal; the folders the survey found on disk corroborate it. A folder holding notes that no domain declares is drift: surface it rather than quietly writing another note into it.

Treat the taxonomy as a strong prior, not a hard constraint. When a note's topic sits in the long tail, let the tags carry it and place the note in the nearest domain that genuinely fits — do not force it into an ill-fitting folder to avoid proposing a new one, and do not mint a domain per note.

A new domain is warranted by intent, not by note count: propose one when the user means to keep that shelf, however few notes will sit on it. In auto mode, do not mint a top-level domain — a new top-level shelf reshapes the base and deserves confirmation.

Folders serve human browsing and tags serve machine retrieval, so a folder name that restates a tag is expected rather than redundant. Do not contort either list to keep them orthogonal.

Where two declared domains both fit, prefer the reviewed one: a domain reported with `provisional: true` was declared but never reviewed, and adding to it deepens an unreviewed shelf.

## Process

### 1. Gather context

Read the note content from the conversation or, if the user pointed to one, from a file. Identify the topic, the intent (procedural vs explanatory vs reference-style), and any obvious entities (libraries, tools, concepts).

### 2. Survey the destination KB

Run the helper in survey mode, passing the same `--kb` the write will use:

```bash
node {harness_home_dir}/skills/kb-add/kb-add.mjs --survey [--kb <name>]
```

It reports:

- `kb` — the knowledge base the write will resolve to, by the same rules.
- `taxonomyPath` — the `.kb/taxonomy.yaml` the domains came from.
- `domains` — each declared domain with its `description`, its `provisional` flag, and the `noteCount` at or beneath it.
- `undeclaredFolders` — folders holding notes that no domain declares.

Then read a representative sample of notes from the folder most likely to fit the new note's topic. The survey reads no note bodies, so the sample is what reveals the title conventions and the live tag vocabulary already in use.

### 3. Cross-reference via kb-retrieve

Invoke the `{skill:kb-retrieve}` skill on the note's topic terms. Read the top-ranked candidates; they are the inputs for your cross-referencing decisions in step 5. This step is mandatory in both default and auto modes — the proposal should always either embed cross-references or explicitly note that none are warranted.

### 4. Classify

Pick the placement and metadata:

- **Folder**: A topic subpath under `content/assertions/`, chosen per [Placement](#placement) — a declared domain when one fits, a new one when the topic is genuinely new to the KB.
- **Diátaxis label**: The note's Diátaxis classification (the default vocabulary is `howto`, `concept`, `reference`, `tutorial`).
- **Title**: A concise, descriptive title. For `diataxis: howto`, propose imperative-led titles ("Configure pnpm workspaces") not interrogative ones ("How do I configure pnpm workspaces?"). The title is also the filename — keep it within a sane length and avoid filesystem-hostile characters.
- **Tags**: Topic and category tags drawn from existing tag vocabulary where possible. Known aliases will be canonicalized at write time by the helper.

### 5. Compose the body

Write the note body. Embed cross-references inline where the reference contributes at the point of mention; group tangential references under a `## See also` heading at the end. Prefer file-relative or KB-relative links.

### 6. Present the proposal (default mode)

In default mode, present the proposed KB, folder, Diátaxis label, title, tags, and body to the user. Name the domain the folder matched, that domain's description, and the taxonomy file they came from, so the user can see what the placement was measured against. When the folder is a new domain, name it as new and propose the description you will pass as `--domain-description`. When the survey reported an undeclared folder bearing on the choice, say so. Wait for confirmation or a redirect. In auto mode, skip this step.

<!-- include: ../_partials/action-items.md / -->

### 7. Invoke the helper

Pipe the composed body to the bundled helper. A heredoc keeps multi-line bodies legible without the quoting and escaping gymnastics that `echo "$BODY"` invites once the note contains backticks, blank lines, or shell metacharacters:

```bash
cat <<'EOF' | node "$(dirname "$SKILL_PATH")/kb-add.mjs" \
  --diataxis <label> --title "<title>" \
  [--kb <name>] [--folder <topic-subpath>] \
  [--tags <comma,separated>] [--domain-description "<description>"] [--auto]
<note body, may span multiple lines and contain any characters>
EOF
```

Or, when the skill directory is known:

```bash
cat <<'EOF' | node {harness_home_dir}/skills/kb-add/kb-add.mjs \
  --diataxis howto --title "Configure pnpm workspaces" \
  --folder engineering/tooling --tags "pnpm,workspaces"
Configure pnpm workspaces by adding a `pnpm-workspace.yaml` at the repo
root that lists each package directory under `packages:`.
EOF
```

The helper prints a JSON object to stdout:

- `ok: true` with `path`, `kb`, `record`, `originalTags`, `canonicalTags`, and `placement` on success.
- `ok: false` with `error`, `message`, and optional `details` on a recoverable failure.

### 8. Handle the result

On `ok: true`, report the written path and the canonicalization audit trail. When `canonicalTags` differs from `originalTags`, surface which tags were canonicalized so the user can confirm the change matches their intent.

Then report the placement:

- `placement.domain` names the domain the note sits in. A `null` value means the note landed at the assertions root, under no domain and outside anything the taxonomy rules can see — say so, and offer to move it under a domain.
- `placement.added` lists the domains this capture declared. Name them, and say which block they landed in: everything but a confirmed capture carrying `--domain-description` is provisional and awaits review.
- `placement.warning` means the note was written but its folder could not be declared. Surface the message; the folder will surface as `taxonomy.undeclared` on the next `kb check`.
- An absent `placement` means the store has no `.kb/taxonomy.yaml` and so has not adopted a taxonomy. Nothing was declared, and nothing is wrong.

In auto mode, the completion report is where an undeclared folder the survey found reaches the user; include it there.

On `ok: false`, route by the `error` code:

- `no-kb-resolvable` — the explicit `--kb <name>` matched no registered entry. Surface the message and propose a corrected name (or, in auto mode, fail visibly with the categorical reason).
- `missing-destination` — no `.kb/` was discovered and no `--kb` was given. Ask the user where the note should go, passing `--kb <name>` for a specific KB or `--kb @default` for the registry default (or, in auto mode, fail visibly with the categorical reason).
- `no-default` — `--kb @default` was given but no `default_kb` is configured. Surface the message; have the user name a KB explicitly or configure a default.
- `invalid-args` / `invalid-title` — Surface the helper's message and propose a corrected invocation.
- `invalid-config` — a survey hit a malformed `.kb/config.yaml` or `.kb/taxonomy.yaml`. The message names the file; surface it and have the user repair it before capturing.
- `collision` — A note already exists at the target path. Decide whether to re-title, append the new material to the existing note (read it first, then write a follow-up edit), or abort.

## Completion

A written note at the reported path, conforming to the assertion record contract, plus the canonicalization audit trail so the user can verify which alias tags were rewritten, and the domain the note was placed under along with any domain the capture declared.
