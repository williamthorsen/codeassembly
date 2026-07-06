---
name: migrate-feedback-memories
description: Route this machine's per-project feedback memories to their proper home — capture the propagating ones as capture-feedback candidates, delete the redundant, retain the genuinely local — via a bundled enumerator with a confirm-by-default batch flow and an --auto escape hatch
user-invocable: true
---

# Migrate feedback memories

Route every `feedback`-type agent memory on this machine to its proper home. A bundled helper does the mechanical work — it enumerates feedback memories across every project store, and executes deletions with `MEMORY.md` reconciliation. You do the judgment work — classify each memory, dedup capture candidates against the knowledge base, and compose each capture.

The three destinations:

- **Capture** — a generalizable lesson that should propagate is recorded as a `capture-feedback`-style candidate event in the `codeassembly` KB, and the source memory is then removed from its store; a capture migrates the memory out, it does not copy it. A later distillation pass codifies the event into shared guidance.
- **Retain** — a genuinely local, non-propagating fact (a project-specific deadline or quirk) stays a memory, untouched.
- **Delete** — a memory already captured (including one migrated from another machine) or otherwise redundant is removed.

The split is deliberate: the helper is narrow and mechanical (it never classifies); the routing is wide and judgment-driven.

**Announce at start:** "Using migrate-feedback-memories to route this machine's feedback memories."

## Arguments

| Argument         | Description                                                                                            | Required |
| ---------------- | ------------------------------------------------------------------------------------------------------ | -------- |
| `--auto`         | Skip the batch-review confirmation and execute the inferred routing. Dedup still runs.                 | No       |
| `--store <slug>` | Scope the run to a single project store (the `<project>` directory name). Omit to process every store. | No       |

The `--auto` flag is consumed by you, not the helper; it controls whether you present the routing plan before executing. `--store <slug>` passes through to the enumerator (both `--store x` and `--store=x` are accepted); reach for it to work one store per invocation on a machine with many memories, where a fresh, single-project context classifies more accurately than one run holding every store.

## Runtime dependencies

- **`node` ≥ 24** — the bundled helper inherits the Node version floor of `@codeassembly/kb`.

## Modes

- **Default mode**: enumerate, classify, dedup, present the routing plan, and execute only after confirmation.
- **Auto mode (`--auto`)**: enumerate, classify, dedup, and execute silently, with no confirmation.

## Process

### 1. Enumerate

Run the helper's `enumerate` subcommand — it is read-only:

```bash
node {harness_home_dir}/skills/migrate-feedback-memories/feedback-memories.mjs enumerate [--store <slug>]
```

Omit `--store` to enumerate every store on the machine; pass `--store <slug>` — the `<project>` directory name reported in each memory's `store` field — to scope the run to one store. A `--store` value that names no store on the machine returns `{ ok: false, error: 'no-such-store' }`, so a mistyped slug fails loudly rather than looking like an already-clean store.

It prints `{ ok, machine, projectsRoot, memories, skipped }`. Each entry in `memories` carries `path`, `store`, `machine`, `slug`, `name`, `description`, `originSessionId`, `body`, `memoryIndexPath`, and `repoPath` — the origin project's working directory when the store slug resolves to a live repo on this machine, else null. `skipped` lists memory files that have a frontmatter fence but unparseable YAML — read and route each one by hand (they are usually feedback memories whose `name:` value needs quoting).

### 2. Classify

Work through the memories **one store at a time**, not as a single undifferentiated batch. The `memories` array is already ordered by store, so group it by the `store` field and process each group in turn. On a machine with many memories, prefer scoping each run to one store with `--store <slug>`: a fresh invocation per store keeps the context lean and grounded in a single project. Processing all stores in one run stays the default, and is fine when the machine holds few.

Before classifying a store's memories, ground yourself in that project: when `repoPath` is set, read that repo's `.agents/PROJECT.md` and any project guidance it points to, so the routing calls reflect what the project already codifies. When `repoPath` is null — the store's slug does not resolve to a working repo on this machine — classify that store's memories ungrounded. Grounding is best-effort, never a blocker.

Then decide one destination per memory:

- **Capture** when the lesson generalizes beyond its origin project — a behavior, correction, or convention that should propagate. This is the default for behavioral feedback.
- **Retain** when the fact is genuinely local and non-propagating (a project-specific deadline, a one-off quirk).
- **Delete** only when the memory _restates_ a rule that shared guidance, a prior capture, or the origin project's own guidance already codifies, adding no signal the guidance does not already carry. Redundancy here is of signal, not topic. A memory that **narrates a violation** of already-existing guidance is not redundant: an agent breaking a codified rule is fresh evidence the guidance is not landing, so route it to **Capture** with `,mistake`, never Delete. When a body is ambiguous between restatement and violation, prefer Capture; a needless capture dedups away on the next run, but a deleted violation is gone for good. The redirect memory `feedback-capture-feedback-in-kb-not-memory` is a pure restatement (its rule now lives in `shared/AGENTS.md`), so it is a delete like any other.

### 3. Dedup capture candidates by origin

For each capture candidate, invoke the {skill:kb-retrieve-events} skill on the memory's topic. That skill surfaces candidates by term and tag overlap, so a hit may share only a tag (e.g. `feedback`) with the memory rather than its actual lesson — treat every hit as a _candidate_ duplicate, not a confirmed one. For each surfaced event, read the `Origin: project …, machine …, session …` line each migration writes into an event body (step 5), when present.

An event is this memory — already captured — only when **both** conditions hold: its topic records the memory's lesson **and** its origin matches. A session id does not uniquely identify a source memory: one working session routinely emits several feedback memories and/or captured events, each on a different topic, so a shared `originSessionId` (or `store`) establishes common origin, not common lesson.

- **Delete** the candidate only when a surfaced event both records the memory's lesson and shares its origin — origin matched on the `originSessionId` when the memory has one, else on the origin `store` by judgment. Such an event _is_ this memory, already captured on an earlier run or migrated from another machine, so re-capturing would double-count. This is what makes a re-run, and a second machine's run, converge.
- **Keep the capture** when a surfaced event's topic _diverges_ from the memory's, even if the origins match. Deleting on the origin match alone would remove the memory without ever capturing its lesson — an unrecoverable loss.
- **Keep the capture** when an equivalent event carries a _different_ origin. A lesson that recurred in separate projects is genuine recurrence, and the KB counts and ranks events by it (see {skill:kb-retrieve-events}), so each occurrence is captured as its own event; do not collapse distinct origins into one.

The lone exception is a memory _deliberately replicated_ as scaffolding — one rule copied verbatim into many stores rather than arising independently in each — which is one rule in many copies, not many occurrences. Collapse those to a single capture by judgment.

> **Worked example.** During the node-monorepo-tools migration, memory `merge-title-multiscope-bare-type` (origin session `187b2cdd`) surfaced a same-session event about an unrelated gradient-marker mistake. The session ids matched; the topics did not. Deleting on the session-id match would have removed the memory without capturing its merge-title lesson — the collision surfaced only by reading the matched event's topic.

### 4. Present the routing plan (default mode)

Show every memory with its destination, and for each capture the proposed `--tags`, `--skill`, and `--impact`. Present it as one batch for review — per-item confirmation is impractical at this scale. Wait for approval or adjustments. In auto mode, skip this step.

### 5. Execute

On approval, run all captures first, then a single deletion pass:

1. **Capture** — for each memory routed to capture, compose the arguments and body per the {skill:capture-event} contract and pipe the body to its bundled helper directly (a batch this size cannot afford a per-item skill invocation). Run the capture from the memory's origin repo, so `capture-event`'s auto-filled `cwd` and `repo` resolve to the origin rather than this migration run: wrap the invocation in a subshell that changes to the memory's `repoPath` first. The subshell contains the `cd`, keeping the origin directory out of the deletion pass and the next capture.

   ```bash
   (cd "<repoPath>" && cat <<'EOF' | node {harness_home_dir}/skills/capture-event/capture-event.mjs \
     --summary "<one-line lesson>" \
     --store codeassembly \
     --harness {harness_id} \
     --tags feedback \
     [--skill <slug>] [--impact <level>]
   <the generalized lesson>

   Origin: project <store>, machine <machine>, session <originSessionId>.
   EOF
   )
   ```

   `--store codeassembly` resolves from `~/.agents/kb.yaml` independently of the working directory, so the event lands in the same store wherever the capture runs. When the memory's `repoPath` is null — the store slug resolves to no live repo on this machine — omit the `(cd "<repoPath>" && … )` wrapper and run the capture from the current directory as today; `capture-event` then stamps this run's `cwd`/`repo`, and the origin survives in the body's `Origin:` line.

   Only when `capture-event` returns `ok: true`, add that memory's source `path` to the deletion batch — a capture migrates the memory out of its store, so its source is removed once the event has landed. When a capture fails, leave the source in place and surface the failure; never delete a memory whose capture did not land.

2. **Delete** — pipe every deletion path, newline-separated, to the helper's `delete` subcommand in a single call. The batch is the union of the memories routed to delete-as-redundant and the sources of successful captures, so each store's `MEMORY.md` is reconciled once:

   ```bash
   printf '%s\n' "<path>" "<path>" … | node {harness_home_dir}/skills/migrate-feedback-memories/feedback-memories.mjs delete
   ```

   It removes each file and reconciles its `MEMORY.md`, printing a per-path outcome (`deleted`, `indexUpdated`, and a `note` for any already-absent file or unmatched index line).

3. **Retain** — no action.

### Composing a capture

- `--store codeassembly` — the agent-guidance KB. Route to a different store only when a memory is specific to another registered project's KB.
- `--tags feedback` always; add `,mistake` (i.e. `--tags feedback,mistake`) when the memory recorded a _misapplied_ existing rule — including the violation-of-existing-guidance memory the Delete rule routes to Capture instead of deleting.
- `--skill <slug>` when the lesson targets a specific skill.
- `--impact <low|medium|high|critical>` — rate on the merits of the memory's content: how much acting on the lesson would improve future behavior. Omit only on a genuine toss-up.
- `--harness {harness_id}` — keep verbatim; the installer injects the value.
- **Provenance** — running the capture from the origin `repoPath` (step 5) lands the origin's `cwd` and `repo` in the event's structured fields. `session` is still this migration run's, and the origin machine and `store` have no structured field, so record the origin project (`store`), machine, and `originSessionId` in the body's `Origin:` line.

### 6. Report

Summarize the counts — captured, deleted, retained, skipped — with the ids and paths of the captures, and call out any skipped memories that still need manual handling.

## Completion

Every feedback memory in the run's scope — the whole machine, or the single store named by `--store` — is routed: captured then removed, deleted as redundant, or retained locally. Each affected `MEMORY.md` reflects its post-migration store; every capture carries the origin's `cwd`/`repo` in its structured fields, with the origin project, machine, and session in its body; and a lesson that recurred across separate stores is preserved as one event per origin, not collapsed. Because captured and deleted memories leave their store, a processed store holds only retained-local memories, so a re-run is a no-op and a second machine's run converges rather than duplicating.
