---
name: migrate-feedback-memories
description: Route this machine's per-project feedback memories to their proper home — capture the propagating ones as capture-feedback candidates, delete the redundant, retain the genuinely local — via a bundled enumerator with a confirm-by-default batch flow and an --auto escape hatch
user-invocable: true
---

# Migrate feedback memories

Route every `feedback`-type agent memory on this machine to its proper home. A bundled helper does the mechanical work — it enumerates feedback memories across every project store, and executes deletions with `MEMORY.md` reconciliation. You do the judgment work — classify each memory, dedup capture candidates against the knowledge base, and compose each capture.

The three destinations:

- **Capture** — a generalizable lesson that should propagate becomes a `capture-feedback`-style candidate event in the `codeassembly` KB; a later distillation pass codifies it into shared guidance.
- **Retain** — a genuinely local, non-propagating fact (a project-specific deadline or quirk) stays a memory, untouched.
- **Delete** — a memory already captured (including one migrated from another machine) or otherwise redundant is removed.

The split is deliberate: the helper is narrow and mechanical (it never classifies); the routing is wide and judgment-driven.

**Announce at start:** "Using migrate-feedback-memories to route this machine's feedback memories."

## Arguments

| Argument | Description                                                                            | Required |
| -------- | -------------------------------------------------------------------------------------- | -------- |
| `--auto` | Skip the batch-review confirmation and execute the inferred routing. Dedup still runs. | No       |

The `--auto` flag is consumed by you, not the helper; it controls whether you present the routing plan before executing.

## Runtime dependencies

- **`node` ≥ 24** — the bundled helper inherits the Node version floor of `@codeassembly/kb`.

## Modes

- **Default mode**: enumerate, classify, dedup, present the routing plan, and execute only after confirmation.
- **Auto mode (`--auto`)**: enumerate, classify, dedup, and execute silently, with no confirmation.

## Process

### 1. Enumerate

Run the helper's `enumerate` subcommand — it is read-only:

```bash
node {harness_home_dir}/skills/migrate-feedback-memories/migrate-feedback-memories.mjs enumerate
```

It prints `{ ok, machine, projectsRoot, memories, skipped }`. Each entry in `memories` carries `path`, `store`, `machine`, `slug`, `name`, `description`, `originSessionId`, `body`, and `memoryIndexPath`. `skipped` lists memory files that have a frontmatter fence but unparseable YAML — read and route each one by hand (they are usually feedback memories whose `name:` value needs quoting).

### 2. Classify

Decide one destination per memory:

- **Capture** when the lesson generalizes beyond its origin project — a behavior, correction, or convention that should propagate. This is the default for behavioral feedback.
- **Retain** when the fact is genuinely local and non-propagating (a project-specific deadline, a one-off quirk).
- **Delete** when the memory is redundant with shared guidance or a prior capture. The redirect memory `feedback-capture-feedback-in-kb-not-memory` is such a case — its guidance now lives in `shared/AGENTS.md`, so it is a delete like any other, with no carve-out.

### 3. Dedup capture candidates

For each capture candidate, invoke the {skill:kb-retrieve-events} skill on the memory's topic to check whether an equivalent event already exists in the `codeassembly` KB (captured on an earlier run or from another machine). When an equivalent exists, reclassify the memory to **delete** — do not re-capture. This is what makes a re-run, and a second machine's run, converge rather than duplicate.

### 4. Present the routing plan (default mode)

Show every memory with its destination, and for each capture the proposed `--tags`, `--skill`, and `--impact`. Present it as one batch for review — per-item confirmation is impractical at this scale. Wait for approval or adjustments. In auto mode, skip this step.

### 5. Execute

On approval, route each memory:

- **Capture** — compose the arguments and body per the {skill:capture-event} contract and pipe the body to its bundled helper directly (a batch this size cannot afford a per-item skill invocation):

  ```bash
  cat <<'EOF' | node {harness_home_dir}/skills/capture-event/capture-event.mjs \
    --summary "<one-line lesson>" \
    --store codeassembly \
    --harness {harness_id} \
    --tags feedback \
    [--skill <slug>] [--impact <level>]
  <the generalized lesson>

  Origin: project <store>, machine <machine>, session <originSessionId>.
  EOF
  ```

- **Delete** — collect every delete path and pipe them, newline-separated, to the helper's `delete` subcommand in a single call, so each store's `MEMORY.md` is reconciled once:

  ```bash
  printf '%s\n' "<path>" "<path>" … | node {harness_home_dir}/skills/migrate-feedback-memories/migrate-feedback-memories.mjs delete
  ```

  It removes each file and reconciles its `MEMORY.md`, printing a per-path outcome (`deleted`, `indexUpdated`, and a `note` for any already-absent file or unmatched index line).

- **Retain** — no action.

### Composing a capture

- `--store codeassembly` — the agent-guidance KB. Route to a different store only when a memory is specific to another registered project's KB.
- `--tags feedback` always; add `,mistake` (i.e. `--tags feedback,mistake`) when the memory recorded a _misapplied_ existing rule.
- `--skill <slug>` when the lesson targets a specific skill.
- `--impact <low|medium|high|critical>` — rate on the merits of the memory's content: how much acting on the lesson would improve future behavior. Omit only on a genuine toss-up.
- `--harness {harness_id}` — keep verbatim; the installer injects the value.
- **Provenance in the body** — `capture-event` auto-fills `cwd`, `repo`, and `session` from _this_ migration run, not the memory's origin, so record the origin project (`store`), machine, and `originSessionId` in the body.

### 6. Report

Summarize the counts — captured, deleted, retained, skipped — with the ids and paths of the captures, and call out any skipped memories that still need manual handling.

## Completion

Every feedback memory on the machine is captured, deleted, or retained; each affected `MEMORY.md` reflects its post-migration store; and every capture carries origin provenance in its body. After a full run, a store holds only retained-local memories, so a re-run is a no-op.
