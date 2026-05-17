<HARD-GATE>
For multi-task plans (implementation mode) and for every review-response round, your FIRST implementation tool use MUST be a `{tool:Write}` of the change-summary scaffold to the orchestrator-supplied artifact path. This guarantees a durable, structurally-complete artifact exists even if your dispatch is interrupted by `max_turns` exhaustion or any other failure.

Single-task implementation plans are exempt — write the artifact once at the end.
</HARD-GATE>
