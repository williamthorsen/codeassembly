<!-- unit-version: plain-speech 8 -->

## Plain-speech sweep calibration

How one sweep applies the rule above, so that two sweepers give the same verdict on the same sentence. The rule decides what counts as plain; this section decides what a sweeper rewrites and what it leaves.

### Rewrite these

1. **A figurative verb when a plain one exists.** "detail taxes the reader" becomes "detail wastes the reader's attention". "the lede writes itself" becomes "the lede follows".
2. **A verb that does not fit its subject.** "the file carries a section" becomes "the file contains a section". "the block governs" becomes "the block takes precedence".
3. **A subject that does not perform the action, or a missing actor that the reader needs.** Rewrite when the sentence gives an action to something that does not perform it, or omits an actor that the reader must know and cannot recover from context. "Findings arrive as warnings" becomes "The function reports warnings": Findings arrive nowhere, and the original drops the function that produced them. In a skill body, "the parent rides the creation call" becomes "Set the parent in the creation call", because the agent sets it. "Refinement happens later, in bulk" becomes "A later pass refines them in bulk", because the point is which pass does it.
4. **A constructed figure when a literal phrase exists.** The rule's mannered-prose test, applied to a site. Only a figure is a candidate under this case, so plain technical vocabulary ("renders as a subsection", "inlines the partial", "the test fails") is not one. `gate`, `sweep`, `tier`, `lede`, `drift`, and `live` are figures on which this corpus has settled, and they stay.

Passive voice is not a defect on its own, and case 3 is no license to convert it. Keep the passive when the actor is obvious or beside the point, when the patient is the paragraph's topic, or when it puts a long phrase at the end of the sentence.

### Leave these

- A term on the settled list in case 4 above. That list is closed: A term absent from it is a candidate. Neither its frequency, nor a neighboring file, nor its survival of an earlier sweep settles a term, and a sweeper citing one is reporting what the corpus does rather than what the rule requires. Extending the list is the author's decision, taken in this calibration, never a sweeper's.
- Any rewrite that would change what the text directs. When the plain wording would resolve an ambiguity that the original left open, leave the text and report the site as questionable.

### Worked example

A paragraph of this library's own guidance. Before:

> Behavioral rules that govern an agent's output -- such as the recommendation gradient and the action-items block -- are stated once in `AGENTS.md` and the shared `_data` specs. Where the boundary below calls for a restatement, it lands at the step that produces the output. An agent follows a rule more reliably when it sits beside the action it governs than when it must be fetched through a link.

After:

> Behavioral rules for an agent's output -- such as the recommendation gradient and the action-items block -- are stated once in `AGENTS.md` and the shared `_data` specs. When the boundary below requires a restatement, put it at the step that produces the output. An agent follows a rule more reliably when the rule appears next to the action that it governs than when the agent must follow a link to read it.

Three edits fall under cases 1 and 2, and two under case 3: "lands" gives the placement to the restatement rather than to the agent that places it, and "must be fetched" drops the agent from a sentence whose point is which party fetches. The first sentence's passive stands, because the paragraph's topic is the rules rather than the files that state them. Two edits belong to no case here: The "When" that replaces "Where" and the relativizer restored in "the action that it governs" come from the writing preferences, which a sweep applies in the same pass.

### Shapes to look for

Nine shapes recur in this corpus. Each is a search pattern rather than a rule: A sentence matching one is a candidate for the rule's tests, and a sentence matching none can still fail them.

1. **The cleft construction.** "Segment anchoring is what admits the branch form" becomes "Segment anchoring admits the branch form".
2. **Appositives stacked on the subject.** "The record, a file that one run writes and the next reads, is keyed on the phrase" becomes "The record is keyed on the phrase. One run writes it and the next reads it."
3. **"Not X, but Y" when Y alone says it.** "The default is not a report, but an applied repair" becomes "The default applies the repair".
4. **A nominalized gerund standing in for the actor.** "Five filters separate needing coverage from a particular test being worth writing" becomes "A change can need coverage even when no particular test is worth writing".
5. **A long subject with an embedded clause before its main verb.** "A change that needs coverage but finds no candidate clearing the bar ships without a test" becomes "A change is merged without a test when it needs coverage and no candidate clears the bar".
6. **Personification of an inanimate subject.** "The queue now reads as one set behind the blocking ticket" becomes "All four tickets are now marked as blocked by that ticket".
7. **An abstract noun standing in for a small concrete set.** "The suite covers the boundary cases" becomes "The suite covers an empty list, one entry, and a list past the budget".
8. **A concrete metaphor standing in for the literal abstraction.** The inverse of shape 7. "attrition rather than advocacy" becomes "tiring the developer rather than persuading them". "priced on your ledger" becomes "measured by you".
9. **A negative quantifier standing in for the one actor that cannot act.** "a skill that no task invokes" becomes "a skill that the plan does not invoke".

### The negative-quantifier rule

<!-- rule: negative-quantifier 1 -->

The helper reports shape 9 under this rule. Report a site of that shape under `negative-quantifier`, and every other site that breaks the plain-speech rule under `plain-speech`.

### Words to look for

Ten words recur in this corpus in uses for which a word naming the relation exists. Each is a search term rather than a rule, as a shape is: A match is a candidate for the rule's tests. When an entry names a sense that stays, a use in that sense is no candidate.

- **carry**: "the change carries a flag". Instead: has, includes, declares, sets, states.
- **cost**: "a cost to you", "the token cost". Instead: the unit itself, as in "takes 12 ms", "one round trip", "spends the reader's attention".
- **hold**: "the caller holds the state". Instead: owns, stores, keeps. Stays when a promise or an invariant holds.
- **land**: "the fix lands in this PR". Instead: is merged, is committed.
- **reach**: "the change reaches the machine". Instead: is deployed to, is installed on, is available to, arrives in.
- **route**: "route the finding to PR-prep". Instead: send to, assign to, report to.
- **ship**: "ships without a test". Instead: is merged, is released.
- **sit**: "sits outside the body". Instead: is, is in, is next to.
- **stand**: "stands up a fixture". Instead: builds, creates. Stays as "stands in for", and when a claim or a passive stands.
- **surface**: "a review surfaces findings". Instead: reports, raises, reveals. Stays as the noun: a documentation surface.
