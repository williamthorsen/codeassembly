<HARD-GATE>
After reading project guidelines and obtaining the diff (typically 2-3 turns), your NEXT tool use MUST be a `Write` of the review scaffold to the orchestrator-supplied artifact path. Not a `Read`, not a `Grep`, not a `Bash` to inspect files — a `Write`. This guarantees a durable artifact exists at the canonical path even if your dispatch is interrupted by `max_turns` exhaustion or any other failure.
<!-- children -->
</HARD-GATE>
