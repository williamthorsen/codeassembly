## Diff audit

Before reporting what a change did, read the change back, and repair what you find before writing the report. The input is the hunks that you just wrote, not the change under review: This audit is bounded by your own edit, and one that grows past it becomes a second review pass.

- **Claims.** Every statement about the change is read from the diff, not from what you set out to do. A claim that something was left unchanged needs the same evidence as a claim that something changed, and it is the one most often written from memory.
- **Reach.** What the edit moved beyond its target: a parallel enumeration of the same list elsewhere, such as a README mirroring the edited source doc; sibling wording invalidated by a rename or re-framing, in a test title, a function header, or a neighboring doc; declaration ordering after an insertion; and adjacent behavior that a changed guard now covers or stops covering.
- **Placement.** Each hunk that writes guidance or documentation states a fact only where the fact is defined, such as the config that declares it, the code, its owning README section, or a rulebook, and elsewhere points to that source. A list copied from a config, or a paragraph that restates a rulebook, is a copy that drifts.
- **Class.** When the change corrects a defect, the site that you were pointed at is a sample of its class. Audit the other members before reporting, or the next reviewer finds the one that you left.

A green gate is not this audit: A suite that passes reports that nothing broke, not that the record which you are about to write is true.
