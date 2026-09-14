---
slug: live-worktree-policy
description: How a repository with a `live` worktree deploys, and where changes to it are authored.
delivery: ambient
version: '2'
---

# Live worktree policy

A repository that keeps a worktree on a `live` branch deploys from that worktree, and never from the main one. Deployed configuration, installed commands, and loaded extensions all resolve through it, so a path derived from the main worktree names a file that nothing on the machine reads.

Because `git worktree list` reports every worktree of a repository from any one of them, a `live` row identifies a participating repository and gives the deployment worktree's path in the same line. That worktree is named `{path}.live`, for a main worktree at `{path}`: `~/repos/projects/codeassembly` is accompanied by `~/repos/projects/codeassembly.live`. If the machine has the repo registry, `list-repos --tag live` enumerates the tagged set; for a registry whose entries do not have the tag, it returns nothing, which is no evidence that a repository does not deploy from a `live` worktree.

A merged change is deployed to the machine only once `live` is advanced to it. Until then the deployed behavior is the old one, so a change is not live while `live` still points at its predecessor.

Advancing `live` deploys to the machine, which makes it the developer's action. Never advance or reset that branch.

Author in a branch worktree, never through `.live`. A write there changes the deployed tree rather than the branch under review. Reading from `.live` is fine, and is often how the deployed state is inspected.
