# Design priorities

Rank design options by architectural and API merit; treat effort, blast radius, and legacy consistency as secondary context.

## The principle

When weighing design options, the **durable** properties of the system are decisive:

- API quality and clarity of contracts
- Architectural soundness — modularity, composability, separation of concerns
- Single-responsibility principle and SOLID compliance
- Testability

The **secondary** properties — temporary or contingent — are not:

- Level of effort (lines changed, files touched)
- Blast radius (number of callers updated, downstream tests requiring fixes)
- Consistency with legacy code or pre-existing patterns
- Avoidance of scope creep within the current task

## Why

The durable properties shape what it costs to live with the system over its remaining life. A clean API can be evolved; a tangled one accumulates patches around its tangle. The secondary properties are paid once, at the moment of change. Recommending the worse-architected option because the better one is more work biases the codebase toward decisions that are easy to make but hard to live with.

## How to apply

- The architecturally cleaner option ranks higher unless its advantage is genuinely marginal.
- Effort, blast radius, and legacy consistency may appear as **secondary context** ("worth knowing the cost"), never as the **primary reason** to prefer one option over another.
- If the better-architected option is more work, recommend it anyway and say so in the rationale. Do not down-rank it for being more work.
- "It matches the surrounding code" is a legacy-consistency reason, not an architectural one. Use it only when surrounding code is itself well-architected.

## Before / after

A typical decision: a feature needs a new validation step. Two options:

A. Add the validation as a method on the existing god-class that already owns adjacent concerns.
B. Extract a small dedicated module with a narrow interface and inject it.

**Effort-led ranking** (don't do this):

```
1. ■■■ Extend the god-class: ➕ minimal diff; ➕ no new files; ➕ matches surrounding code.
2. ■□□ Extract a module: ➖ more files; ➖ touches injection sites.
```

**API-led ranking** (do this):

```
1. ■■■ Extract a module: ➕ narrow interface; ➕ testable in isolation; ➕ untangles concerns the god-class already conflates.
2. □□□ Extend the god-class: ➖ deepens an existing SRP violation; effort gain is one-off, complexity cost compounds.
```

The factual lists about each option are similar; the **ranking** flips because the criteria changed. The secondary considerations (diff size, file count) move to the cons of the over-coupled option, where they belong.

## Reconciliation

This rule reinforces "push back on questionable legacy" — the guidance to examine, not preserve, carve-outs labelled "for backward compatibility" or "matches existing convention" when no concrete consumer would break under normalization. Both rules push the same direction: do not let temporary costs (effort, legacy consistency) outrank durable properties (architecture, API quality).
