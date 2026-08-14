---
name: emit-event
description: Append a session-lifecycle event to the live event log. Invoked by instrumented skills at their lifecycle boundaries — never directly by a user.
user-invocable: false
---

# Emit a lifecycle event

Append one lifecycle event to the live event log, so a watching surface can render what a session is doing while it is doing it. A bundled helper does the mechanical work: It fills in the repo, branch, session, and working directory, stamps the event with a ULID and a timestamp, and appends a single line to the session's log. You supply the `--type` and, when the type carries detail, a `--payload`.

This is a fire-and-forget append. It emits no artifact, prompts for nothing, and — by contract — cannot fail in a way that stops the skill it observes.

## The never-block contract

Telemetry must never break the work it watches. The helper therefore **always exits 0** and always prints a JSON result to stdout:

- `{"ok": true, "id": "...", "path": "..."}` — the event was appended.
- `{"ok": false, "error": "...", "message": "..."}` — it was not, and the reason is on stderr.

**Never branch on the result.** Do not retry, do not report the failure to the user, and do not let it change what the skill does next. A failed emission means one line is missing from a telemetry log; it is not a problem the user asked you to solve. Read the result only if you are debugging the emitter itself.

## Arguments

| Argument    | Description                                                                           | Required |
| ----------- | ------------------------------------------------------------------------------------- | -------- |
| `--type`    | The event type. See the vocabulary below.                                             | Yes      |
| `--payload` | A JSON **object** carrying the event's detail. Defaults to `{}`.                      | No       |
| `--session` | Session id, overriding the environment-derived one. Only a relaying harness needs it. | No       |
| `--harness` | The agent platform (`claude`, `rovo`); install-injected — keep as-is.                 | Injected |

A value-bearing flag accepts both `--type value` and `--type=value`.

## Event vocabulary (v0)

| Type               | Emit when                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `session.started`  | **Relayed, not yours.** A session opened. Payload: the harness's start reason.                                           |
| `turn.started`     | **Relayed, not yours.** The user submitted a prompt.                                                                     |
| `skill.started`    | A skill begins. Payload: the skill name, and any argument that framed the run.                                           |
| `skill.progress`   | _(Optional.)_ A milestone worth showing mid-run; not part of the standard instrumented set. Payload: what just finished. |
| `skill.completed`  | A skill finishes. Payload: the outcome.                                                                                  |
| `artifact.written` | A file the user will want to open has been written. Payload: its path and kind.                                          |
| `input.requested`  | The skill has asked the user something and is waiting.                                                                   |
| `pr.created`       | A pull request has been opened. Payload: its number and URL.                                                             |
| `turn.completed`   | **Relayed, not yours.** The agent finished responding.                                                                   |
| `session.ended`    | **Relayed, not yours.** A session exited, switched, or forked.                                                           |

The four relayed types are emitted by the hook relay the CLI installs into the harness, which fires at boundaries no skill is running to observe. **Never emit one from a skill**: You would double-count a boundary the harness already reports. They are listed here so you recognize them when reading a log, not so you can produce them.

A skill emits `input.requested` when it asks and waits, but no matching `input.received`: The relayed `turn.started` marks the resume, so the skill has nothing to add.

The vocabulary is convention, not a gate: An undeclared type warns on stderr and is appended anyway. Prefer a declared type — a watching surface only renders what it recognizes — but emit a new one rather than dropping an event that has no home yet.

## The envelope

Each event is one JSON line:

```json
{
  "id": "01K0...",
  "ts": "2026-07-14T14:10:46.123Z",
  "type": "skill.started",
  "repo": "owner/name",
  "branch": "986",
  "session": "b3f1...",
  "cwd": "/repos/project",
  "harness": "claude",
  "payload": { "skill": "plan" }
}
```

`id`, `ts`, `cwd`, and `payload` are always present. `repo`, `branch`, `session`, and `harness` are **omitted when unresolvable** — outside a git repository, on a detached HEAD, or on a harness that exposes no session id. The event is still appended in that case, under a placeholder path segment, so a session running outside a repo is observable rather than invisible.

## Runtime dependencies

- **`node` ≥ 24** — the bundled helper inherits the package's Node version floor.

## Process

### 1. Choose the type and compose the payload

Pick the type from the vocabulary above. Put the detail a watcher would want in `--payload` as a JSON object — a bare array or scalar is refused, because the payload's shape is the contract a consumer reads. Keep it small: The payload is a status line, not a report.

### 2. Invoke the helper

```bash
node {harness_home_dir}/skills/emit-event/emit-event.mjs \
  --type <event-type> \
  --harness {harness_id} \
  --payload '{"skill":"<name>"}'
```

Quote the payload in single quotes so its double quotes survive the shell.

### 3. Carry on

Ignore the result and continue the skill. See [the never-block contract](#the-never-block-contract).

## Completion

One line appended to the session's event log. Nothing else changes, and nothing downstream waits on it.
