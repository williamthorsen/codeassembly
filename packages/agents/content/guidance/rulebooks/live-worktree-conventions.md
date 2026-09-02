---
slug: live-worktree-conventions
description: How a repository with a `live` worktree deploys, and where changes to it are authored.
delivery: ambient
version: '1'
---

# Live worktree conventions

A repository that keeps a worktree on a `live` branch deploys from that worktree, and never from the main one. Deployed configuration, installed commands, and loaded extensions all resolve through it, so a path derived from the main worktree names a file that nothing on the machine reads.

`git worktree list` reports every worktree of a repository from any one of them, so a `live` row is what recognizes a participating repository, and it gives the deployment worktree's path in the same line. That worktree is named `{path}.live`, where `{path}` is the main worktree's path: `~/repos/projects/codeassembly` is accompanied by `~/repos/projects/codeassembly.live`. Where the machine has the repo registry, `list-repos --tag live` enumerates the tagged set; a registry whose entries do not carry the tag returns nothing, which is no evidence that a repository lacks the convention.

A merged change reaches the machine only once `live` is advanced to it. Until then the deployed behavior is the old one, so a change is not live while `live` still points at its predecessor.

Advancing `live` deploys to the machine, which makes it the developer's action. Never advance or reset that branch.

Author in a branch worktree, never through `.live`. A write there lands on the deployed tree rather than on the branch under review. Reading from `.live` is fine, and is often how the deployed state is inspected.
