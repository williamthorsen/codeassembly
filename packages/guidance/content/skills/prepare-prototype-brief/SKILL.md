---
name: prepare-prototype-brief
description: Compose the shared brief and the lens sections for a round of competing prototypes, check the brief against the rules that builders over-apply, and dispatch one builder per lens. Use when a ticket calls for two or more prototypes of one idea built in parallel.
user-invocable: true
dependencies:
  skills:
    - index-prototypes
    - save-artifact
---

# Prepare prototype brief

Write the brief that a round of prototype builders receives, from the idea, the settled intent, and the lenses that the developer supplies. The brief is the one input that every builder reads, and a builder satisfies its words literally: A criterion written into a section's instruction becomes a refrain in every entry, a request to convince becomes a sales pitch, "show the view" becomes a paragraph about the view, and "a large clock" becomes a digital readout. The rules below are the ones that the developer should never have to police in their own words. You apply them; the developer states the ask.

The round's artifacts follow {skill:index-prototypes}: each prototype at `{set_dir}/{slug}-v{n}.html`, one index page with screenshots and verdicts, and a comparison afterwards.

## Inputs

- **The ticket**, which states the idea and whatever intent is already settled.
- **The developer's ask**, in their own words: what the prototypes are for, what is decided, what is out of scope, and what a reviewer will look for. Take it as given and never quote it into the brief unedited: Its vocabulary is the developer's, and the rules below decide what reaches the builders.
- **The lenses**: one name and one paragraph each. When the ask does not supply them, propose three to five that diverge on purpose (a rules reader, a world reader, an operator, an audience, a precedent reader) and ask.
- **The deliverable kind**: a self-contained HTML page unless the ask says otherwise.

## Rules of composition

Each rule names the failure that it prevents, because the failure is what a reviewer sees first.

### The brief states; the prototype argues

Never ask a builder to pitch, sell, convince, persuade, or argue. The demonstration makes the case: a running mechanism, a scene played through the interface, a before and after. When the developer wants to be convinced, ask for the demonstration that would convince them, and cap any prose about purpose at one paragraph that describes what the tool does in one scene. Strike "the visuals must convince" and write what the visuals must do: work, be legible across a table, pass the accessibility floors.

The failure: five builders writing superlatives and refrains in a pitch-man's voice, and a reader who cannot find the work under the sales copy.

### Criteria belong to the reviewer

Write every evaluation criterion (attention cost, consequence per tap, divergence, fidelity to the rules) once, in a closing section titled "How this round is judged," in the reviewer's voice. Never place a criterion inside a section's instruction. A builder told that "the measure of each entry is cost per consequence" prices every entry in prose and explains the pricing.

### Exhibit, never describe

Where a section would "show" a view, state, or scene, require rendered states of the prototype's own interface, each with a one-line caption, and say that prose standing in for a screen is a defect. A scene walkthrough is a sequence of rendered states. A step that the prototype cannot render is a step that it has not built.

Tables are allowed, and the demo is required. A catalogue may be a table, and every row must be reachable from the running demo: tapping the thing in the demo shows the row's facts.

### Name the information, never the instrument

A noun in the brief is what the builder draws. Say what the viewer must be able to learn and at what precision, and let the builder choose the instrument: "the hour, legible across the table, to the precision that a character would have" rather than "a large clock." For an audience-facing or in-world view, state what the audience may know and what it may never see, and say that any readout more precise than the fiction allows is a defect.

### Salience is required

Require a salience order in every working view: the current state in one place, the next thing to happen louder than the rest, and every action visibly an action. Name {rulebook:accessibility-conventions} as the floor, and say that usability outranks restraint. A status that repeats on every row is a mark, a column, or a style, never a sentence.

The failure: a page in one colour, in which the operator hunts for the control, and "Hidden from the players." written out on every hidden row.

### Plain speech in the brief

The brief is documentation and the plain-speech rules apply to it. Test each sentence by asking whether a builder would reproduce the phrase: A figure is reproduced as a figure, and a loaded word (cost, price, free, cheap) is reproduced as a theme. Write the literal statement.

### Settled intent stays settled

List the decisions already taken under "Settled intent," and say that they are not for re-litigation. A builder that spends its budget re-deciding the platform or the scope delivers less of the thing that the round exists to compare.

## Structure of the brief

In this order, with these headings:

1. **Context.** The ticket, quoted. The developer's motivating picture, restated in plain speech.
2. **Settled intent.** Bullets. Each is a decision, with its reason when the reason constrains the design.
3. **Deliverable.** The file and its path per {skill:index-prototypes}; the constraints (self-contained, opens from `file://`, inline CSS and JavaScript, no framework, readable with JavaScript off, phone width); the mechanism that must run; the demo control that plays the written scene; the full-screen mode for any audience view.
4. **Sections.** Numbered, each a noun phrase plus what it contains and a length bound. None asks for persuasion; one is the scene, exhibited; one is the data-model note; one is the API list when the product has one.
5. **Quality bar.** Works, legible, accessible, with the design skill to invoke before markup and the salience order required.
6. **How this round is judged.** The criteria, in the reviewer's voice, with the divergence between lenses named as the point of the round.
7. **Rules of engagement.** Write only the one file; modify nothing in the repository; install nothing; report the path and five lines of distinctive ideas.

The lens sections follow, one per builder, in the developer's words after a plain-speech pass.

## Process

### 1. Resolve the set

Resolve the set directory per {skill:index-prototypes} step 1, and read back any verdicts from an earlier round: They say which slugs are revised (same slug, next version) and which are new.

### 2. Gather the inputs

Take the ticket and the ask. Propose lenses when the ask lacks them. Choose a slug per lens before anything is built.

### 3. Compose and check the brief

Write the brief to `{scratch}/brief.md`. Then check it against each rule above, by search as well as by reading:

- The words `pitch`, `sell`, `convince`, `persuade`, `argue`, `compelling`: none in any instruction to a builder.
- Every criterion: in "How this round is judged" and nowhere else.
- Every `show`, `display`, `present`: followed by a requirement to render.
- Every instrument noun in an audience-facing instruction (clock, gauge, meter, counter, bar): replaced by the information and its precision.
- `cost`, `price`, `free`, `cheap`, `budget`: absent, or present once in the judging section.
- Salience order and the accessibility floor: named in the quality bar.

Report what the check changed, in one line per rule that fired.

### 4. Checkpoint

Save the brief with {skill:save-artifact} as a ticket-level `brief` artifact, and show it to the developer. Posting it to the ticket is remote state and waits for their word. Ask in one action-items block: approve the brief, and post it as a ticket comment or not.

<!-- include: ../_partials/action-items.md / -->

### 5. Dispatch the builders

Send one {tool:Task} call per lens in one message, `subagent_type: general-purpose`, each with this prompt and nothing else composed into it:

```dispatch
brief: {path to the saved brief}
lens: {lens name}
slug: {slug}
version: {n}
output: {set_dir}/{slug}-v{n}.html
```

followed by:

> Read the brief in full and build the prototype for the lens named above. Write only the output file. Invoke the design skill that the brief names before writing markup. When done, reply with the file path, a short title, the lens, the inputs you drew on, a one-sentence description, and five lines of the system's distinctive ideas. Nothing else.

A builder that returns without the file, or with a file that does not open, is dispatched once more with the same block; a second failure is reported in the summary and the lens is left out of the round.

### 6. Index and compare

Continue with {skill:index-prototypes} steps 3 to 7 for the screenshots, the registrations, and the index page. Then write the comparison: where the prototypes agree, where they diverge, which ideas to carry into the design, and which decisions the round leaves open. Save it with {skill:save-artifact} as a ticket-level `comparison` artifact. Give the developer the index link and the comparison path, and nothing else.
