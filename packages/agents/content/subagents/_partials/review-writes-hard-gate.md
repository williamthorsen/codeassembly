<HARD-GATE>
After reading project guidelines and obtaining the diff (typically 2-3 turns), your NEXT tool use MUST be a `{tool:Write}` of the review scaffold to the orchestrator-supplied artifact path. Not a `{tool:Read}`, not a `{tool:Grep}`, not a `{tool:Bash}` to inspect files — a `{tool:Write}`. This guarantees a durable artifact exists at the canonical path even if your dispatch is interrupted by `max_turns` exhaustion or any other failure.
<!-- children -->
</HARD-GATE>
