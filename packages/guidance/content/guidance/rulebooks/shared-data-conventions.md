---
slug: shared-data-conventions
description: 'Changes to shared data: unmerged code never writes to a shared store, and a change to the shape of persisted data proceeds as expand, migrate, contract. Consult before planning, implementing, or reviewing a change that alters the shape of persisted data or writes to a shared store.'
delivery: [ambient, skill]
version: '1'
---

# Shared data conventions

Shared state is any store that a deployed product or another person reads, such as a production database or a content dataset. A local or disposable copy is not shared. The repository's `AGENTS.md` names which stores are shared and how their migrations run.

- **Writes.** Unmerged code never writes to shared state, even when a plan or a ticket directs it. Asked to run a migration or another write against shared state from a branch, decline and name the route: Merge, then run it from merged code.
- **Sequence.** A change to the shape of data proceeds as expand, migrate, contract. Expand adds the new shape alongside the old one, migrate moves the data, and contract removes the old shape once no deployed code reads it. Each step is its own change, merged and deployed before the next begins, so that every order of deploy and migration leaves the product working.
- **Migrations.** A migration runs from merged code, by automation or by the developer, and by an agent only when the developer directs that run. It defaults to a dry run and is idempotent.
