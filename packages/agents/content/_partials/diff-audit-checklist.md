## Diff audit

Before reporting what a change did, read the change back, and repair what you find before writing the report. The input is the hunks you just wrote, not the change under review: This audit is bounded by your own edit, and one that grows past it becomes a second review pass.

- **Claims.** Every statement about the change is read from the diff, not from what you set out to do. A claim that something was left unchanged needs the same evidence as a claim that something changed, and it is the one most often written from memory.
- **Reach.** What the edit moved beyond its target: a parallel enumeration of the same list elsewhere, such as a README mirroring the source doc you edited; sibling wording a rename or re-framing invalidates, in a test title, a function header, or a neighboring doc; declaration ordering after an insertion; and adjacent behavior a changed guard now covers or stops covering.
- **Class.** Where the change corrects a defect, the site you were pointed at is a sample of its class. Audit the other members before reporting, or the next reviewer finds the one you left.

A green gate is not this audit: A suite that passes reports that nothing broke, not that the record you are about to write is true.
