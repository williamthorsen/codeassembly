---
name: kb-update-events
description: Edit existing events in the knowledge store (mark one or more events addressed-by a reference, retag them, or set their impact) in a single batch invocation. The curatorial mutable set only; substantive content is edited via `capture-event --amend`.
user-invocable: true
---

# Update existing events

Apply one mutation to one or more existing event records in a single invocation. A bundled helper does the mechanical work: It resolves the event store by name, resolves each id to its record, reads it through the type-blind note I/O layer, parses it to a typed `KbEvent`, applies the operation, and writes it back atomically. You supply the store, the operation, and the event ids.

The operation surface is the **curatorial mutable set** only: `addressed-by` (mark an event as addressed by a reference), `tags` (retag), and `impact` (set the impact rating). These are curatorial annotations; none of them writes a timestamp. Impact is a subjective assessment that may legitimately change, which is why it belongs to the mutable set rather than to the substantive fields. They are not substantive edits: To change an event's summary or body, use `capture-event --amend`. For new events, use `capture-event`. For editing assertions, use `kb-edit`.

**Announce at start:** "Using kb-update-events to {mark|retag|rate} {N} event(s)."

## Arguments

| Argument                    | Description                                                                                        | Required |
| --------------------------- | -------------------------------------------------------------------------------------------------- | -------- |
| `--store`                   | Registry name of the event store, or `@default` for the `default_kb`.                              | Yes      |
| `--add-addressed-by <refs>` | Append comma-separated reference(s) to each event's `addressed-by` list.                           | One op   |
| `--retag <list>`            | Replace each event's `tags` with the comma-separated list. Canonicalizes.                          | One op   |
| `--set-impact <level>`      | Set each event's `impact` to one of `low`, `medium`, `high`, `critical`. Replaces any prior value. | One op   |
| `<event-id>`                | One or more event ids; each resolves to `{store}/content/events/{id}.md`.                          | Yes      |

A value-bearing flag accepts both `--retag fix,observation` and `--retag=fix,observation`. Exactly one operation flag is required per invocation; combining more than one is rejected with `invalid-args`. References are free-form (a KB wikilink or relative path, a commit SHA, a PR/issue ref, or a URL); they are stored verbatim and de-duplicated after any existing entries. A reference that begins with `--` is otherwise read as the next flag, so pass it with the inline `--add-addressed-by=<ref>` form.

### Store selection

`--store` is required: Every edit names its store. The helper resolves the store by registry name only and never walks the working directory for a `.kb/` folder. The store must be registered in `kb.yaml`. Pass `--store <name>` for a named store, or `--store @default` for the registry's `default_kb`. Omitting `--store` is refused with an error that lists the registered stores.

## Runtime dependencies

- **`node` ≥ 24**: The bundled helper inherits the Node version floor of `@williamthorsen/kb`.

## Process

### 1. Gather the event ids

Collect the ids of the events to edit (typically from a prior recall). Each id is the event's ULID, the filename stem under `content/events/`.

### 2. Invoke the helper

```bash
node {harness_home_dir}/skills/kb-update-events/kb-update-events.mjs \
  --store <name|@default> \
  --add-addressed-by <ref[,ref...]> \
  <event-id> [<event-id> ...]
```

Use `--retag <tag[,tag...]>` or `--set-impact <level>` in place of `--add-addressed-by` for those operations.

The helper prints a JSON object to stdout:

- `ok: true` with `operation`, `store`, and a `results` array (one entry per id, in order). Each entry is either `{ ok: true, id, path }` or `{ ok: false, id, error, message }`.
- `ok: false` with `error` and `message` on an invocation-level failure (nothing was written).

### 3. Handle the result

On `ok: true`, report the per-event outcomes. A per-event `error` is one of:

- `invalid-id`: The id is not a bare filename stem (contains a path separator). Correct the id.
- `not-found`: No event at the resolved path. Confirm the id and store.
- `parse`: The file is not a valid event record. Inspect it.
- `validation`: The rendered record failed re-validation (unexpected); surface the message.

On `ok: false`, route by the `error` code:

- `invalid-args`: Surface the message and propose a corrected invocation.
- `missing-store`: `--store` was omitted; the message lists the registered stores.
- `store-not-registered`: The named store is not in `kb.yaml`.
- `readonly-store`: The store is marked readonly; edits are refused.
- `no-default-store`: `--store @default` was given but no `default_kb` is configured.

## Completion

Each named event updated in place and re-validated, written atomically. A mixed batch is partial by design: The helper writes the events that succeed and reports the ids that fail, leaving those untouched. These `addressed-by`/`tags`/`impact` annotations are curatorial; substantive content edits go through `capture-event --amend`.
