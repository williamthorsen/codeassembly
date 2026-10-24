---
slug: williamthorsen-writing-preferences
description: William Thorsen's personal writing preferences for agent-authored prose.
delivery: [ambient, hook]
version: '11'
---

# William Thorsen's writing preferences

## Apostrophes

<!-- rule: apostrophes 1 -->

Keep every apostrophe that a possessive or a contraction takes. Writing `the rule own example` for `the rule's own example`, or `dont` for `don't`, corrupts the text. When a command's quoting cannot hold a character, pass the content through a file written with the Write tool or through a quoted heredoc (`<<'EOF'`), and never drop or replace the character.

## Capitalization after a colon

<!-- rule: capitalization-after-colon 1 -->

Read what appears left of the colon. A label (such as a short tag naming a field, a category, or an option) is transparent: Capitalize what follows as though the label were absent. A clause puts the colon mid-sentence: Capitalize a complete sentence, keep a fragment or list lowercase. A lowercase code identifier keeps its own case on either branch.

- **Label, fragment follows:** "Exception: Trivial predicate callbacks whose type is obvious."
- **Clause, sentence follows:** "The cache is not the problem: The transport reconnects on every request."
- **Clause, fragment follows:** "Two directories stay out of the sweep: fixtures and generated output."
- **Code identifier:** "Run the formatter: `nmr fmt`."

## Em-dashes

<!-- rule: em-dash 1 -->

Don't use em-dashes; use appropriate punctuation instead. A dash separating an identifier from its label is a delimiter rather than punctuation: Use a colon. If an em-dash is genuinely best, write it as `--`.

## Reduced object relatives

<!-- rule: reduced-object-relative 1 -->

A relative clause with an object gap takes an overt relativizer: "the source that it names", never "the source it names". The test is mechanical: Between the head noun and the embedded subject, look for `that` or `which`. This is a house convention, not a claim about ordinary English, which permits the contact clause freely.

**Repairs, in preference order.** Choose per site; restored relativizers stacked across a passage read as a tic of their own.

1. **Reduce to a passive participle** if the actor is worth naming: "a dependency imported by every exported tier module".
2. **Restore the relativizer** if the passive reads worse: "the ticket that the branch name encodes".
3. **Recast** if neither fits: Promote the embedded clause to a main clause, or replace the relative with a prepositional phrase.

**A gap in a prepositional phrase takes its own order.** Pied-pipe the preposition first: "the level against which it is probed", preferred over the stranded "the level that it is probed against". If pied-piping reads stiffly, the stranded relativizer is the second choice and a recast the third. The passive participle is last here rather than first, since the actor is already inside the clause.

**A predicate-nominal gap takes the restored relativizer.** "the throwing mock that it is", never "the throwing mock it is". Neither of the other repairs applies to it: A copula does not have a preposition to pied-pipe or an actor to promote into a participle. If the restored relativizer reads stiffly, recast.

**A coordinated gap takes a doubled relative or one shared stranded relativizer.** When a direct-object gap coordinates with an oblique one, pied-piping cannot reach the first, which does not have a preposition to pipe. The parallel forms are "the error which it threw or with which it rejected" and "the error that it threw or rejected with".

**The shapes, ranked by cost.** The rank follows the embedded subject's form, since the reader must keep that form in mind until the verb appears. Each is an exhibit of the construction, not a model to copy.

1. **Quantified noun phrase** (worst): "a dependency every exported tier module imports". The reader absorbs a quantifier and a full noun phrase before any verb discharges the head.
2. **Definite noun phrase**: "the ticket the branch name encodes".
3. **Bare noun**: "an idiom developers recognize".
4. **Pronoun** (mildest): "the source it names". Forbidden all the same; a pronoun shortens the wait rather than ending it.

**The agentive `by`-phrase satisfies plain speech.** Plain speech rejects the _agentless_ passive that hides who acted. A `by`-phrase names the actor in the same breath; therefore, "imported by every exported tier module" satisfies plain speech as fully as the active form does. This rule breaks the habit of reaching for a contact clause to dodge a passive that was never the target.

**Scope.** The rule governs a lexical head noun whose relative clause has a gap in an argument position: the direct object ("the source that it names"), the object of a preposition ("the level against which it is probed"), or the complement of a copula ("the throwing mock that it is"). The anaphoric one-series heads a relative clause under the rule too, though it is not a lexical noun, because a relativizer restores to it: "one that the spy carries". Two neighboring constructions fall outside the rule, each on a ground of its own: the fused head ("everything I know", "all you need"), which is its own relative pronoun and does not admit a relativizer, and the adjunct relative ("the reason it fails", "the way it works"), whose gap does not fill an argument position. The boundary keys on head type and gap role. Neither a short embedded subject nor a tight word budget exempts anything.

## Second person

<!-- rule: second-person 1 -->

Documentation describes; it does not address. Never write `you`, `your`, `yours`, or `yourself`, and never the contractions `you're`, `you've`, `you'll`, or `you'd`.

Imperative mood is untouched, because it does not contain a pronoun: "Run the formatter" directs the reader without naming one.

**The addressee decides.** Ask who the pronoun names. If it names the agent that the document instructs, a skill body or a subagent body directing its own executor, the pronoun is that document's address and stays. If it names a reader of documentation, someone using the package or working on it, the pronoun goes.

**The replacement names an actor.** Say who or what acts: "the config sets a cap on the rule" rather than "you cap the rule". If an actor does not belong in the sentence, recast so that the artifact is the subject of a verb that it performs or one that states a relation, as plain speech requires: "the flag takes a path" rather than "you pass it a path".

A naive substitution fails in two ways:

- **The agentless passive.** Dropping the pronoun by hiding who acted trades one defect for another: "your rules are capped" becomes "the rules are capped", which names nobody. Plain speech rejects that passive; name the actor instead.
- **The surviving object gap.** "the cap you set" and "the cap the config sets" are the same reduced object relative; therefore, the substitution leaves the second defect in place. Restore the relativizer, or apply the repairs in "Reduced object relatives" above.

## Sentence case

<!-- rule: sentence-case 1 -->

Use sentence case for titles, headings, section headers, steps, labels, and interface elements. Never use title case. Preserve the case of proper nouns, named entities, and the actual titles of books and movies.

- "Backend: Express API routes and server" not "Backend: Express API Routes And Server"
- "Frontend: Static Excalibur scene" not "Frontend: Static Excalibur Scene"
- "Customizing the Status Adapter for a new backend", not "Customizing the Status Adapter for a New Backend"

## `so` and other connectives

<!-- rule: so 1 -->

Join two clauses with `so` only when the second states a direct result of the first: "The entry is not a top-level segment, so the exclusion does not cover it." For a purpose, write "so that" or "to": "The link points to `.live` so that apps read the stable worktree." If the second clause follows only through a step that the sentence leaves out, state that step rather than change the conjunction.

Use connectives sparingly. When most sentences in a paragraph end with a consequence, the paragraph reads as a chain of justifications, and the repeated word distracts even when each use is correct. Keep a connective only when a reader would not infer the link from the order of the sentences. Leave at least three sentences between one clause-joining `so` and the next, and do not meet that limit by swapping in another connective: Split the sentence, lead with "because", or drop the link.

A degree adverb ("so many") and a `so` that stands for a clause ("do so", "if so") are outside the rule.

## `where`

<!-- rule: where 2 -->

Use `where` for a place, or after an expression to state what a symbol, variable, placeholder, or value in it stands for; for any other relation, use the word that most clearly expresses it.

- **Definition:** "`{NN+1}`, where `{NN}` is the run-summary sequence number"
- **Condition (a violation):** "the entry where `role` is `coder`" becomes "the entry whose `role` is `coder`"
- **Event (a violation):** "Fixes an issue where the report cut a subject" becomes "Fixes the issue that the report cut a subject"
