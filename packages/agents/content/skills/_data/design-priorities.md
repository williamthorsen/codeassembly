# Design priorities

Prioritize the right decision over the most convenient one.

## The principle

Design options have two kinds of properties.

**Correctness** (what makes the design right):

- Behavioral correctness: Does it produce the right results across the cases that matter?
- API quality: Clear contracts, expressive interfaces, sensible boundaries
- Architectural soundness: Modularity, separation of concerns, single responsibility, composability, SOLID
- Testability: The design can be verified in isolation
- Maintainability: The design holds up over time; clarity and evolvability under future requirements

**Convenience** (what makes the change easy now):

- Level of effort: Diff size, lines changed, files touched
- Blast radius: Downstream callers, tests, or consumers requiring updates
- Consistency with existing code: Matching pre-existing patterns to avoid divergence
- Scope minimization: Leaving adjacent issues unaddressed because they weren't in the ticket

Rank options on correctness. Convenience is secondary: a tiebreaker among correctness-equivalent options at most. If one option is correctness-superior, recommend it even when it is more work, touches more files, or diverges from surrounding code.

## Why

Correctness determines what it costs to live with the system over its remaining life. A clean design can be evolved; a wrong one accumulates patches around its wrongness. Convenience is paid once, at the moment of change.

## Before / after

A typical decision: A feature needs a new validation step. Two options:

A. Add the validation as a method on the existing god-class that already owns adjacent concerns.
B. Extract a small dedicated module with a narrow interface and inject it.

**Convenience-led ranking** (don't do this):

```
1. ■■■ Extend the god-class:
   - ➕ minimal diff
   - ➕ no new files
   - ➕ matches surrounding code
2. ■□□ Extract a module:
   - ➖ more files
   - ➖ touches injection sites
```

**Correctness-led ranking** (do this):

```
1. ■■■ Extract a module:
   - ➕ narrow interface
   - ➕ testable in isolation
   - ➕ untangles concerns the god-class already conflates
2. □□□ Extend the god-class:
   - ➖ deepens an existing SRP violation; convenience gain is one-off, complexity cost compounds
```

The factual lists about each option are similar; the **ranking** flips because the criteria changed.

## Designing as if from the beginning

When designing a change, ask: _how would we have written this if the new behavior had been there from the start?_ Aim the design at that target.

Three patterns signal a design that hasn't reached it:

- **Workarounds**: Changing surrounding code to accommodate a fix instead of changing the code that's wrong.
- **Carve-outs**: Special cases or conditional branches that exist because the change couldn't be integrated cleanly, not because the cases are genuinely distinct.
- **Bolt-ons**: New modules or extension points appended alongside existing structure when the existing structure should have evolved to absorb the change.

A fresh codebase wouldn't have these shapes; their presence means the change was attached to the system rather than integrated into it. Reaching the target may require touching code outside the ticket's literal frame: renaming, restructuring, generalizing. That cost is real but bounded; the cost of keeping a poorly integrated change compounds.

## Reconciliation

These rules reinforce "push back on questionable legacy": the guidance to examine, not preserve, carve-outs labelled "for backward compatibility" or "matches existing convention" when no concrete consumer would break under normalization.
