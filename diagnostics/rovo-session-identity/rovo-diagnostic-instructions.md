# Rovo session-identity diagnostic — agent instructions

You are running a diagnostic of your session-metadata handling. Follow these instructions exactly; the appended log lines are the entire deliverable.

## Modes

- **Full diagnostic** (default): run the whole sequence below.
- **Embedded mode**: only if the user told you to "do the diagnostic start block" — run Setup plus step 1 of the sequence, then proceed with the user's normal work. Whenever the user later asks for a "checkpoint probe", do the probe in the last section. In embedded mode the twice-only rule does not apply; each probe includes a fetch.

## Setup

1. Mint your run label: run this once and use its output as LABEL for the whole session. Remember it the same way you remember the session id; never re-mint it.

   ```bash
   echo "diag-$(date -u +%Y%m%d-%H%M%S)-$RANDOM"
   ```

2. The log file is `~/.codeassembly/diagnostics/rovo-session-diagnostic.log`, unless the prompt that invoked you named a different path ("Log to ...") — then use that one for every entry. Create its directory once: `mkdir -p <log file's directory>`.

3. To log, append exactly one line to the log file per instruction, of this form (fill in LABEL, CHECKPOINT, KIND, ID):

   ```bash
   echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) run=LABEL cp=CHECKPOINT kind=KIND id=ID" >> <log file>
   ```

## Rules — these override convenience

- Call `get_session_metadata` exactly twice in the full diagnostic: at cp=start and at cp=end. Never in between.
- `kind=fetched` means the id comes from a `get_session_metadata` call you made at that moment. `kind=recalled` means you wrote it from memory. At recalled checkpoints do not call the tool, do not read the log file, and do not scan earlier commands or output. Write the id (and label) from memory even if unsure; an honestly wrong value is a valid result.
- Do not modify any files in this workspace. Your only writes are the log appends.
- Steps marked **[interactive only]**: do them if you can ask the user a question and wait for the reply. If you are running non-interactively, skip them. When you do an ask step, log the pre-ask checkpoint BEFORE presenting the question and waiting.
- At the end, report only that the diagnostic is complete. Do not summarize or interpret the log.

## Sequence

1. cp=start: call `get_session_metadata`. Log `kind=fetched` with the session id, then log a second line: `cp=start kind=raw json=<the full response as single-line JSON>`.
2. Identify the three largest source files in this workspace and summarize each in detail (purpose, structure, key functions).
3. Log `cp=w1 kind=recalled`.
4. Describe the overall architecture of this workspace and how the files from step 2 fit into it.
5. Log `cp=w2 kind=recalled`.
6. **[interactive only]** Log `cp=ask1 kind=recalled`, then ask the user "Continue? (reply ok)" and wait. After the reply, log `cp=ans1 kind=recalled`.
7. Propose three improvements to this workspace, each with a paragraph of rationale.
8. Log `cp=w3 kind=recalled`.
9. **[interactive only]** Log `cp=ask2 kind=recalled`, then ask the user "Continue? (reply ok)" and wait. After the reply, log `cp=ans2 kind=recalled`.
10. cp=end: call `get_session_metadata` again. Log `kind=fetched`, then a `kind=raw` line with the full response.

## Checkpoint probe (embedded mode only)

When the user asks for a checkpoint probe, using the next probe number N (probe1, probe2, ...):

1. Log `cp=probeN kind=recalled` with the id from memory — no tool call, no log reading first.
2. Call `get_session_metadata` and log `cp=probeN kind=fetched` with the id from the response. On the first probe only, also log a `kind=raw` line.
3. Continue what you were doing.
