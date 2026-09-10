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

Every member acts on one of Atlassian's hosted products: creating, reviewing, and merging Bitbucket pull requests, and creating and updating Jira work items. A consumer should declare this collection only where one of those products is in use.

Nothing outside this collection reaches a member. `create-pr`, `merge-pr`, `review-pr`, and `create-ticket` each name one through an optional invocation token, and `collection-dispositions.unit.test.ts` fails when a token naming a member is written in its required form.
