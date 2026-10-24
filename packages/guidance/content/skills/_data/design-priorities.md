# Design priorities

Prioritize the right decision over the most convenient one.

## The principle

Design options have two kinds of properties.

**Correctness** (what makes the design right):

- Behavioral correctness: Does it produce the right results across the cases that matter? The project's declared stage sets which cases matter; see [project stage](project-stage.md).
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

Correctness determines what it costs to live with the system over its remaining life. A clean design can be evolved; a wrong one accumulates patches around its wrongness. Convenience saves effort only once, at the moment of change.

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
   - ➕ untangles concerns that the god-class already conflates
2. □□□ Extend the god-class:
   - ➖ deepens an existing SRP violation; convenience gain is one-off, complexity cost compounds
```

The factual lists about each option are similar; the **ranking** flips because the criteria changed.

## Designing as if from the beginning

When designing a change, ask: _How would we have written this if the new behavior had been there from the start?_ Aim the design at that target.

Four patterns signal a design that hasn't reached it:

- **Workarounds**: Changing surrounding code to accommodate a fix instead of changing the code that's wrong.
- **Carve-outs**: Special cases or conditional branches that exist because the change couldn't be integrated cleanly, not because the cases are genuinely distinct.
- **Bolt-ons**: New modules or extension points appended alongside existing structure when the existing structure should have evolved to absorb the change.
- **Hand-offs**: Steps that a person performs on each machine or environment because the design did not give the agent a way to apply the change there. See [who applies the change](#who-applies-the-change).

A fresh codebase wouldn't have these shapes; their presence means the change was attached to the system rather than integrated into it. Reaching the target may require touching code outside the ticket's literal scope: renaming, restructuring, generalizing. That cost is real but bounded; the cost of keeping a poorly integrated change compounds.

## Who applies the change

The developer's manual steps are a cost of the design, counted across the session rather than per turn: Every command that a person runs on a machine, and every result that they paste back, is a step that the design failed to script. Rank a design that the agent applies and verifies itself above one that needs a person to act on each machine, whatever the convenience properties say. A step that a person must run on each machine is a defect of the design: Raise it at design time, and never ship it as README steps, written after the merge, for a person to follow.

When the design cannot remove the step, shape it on this ladder, and stop at the first rung that works:

1. Reach the machine through the access that its own tooling already uses, such as `ssh`, and apply the step there. When this rung needs a credential or a grant, ask for it once, naming the command that runs once it arrives.
2. Route the step through provisioning that the machine already runs, such as the ensure scripts of its configuration repository, so that the agent commits the change and the machine applies it on its next run.
3. Leave one script per machine, run once, that checks its own result and prints only the facts that the agent needs. The agent writes and commits the script and keeps every other part, including the records of what was done.

## Reconciliation

These rules reinforce "push back on questionable legacy": the guidance to examine, not preserve, carve-outs labelled "for backward compatibility" or "matches existing convention" when normalization would not break any concrete consumer.
