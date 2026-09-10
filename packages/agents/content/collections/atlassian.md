---
name: atlassian
description: Skills that act on Bitbucket pull requests and Jira work items.
members:
  skills:
    - create-bitbucket-pr
    - merge-bb-pr
    - review-bb-pr
    - update-jira-ticket
---

# Atlassian

Every member acts on one of Atlassian's hosted products: creating, reviewing, and merging Bitbucket pull requests, and creating and updating Jira work items. Each names Bitbucket or Jira in its own procedure, so none does anything on a machine with access to neither.

A consumer should declare this collection only where one of those products is in use. Each member costs a line in the skill index of every session, and nothing on a machine without those products can use it.

Nothing outside this collection reaches a member. `create-pr`, `merge-pr`, `review-pr`, and `create-ticket` each name one through an optional invocation token, and `collection-dispositions.unit.test.ts` fails when a token naming a member is written in its required form.
