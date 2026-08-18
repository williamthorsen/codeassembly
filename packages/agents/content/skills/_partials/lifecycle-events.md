## Lifecycle events

The steps above contain lifecycle-event cues. Each names an event `type` and a payload to emit at that point, so a watching surface can render what this session is doing while it runs. At each cue, run the helper below, then move on. This is best-effort telemetry: It must never block or change the work it observes.

Run via Bash:

```bash
node {harness_home_dir}/skills/emit-event/emit-event.mjs \
  --type <type> \
  --harness {harness_id} \
  --payload '<json>'
```

**Payload.** Single-quote it so its double quotes survive the shell. A payload is a small JSON object, a status line rather than a report: Include only what a watcher would show (a step label, a count, an outcome, a path), never the artifact itself.

**Fire and forget.** The helper always exits 0 and prints a JSON result. Ignore it: Never read the result, never retry, never report a failed emission to the user, and never let it change what this skill does next. A dropped event costs one log line, not correctness.

**Session id.** On Claude, do nothing; the helper reads the session from the environment. On Rovo Dev, the environment has no session id, so supply it: On the run's first emission, call the `get_session_metadata` built-in once, read the session id, then pass `--session <id>` on that emission and every later emission this run.
