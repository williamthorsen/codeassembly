---
name: capture-event
description: Capture an event into the shared knowledge substrate. Use when noticing something worth recording for later recall (an observation, a pattern, a refinement) or when the user corrects a mistake that a clearer skill or note would have prevented. A fast pure append — no survey, recall, or dedup.
user-invocable: true
---

# Capture an event

Append an immutable event record to the shared knowledge substrate. A bundled helper does the mechanical work — it resolves the event store by name, auto-fills the record's context (a ULID `id`, the capture timestamp, the session, the working directory, and a best-effort `repo`), validates the per-type required set against the store's schema, and writes the record atomically and immutably. You supply the `type`, the `summary`, and — for a mistake — the `correction`.

This is a pure append. Unlike `kb-add`, it runs no survey, no `kb-retrieve` cross-referencing, and no dedup. The point is to capture the event cheaply and move on; recall and triage happen later via `kb-retrieve`.

**Announce at start:** "Using capture-event to record this {observation|mistake}."

## When to capture

- **Observation** — you noticed something worth recalling later: a behavior, a pattern, a refinement, a surprising API surface, a workaround. Problem→solution and pattern-plus-refinement are useful shapes, but an observation may simply be an observation; do not force it into a template.
- **Mistake** — the user corrected something a clearer skill definition or note would have prevented. Quote the correction verbatim and name the artifact in play (the skill, file, or convention that should have been clearer).

## Arguments

| Argument       | Description                                                              | Required             |
| -------------- | ------------------------------------------------------------------------ | -------------------- |
| `--type`       | The event type: `observation` or `mistake`.                              | Yes                  |
| `--summary`    | A human-readable one-line summary; becomes the record's label on recall. | Yes                  |
| `--correction` | The verbatim correction text.                                            | For `--type mistake` |
| `--store`      | Registry name of the event store. Defaults to `codeassembly`.            | No                   |
| `--skill`      | The skill the event relates to.                                          | No                   |
| `--model`      | The model identifier in play.                                            | No                   |
| `--tags`       | Comma-separated tag list.                                                | No                   |

A value-bearing flag accepts both `--type observation` and `--type=observation`. The event body is read from stdin to EOF; an empty body is allowed.

### Auto-filled vs agent-supplied

- **Auto-filled by the helper:** `id` (ULID), `captured-at`, `session` (`CLAUDE_CODE_SESSION_ID`), `cwd`, and `repo` (the `owner/name` git remote at `cwd`, best-effort — omitted silently when no remote resolves).
- **Agent-supplied:** `type`, `summary`, the optional `skill`/`model`/`tags`, the `correction` (for a mistake), and the body.

### Store selection

The helper resolves the store by registry name only — it never walks the working directory for a `.kb/` folder. A capture always lands in the named store (default `codeassembly`), never in a project-local KB it happened to be invoked near. The store must be registered in `kb.yaml`.

## Runtime dependencies

- **`node` ≥ 24** — the bundled helper inherits the Node version floor of `@codeassembly/kb-core`.

## Process

### 1. Decide the type

`observation` or `mistake`. For a mistake, capture the correction verbatim and identify the artifact that should have been clearer.

### 2. Compose the summary and body

Write a one-line `--summary` that reads well on its own (it is the record's recall label). Put the detail — context, the problem and its resolution, the pattern and its refinement — in the body on stdin. Capture enough context that the event is intelligible months later without the surrounding conversation.

### 3. Invoke the helper

Pipe the body to the bundled helper. A heredoc keeps multi-line bodies legible:

```bash
cat <<'EOF' | node {platform_home_dir}/skills/capture-event/capture-event.mjs \
  --type observation --summary "<one-line summary>" \
  [--store <name>] [--skill <skill>] [--model <model>] [--tags <comma,separated>]
<event body, may span multiple lines and contain any characters>
EOF
```

For a mistake, pass `--correction`:

```bash
cat <<'EOF' | node {platform_home_dir}/skills/capture-event/capture-event.mjs \
  --type mistake --summary "<one-line summary>" --correction "<verbatim correction>" \
  [--skill <skill>]
<event body naming the artifact that should have been clearer>
EOF
```

The helper prints a JSON object to stdout:

- `ok: true` with `id`, `capturedAt`, `path`, `store` on success.
- `ok: false` with `error`, `message`, and optional `findings` on a recoverable failure.

### 4. Handle the result

On `ok: true`, report the captured `id` and `path`.

On `ok: false`, route by the `error` code:

- `invalid-args` — surface the helper's message and propose a corrected invocation.
- `store-not-registered` — the named store is not in `kb.yaml`. Confirm the store name or register it.
- `readonly-store` — the store is marked readonly; captures are refused.
- `schema-validation` — surface the `findings`. A `mistake` without `--correction` fails here; supply the correction and retry.

## Completion

A written immutable record at the reported path, validated against the store's schema. Captures are write-once: there is no edit or re-capture step.
