---
name: atlassian
description: Skills that act on Bitbucket pull requests and Jira work items.
disposition: opt-in
members:
  skills:
    - create-bitbucket-pr
    - merge-bb-pr
    - review-bb-pr
    - update-jira-ticket
---

# Atlassian

Every member acts on one of Atlassian's hosted products: creating, reviewing, and merging Bitbucket pull requests, and creating and updating Jira work items. A consumer should declare this collection only if one of those products is in use.

Artifacts outside this collection do not require any member. `create-pr`, `merge-pr`, `review-pr`, and `create-ticket` each name one through an optional invocation token, and `codeassembly validate` reports a token naming a member that is written in its required form.
