---
slug: shared-data-conventions
description: 'Changes to shared data: unmerged code never writes to a shared store, a verdict that decides such a write includes evidence that a script checks, a skill that makes such writes runs read-only against the real data before merge, and a change to the shape of persisted data proceeds as expand, migrate, contract. Consult before planning, implementing, or reviewing a change that alters the shape of persisted data or writes to a shared store.'
delivery: [skill]
version: '2'
---

# Shared data conventions

Shared state is any store that a deployed product or another person reads, such as a production database or a content dataset. A local or disposable copy is not shared. The repository's `AGENTS.md` names which stores are shared and how their migrations run.

- **Writes.** Unmerged code never writes to shared state, even when a plan or a ticket directs it. Asked to run a migration or another write against shared state from a branch, decline and name the route: Merge, then run it from merged code.
- **Judged writes.** When the verdict of an agent or a subagent decides a write to shared state, the verdict includes evidence that a script checks before the write, such as a quote that the script finds in the cited file, a commit that exists, or a date that it compares with history. The script refuses a verdict whose evidence fails the check. A prose instruction to the judge does not replace the check: Fixtures exercise the mechanics around a verdict, not the judgment on real data.
- **Real-data run.** Before merge, a skill that writes to shared state runs against the real data in a mode that stops before the write: its approval checkpoint, or a dry run. The agent reviews each verdict that the run would act on, and a wrong verdict is fixed on the branch. The run only reads, so **Writes.** still holds.
- **Sequence.** A change to the shape of data proceeds as expand, migrate, contract. Expand adds the new shape alongside the old one, migrate moves the data, and contract removes the old shape once the deployed code no longer reads it. Each step is its own change, merged and deployed before the next begins, so that every order of deploy and migration leaves the product working.
- **Migrations.** A migration runs from merged code, by automation or by the developer, and by an agent only when the developer directs that run. It defaults to a dry run and is idempotent.
