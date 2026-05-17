---
name: find-orchestration-savings
description: Analyze completed orchestrated runs for token waste and resource misallocation
user-invocable: true
---

# Find orchestration savings

Analyze a completed orchestrated run to identify cost-saving opportunities while preserving or improving output quality.

## Arguments

- Run directory path (optional): Path to the run directory to analyze. If omitted, resolved from session context (most recent run in the current project's artifact directory).

## Process

1. **Resolve run directory:**
   - If a run directory path is provided, use it.
   - If a run is active in the current session (run-index.json path known), use that.
   - Otherwise, use `get-session-context` to get `project_slug`, `ticket_id`, and `artifact_base_dir`, then scan `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/` for the most recent completed run (directory with latest timestamp).
   - If no run found, report "No completed run found for this context" and exit.

2. **Verify the run directory** contains `run-log.jsonl` and `run-index.json`. If either is missing, report and exit.

3. **Dispatch the savings-analyzer subagent** via Task tool:
   - Model: `haiku`
   - Prompt: Provide the run directory path and the next available sequence number for the artifact filename
   - The subagent reads the event log, applies the analysis framework, and writes the artifact

4. **Present chat summary:** After the subagent completes, read the artifact and present the top 3 findings in conversation.

## Auto-trigger integration

This skill is also invoked automatically during Phase 5 (summary) of orchestrated runs. The orchestrate engine dispatches the savings-analyzer subagent as a background Task while the orchestrator writes the run-summary inline. When auto-triggered:

- The run directory is known from the active run context
- The sequence number follows the run-summary artifact
- The model is Haiku (configured via the `savings_analyzer` model key, defaulting to `haiku`)
- Zero added latency: The analysis runs as a background Task while the orchestrator writes the run summary
