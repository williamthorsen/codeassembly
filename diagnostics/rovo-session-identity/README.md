# Rovo session-identity diagnostic

Empirically establishes whether Rovo's `get_session_metadata` built-in supports the fetch-once-reuse relay that fleet-view session attribution depends on: A skill fetches the session ID once, then the agent restates it verbatim in later shell commands. The appended log is the evidence — no characterization of Rovo is required or trusted, so the diagnostic stays valid across Rovo versions and can be re-run whenever behavior may have changed.

## The kit

- `rovo-diagnostic-instructions.md`: Agent-facing instructions Rovo reads and follows. Self-contained: The agent mints its own run label, and interactive-only steps are marked so the same file serves interactive and non-interactive sessions.
- `run-rovo-session-identity-diagnostic.sh`: Launches headless runs (via the `ROVO_COMMAND` constant, default `rovo.sh run --yolo`), one per directory argument, concurrently.
- `check-rovo-session-identity-log.sh`: Grades the diagnostic log into per-run verdicts.

Both scripts default their output to `~/.codeassembly/diagnostics/` (the log plus per-run output captures under `runs/`); override with `--output-dir` on each. The three files must stay siblings: The launcher resolves the instructions file relative to itself, so copying the directory to another machine keeps everything working.

## How to run

- **Non-interactive batch** (shape, stability, recall, re-fetch, concurrent distinctness): `./run-rovo-session-identity-diagnostic.sh [dir ...]` — one headless run per real-repository path; repeat a directory for same-workspace concurrency. No other input needed.
- **Interactive session** (adds the end-of-turn discipline test): In a fresh Rovo session, say `Read <path>/rovo-diagnostic-instructions.md and follow it.` Reply "ok" twice when asked.
- **Embedded in real work** (compaction and long-session recall): Start a real session with `Read <path>/rovo-diagnostic-instructions.md and do the diagnostic start block.` Later, at any moment — especially hours in or after suspected context summarization — say `Checkpoint probe.`
- **Fork variant**: Start embedded mode, fork the session, then request a checkpoint probe in both branches.
- **Grade**: `./check-rovo-session-identity-log.sh`

Do not run these diagnostics in shadow mode: shadow mode executes shell commands in a temporary environment, so the log appends would not land in the real log. Note that `get_session_metadata` is permission-gated; a headless run without the tool allowed (or a `--yolo`-style flag) hard-fails rather than degrading.

## What the log demonstrates

| Question                                 | Evidence in the log                                                                                                     |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Response shape (field names, id format)  | `kind=raw` lines with the verbatim JSON, captured every run, so shape drift across Rovo versions surfaces automatically |
| Id stable for the session's lifetime     | `kind=fetched` at start equals `kind=fetched` at end                                                                    |
| Agent can recall the id across real work | `kind=recalled` checkpoints match the initial fetch                                                                     |
| Re-fetch is a safe repair strategy       | Late fetches return the initial id                                                                                      |
| Ids distinct across concurrent sessions  | Concurrent runs interleave in the shared log with different ids                                                         |
| End-of-turn emission discipline          | `cp=askN` line present and timestamped before the user's reply (`cp=ansN`)                                              |
| Fork semantics                           | `fork` field in raw lines; forked branch's id matches or differs from parent                                            |

## Log format

One line per entry:

```text
{utc-ts} run={label} cp={checkpoint} kind={fetched|recalled} id={session_id}
{utc-ts} run={label} cp={checkpoint} kind=raw json={full response, single line}
```

`kind=fetched`: ID copied from a `get_session_metadata` call made at that moment. `kind=recalled`: ID written from the agent's memory, with tool calls and log reading forbidden. The recalled/fetched distinction is the heart of the diagnostic; a wrong id logged honestly is a valid result. The run label doubles as a second recall probe: It is minted once at start and carried in-context alongside the id, so label drift is itself memory-failure evidence.

## Interpretation

The grader prints one verdict per run; this table maps verdicts to design consequences for the skill instrumentation that relies on the relay.

| Verdict                                   | Conclusion                                              | Design consequence                                                                                                |
| ----------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| PASS (all runs, distinct ids across runs) | Relay holds as designed                                 | Instrumented skills fetch once at skill start, recall per emission                                                |
| RECALL DRIFT                              | Platform fine, agent memory unreliable                  | Soften the contract to fetch-once, re-fetch when uncertain (or per emission); safe because re-fetch is idempotent |
| PLATFORM UNSTABLE                         | Id not session-stable                                   | Fall back to a helper-generated per-run id; revises the session-identity model                                    |
| DISCIPLINE                                | End-of-turn emission unreliable                         | Order emits before presenting prompts; watch skill-completion emits for the same exposure                         |
| COLLISION                                 | Sessions share an id (or a fork inherited its parent's) | Decide whether fork lineage needs its own envelope treatment before the production schema                         |
| Raw JSON keys change between runs         | Shape drift across Rovo versions                        | Re-anchor the instrumentation's field reference; the raw lines date the change                                    |
