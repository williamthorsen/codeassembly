<!-- unit-version: plain-speech 2 -->

## Plain-speech sweep calibration

How one sweep applies the rule above, so that two sweepers reach the same verdict on the same sentence. The rule decides what counts as plain; this section decides what a sweeper rewrites and what it leaves.

### Rewrite these

1. **A figurative verb where a plain one exists.** "detail taxes the reader" becomes "detail costs the reader attention". "the lede writes itself" becomes "the lede follows".
2. **A subject that cannot perform the verb.** "the file carries a section" becomes "the file contains a section". "the block governs" becomes "the block takes precedence". "Findings arrive as warnings" becomes "The function reports warnings": Findings arrive nowhere, and the original drops the function that produced them.
3. **A missing actor that the reader needs.** Rewrite where the sentence omits an actor that the reader must know and cannot recover from context. "Refinement happens later, in bulk" becomes "A later pass refines them in bulk", because which pass does it is the point.
4. **A constructed figure where a literal phrase exists.** The rule's mannered-prose test, applied to a site. `gate`, `sweep`, `tier`, and `lede` are settled vocabulary and stay, whatever their figurative origin.

Passive voice is not a defect on its own, and case 3 is no licence to convert it. Keep the passive where the actor is obvious or beside the point, where the patient is the paragraph's topic, or where it holds a heavy phrase at the end of the sentence.

### Leave these

- Domain terms on which this corpus has settled: "renders as a subsection", "inlines the partial", "the test fails". A settled term is vocabulary, however a sweeper might paraphrase it. Entrenchment alone does not settle a term: a figure merely repeated by the corpus is still a figure.
- A figure carrying meaning that the literal phrase drops. The rule's own "a figure drags in connotations" is one: "drags in" says the connotations arrive attached and resist removal, where "has" reports only that they exist. Leave any figure doing comparable work.
- Any rewrite that would change what the text directs. Where the plain wording would resolve an ambiguity that the original left open, leave the text and report the site as questionable.

### Worked example

A paragraph of this library's own guidance. Before:

> Behavioural rules that govern an agent's output -- such as the recommendation gradient and the action-items block -- are stated once in `AGENTS.md` and the shared `_data` specs. Where the boundary below calls for a restatement, it lands at the step that produces the output. An agent follows a rule more reliably when it sits beside the action it governs than when it must be fetched through a link.

After:

> Behavioural rules for an agent's output -- such as the recommendation gradient and the action-items block -- are stated once in `AGENTS.md` and the shared `_data` specs. Where the boundary below requires a restatement, put it at the step that produces the output. An agent follows a rule more reliably when the rule appears next to the action that it governs than when the agent must follow a link to read it.

Four edits fall under cases 1 and 2, and one under case 3: "must be fetched" drops the agent, and which party fetches is the sentence's point. The first sentence's passive stands, because the paragraph's topic is the rules rather than the files that state them. One edit belongs to no case here: The relativizer restored in "the action that it governs" comes from the writing preferences, which a sweep applies in the same pass.

### Shapes to look for

Eight shapes recur in this corpus. Each is a search pattern rather than a rule: A sentence matching one is a candidate for the rule's tests, and a sentence matching none can still fail them.

1. **The cleft construction.** "Segment anchoring is what admits the branch form" becomes "Segment anchoring admits the branch form".
2. **Appositives stacked on the subject.** "The record, a file that one run writes and the next reads, is keyed on the phrase" becomes "The record is keyed on the phrase. One run writes it and the next reads it."
3. **"Not X, but Y" where Y alone says it.** "The default is not a report, but an applied repair" becomes "The default applies the repair".
4. **A nominalized gerund standing in for the actor.** "Five filters separate needing coverage from a particular test being worth writing" becomes "A change can need coverage even when no particular test is worth writing".
5. **A long subject carrying an embedded clause before its main verb.** "A change that needs coverage but finds no candidate clearing the bar ships without a test" becomes "A change ships without a test when it needs coverage and no candidate clears the bar".
6. **Personification of an inanimate subject.** "The queue now reads as one set behind the blocking ticket" becomes "All four tickets are now marked as blocked by that ticket".
7. **An abstract noun standing in for a small concrete set.** "The suite covers the boundary cases" becomes "The suite covers an empty list, one entry, and a list past the budget".
8. **A concrete metaphor standing in for the literal abstraction.** The mirror of shape 7. "attrition rather than advocacy" becomes "tiring the developer rather than persuading them". "priced on your ledger" becomes "a cost to you".
