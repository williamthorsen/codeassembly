---
name: capture-event
description: Capture an event into the shared knowledge substrate. Use when noticing something worth recording for later recall — an observation, a pattern, a refinement, a surprising API surface, a workaround, or a problem you hit and resolved. A fast pure append — no survey, recall, or dedup.
user-invocable: true
---

# Capture an event

Append an event record to the shared knowledge substrate, or amend an existing one that has not yet been pushed. A bundled helper does the mechanical work — it resolves the event store by name, auto-fills the record's context (a ULID `id`, the capture timestamp, the session, the working directory, and a best-effort `repo`), validates the event's required set against the store's schema, and writes the record atomically. You supply the `summary` and the event body.

This is a pure append. Unlike `kb-add`, it runs no survey, no `kb-retrieve` cross-referencing, and no dedup. The point is to capture the event cheaply and move on; recall and triage happen later via `kb-retrieve`.

**Announce at start:** "Using capture-event to record this event."

## When to capture

Capture anything worth recalling later: a behavior, a pattern, a refinement, a surprising API surface, a workaround. Problem→solution and pattern-plus-refinement are useful shapes, but an event may simply be an observation; do not force it into a template.

A **solved-problem episode** — a problem you hit and resolved — is worth tagging so you can recall past fixes as a group: capture it with `--tags fix` (plus any topical tags), putting the problem and its resolution in the body. The `fix` tag is what lets you recall past fixes together later.

A **skill-caused mistake** — an error a clearer skill definition would have prevented — is worth tagging the same way: capture it with `--tags mistake` and `--skill <skill-at-fault>`, putting what went wrong and what the skill should have said in the body. The `mistake` tag is what lets you recall skill mistakes as a group when deciding which skills to revise.

## Arguments

| Argument         | Description                                                                       | Required |
| ---------------- | --------------------------------------------------------------------------------- | -------- |
| `--summary`      | A human-readable one-line summary; becomes the record's label on recall.          | Yes      |
| `--store`        | Registry name of the event store, or `@default` for the `default_kb`.             | Yes      |
| `--skill`        | The skill the event relates to.                                                   | No       |
| `--model`        | The model identifier in play.                                                     | No       |
| `--harness`      | The agent platform (`claude`, `rovodev`); install-injected — keep as-is.          | Injected |
| `--tags`         | Comma-separated tag list.                                                         | No       |
| `--impact`       | Impact rating: one of `low`, `medium`, `high`, `critical`. Omit to leave unrated. | No       |
| `--amend`        | Id of an existing event to rewrite in place instead of capturing a new one.       | No       |
| `--allow-pushed` | With `--amend`, rewrite even an event already pushed to the remote.               | No       |

A value-bearing flag accepts both `--summary text` and `--summary=text`; `--allow-pushed` is a boolean flag. The event body is read from stdin to EOF; an empty body is allowed.

### Auto-filled vs agent-supplied

- **Auto-filled by the helper:** `recordType` (`event`), `id` (ULID), `captured-at`, `session` (`CLAUDE_CODE_SESSION_ID`), `cwd`, and `repo` (the `owner/name` git remote at `cwd`, best-effort — omitted silently when no remote resolves).
- **Template-injected:** `harness` — `codeassembly-agents` writes the agent platform (`claude` or `rovodev`) into the `--harness` flag when it installs this skill. Unlike `model`, which varies per session and is self-reported, the harness is fixed at install time; keep the injected `--harness` flag verbatim rather than filling in a value yourself.
- **Agent-supplied:** `summary`, the optional `skill`/`model`/`tags`/`impact`, and the body.

### Store selection

`--store` is required: Every capture names its destination. The helper resolves the store by registry name only. It never walks the working directory for a `.kb/` folder, so a capture lands in the named store and never in a project-local KB it happened to be invoked near. The store must be registered in `kb.yaml`. Omitting `--store` is refused with an error that lists the registered stores rather than defaulting silently.

Choose the destination deliberately. When the lesson is specific to a project, pass that project's KB with `--store <name>`. Only when the lesson is environment-level, meaning an observation or refinement that applies across every project in the current environment, route it to the registry's `default_kb` by passing `--store @default`. Reaching the default is an explicit act, not what happens when the flag is forgotten.

### Amending an event

An event is editable until it is pushed to the store's remote and immutable after, so `--amend <id>` is how you correct a capture that is still local — for example, an event a `capture-feedback` pass got wrong. Prefer amending over capturing a near-duplicate. Amend always rewrites `summary` and the body from the invocation. It overwrites `--skill`, `--model`, `--tags`, or `--impact` only when you pass that flag; any you omit keep their existing value, as do the provenance fields (`id`, `captured-at`, `session`, `cwd`, `repo`, `harness`) and any `addressed-by` marks. To clear a curatorial field rather than edit content, use its `kb-update-events` mutator.

When the event has already been pushed, the amend is refused. Re-run with `--allow-pushed` to rewrite it deliberately (this rewrites pushed history), or capture a new event instead.

## Runtime dependencies

- **`node` ≥ 24** — the bundled helper inherits the Node version floor of `@codeassembly/kb`.

## Process

### 1. Compose the summary and body

Write a one-line `--summary` that reads well on its own (it is the record's recall label). Put the detail — context, the problem and its resolution, the pattern and its refinement — in the body on stdin. Capture enough context that the event is intelligible months later without the surrounding conversation.

Optionally rate `--impact` (`low`, `medium`, `high`, or `critical`): your subjective read of how much addressing the event matters, which applies equally to a bug and to a beneficial change. Omit it when you have no clear read — an unrated event is left for a later triage pass. The rating is revisable later with `kb-update-events`.

### 2. Invoke the helper

Pipe the body to the bundled helper. A heredoc keeps multi-line bodies legible:

```bash
cat <<'EOF' | node {harness_home_dir}/skills/capture-event/capture-event.mjs \
  --summary "<one-line summary>" \
  --store <name|@default> \
  --harness {harness_id} \
  [--skill <skill>] [--model <model>] [--tags <comma,separated>] [--impact <level>]
<event body, may span multiple lines and contain any characters>
EOF
```

The helper prints a JSON object to stdout:

- `ok: true` with `id`, `capturedAt`, `path`, `store` on success.
- `ok: false` with `error`, `message`, and optional `findings` on a recoverable failure.

### 3. Handle the result

On `ok: true`, report the captured `id` and `path`.

On `ok: false`, route by the `error` code:

- `invalid-args` — surface the helper's message and propose a corrected invocation.
- `missing-store` — `--store` was omitted. Re-run with `--store <name>` for the KB the user named, or `--store @default` for an environment-level lesson; the message lists the registered stores.
- `store-not-registered` — the named store is not in `kb.yaml`. Confirm the store name or register it.
- `readonly-store` — the store is marked readonly; captures are refused.
- `no-default-store` — `--store @default` was given but no `default_kb` is configured. Name a store explicitly or configure a default with `kb set-default`.
- `schema-validation` — surface the `findings`, then supply the missing field and retry.
- `amend-not-found` — `--amend` named an id with no event at it. Confirm the id and store.
- `amend-parse` — the event to amend is not a valid event record. Inspect the file.
- `event-pushed` — the event is already pushed. Re-run with `--allow-pushed` to amend it anyway, or capture a new event instead.

## Completion

A written record at the reported path, validated against the store's schema. A fresh capture never overwrites an existing event; an event stays editable via `--amend` until it is pushed to the remote, and is immutable after.
