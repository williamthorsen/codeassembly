---
name: triage
description: The not-yet-examined set, the default home for library content awaiting a disposition.
members: '@unclaimed'
---

# Triage

The not-yet-examined collection, and where new content starts. Membership claims nothing about an artifact beyond its existence: Nobody has yet read it for personal doctrine or for coupling to one author's environment, so it can be neither offered as generally applicable nor vouched for as deliberately personal.

`members: '@unclaimed'` computes the membership: every artifact of this content root that no collection with a `disposition:` enumerates and that does not declare `standalone:`. A newly added artifact is therefore a member without an edit here. Declaring the collection is the honest way to keep everything while the vetting proceeds, and it is why the vetted collections are usable before the vetting examines a single artifact.

An artifact leaves this collection by promotion into a public or personal collection, by moving into an opt-in collection once it turns out to be wanted often but only on the machines using one vendor's ecosystem, or by declaring `standalone:` once it turns out to be deliberate but rarely wanted. Nothing that has left is ever moved back in. Several members contain general and personal guidance in one file and become decidable only after a rewrite splits them.
