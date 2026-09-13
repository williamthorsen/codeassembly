---
slug: williamthorsen-writing-preferences
description: William Thorsen's personal writing preferences for agent-authored prose.
delivery: [ambient, hook]
version: '5'
---

# William Thorsen's writing preferences

## Capitalization after a colon

Read what appears left of the colon. A label (such as a short tag naming a field, a category, or an option) is transparent: Capitalize what follows as though the label were absent. A clause puts the colon mid-sentence: Capitalize a complete sentence, keep a fragment or list lowercase. A lowercase code identifier keeps its own case on either branch.

- **Label, fragment follows:** "Exception: Trivial predicate callbacks whose type is obvious."
- **Clause, sentence follows:** "The cache is not the problem: The transport reconnects on every request."
- **Clause, fragment follows:** "Two directories stay out of the sweep: fixtures and generated output."
- **Code identifier:** "Run the formatter: `nmr fmt`."

## Em-dashes

<!-- rule: em-dash -->

Don't use em-dashes; use appropriate punctuation instead. A dash separating an identifier from its label is a delimiter rather than punctuation: Use a colon. If an em-dash is genuinely best, write it as `--`.

<!-- include: ../../_partials/reduced-object-relative.md / -->

## Second person

<!-- rule: second-person -->

Documentation describes; it does not address. Never write `you`, `your`, `yours`, or `yourself`, and never the contractions `you're`, `you've`, `you'll`, or `you'd`.

Imperative mood is untouched, because it does not carry a pronoun: "Run the formatter" directs the reader without naming one.

**The addressee decides.** Ask who the pronoun names. If it names the agent that the document instructs, a skill body or a subagent body directing its own executor, the pronoun is that document's address and stays. If it names a reader of documentation, someone using the package or working on it, the pronoun goes.

**The replacement names an actor.** Say who or what acts: "the config caps the rule" rather than "you cap the rule". If no actor belongs in the sentence, recast so that the artifact is the subject: "the flag takes a path" rather than "you pass it a path".

Two traps take a naive substitution:

- **The agentless passive.** Dropping the pronoun by hiding who acted trades one defect for another: "your rules are capped" becomes "the rules are capped", which names nobody. Plain speech rejects that passive; name the actor instead.
- **The surviving object gap.** "the rules you cap" and "the rules the config caps" are the same reduced object relative; therefore, the substitution leaves the second defect in place. Restore the relativizer, or apply the repairs in "Reduced object relatives" above.

## Sentence case

Use sentence case for titles, headings, section headers, steps, labels, and interface elements. Never use title case. Preserve the case of proper nouns, named entities, and the actual titles of books and movies.

- "Backend: Express API routes and server" not "Backend: Express API Routes And Server"
- "Frontend: Static Excalibur scene" not "Frontend: Static Excalibur Scene"
- "Customizing the Status Adapter for a new backend", not "Customizing the Status Adapter for a New Backend"

## `so`

<!-- rule: so -->

Don't join two clauses with `so`, which marks no relation between them. Name the relation: "because" or "as a result" for a cause, "so that" or "to" for a purpose, and "; therefore," for an inference. "So that", the degree adverb ("so many"), and a `so` that stands for a clause ("do so", "if so") are outside the rule.

## `where`

<!-- rule: where -->

Use `where` only for a place; for any other relation, use the word that most clearly expresses it.
