---
name: atlassian
description: The vetted opt-in set (artifacts fitted to Atlassian's Bitbucket and Jira).
members:
  skills:
    - create-bitbucket-pr
    - merge-bb-pr
    - review-bb-pr
    - update-jira-ticket
---

# Atlassian

The opt-in collection. Membership claims an artifact was examined and found fitted to one vendor ecosystem rather than to one author or to everyone: It speaks to Bitbucket pull requests or to Jira work items, and it is useless on a machine that reaches neither.

What sets this collection apart from the vetted collections beside it is a property about what reaches in rather than about what its members are. Nothing outside it reaches a member: No other collection enumerating its own members resolves a closure containing one, so a consumer that does not declare this collection never deploys one. That is what `standalone` gets from membership in no collection, extended to a bundle whose members are wanted together.

The property is enforced rather than observed, because a single restored invocation token would undo it silently. The general PR, merge, review, and ticket skills each address a member through an optional token, which renders the invocation without pulling the target into the closure; writing one of those tokens in its required form hands the four back to every consumer of those skills.

Membership is worth the four skill-index lines only where the ecosystem is in use. A machine that uses neither Bitbucket nor Jira declares `recommended` and `triage` and pays nothing for these.
