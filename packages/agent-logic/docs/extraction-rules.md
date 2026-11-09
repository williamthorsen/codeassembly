# Extraction rules

The rules by which a model converts an agent prompt into a draft, which `agent-logic convert` turns into an agent-logic config; `agent-logic rules` prints them. The `convert-agent-prompt` skill in [williamthorsen/codeassembly-guidance](https://github.com/williamthorsen/codeassembly-guidance) directs a harness agent to read them, and any other converter gives them to its model in full.

## What to extract

Extract the prompt's logic, then its [ambient instructions](#ambient-instructions), and record each flaw that you find while reading the prompt as a [finding](#findings):

- **States.** A step in which the agent does something or waits for the user. A state's `entry` lists the actions that the agent takes on entering it. An outcome at which the conversation ends is a `final` state; ending the conversation is what `final` means, so do not list it as an action.
- **Actions within a step.** Keep every instruction of a step as an action of its state, rather than summarize the step: a condition that changes what the agent does without changing where it goes next is an action that states its condition, such as "when the milestone has no open tickets, suggest closing it", and a prohibition that limits one step, such as "do not comment on the title's format", is an action of that step's state.
- **Transitions.** What moves the agent from one state to another. An event from the user is named `user.<what_happened>`, such as `user.gives_order_number`; another event takes another dotted lowercase prefix. A step that proceeds without waiting uses `always`. An outcome that the prompt says may happen, and that changes who acts next or where the step leads, is an event of that step's state with its own transition, beside the step's usual way out: "you may get no turn after it, because the platform reports the result" is `platform.reports_result`, named with the prefix of the actor that causes it. The prompt states the outcome, so its transition quotes that passage and is not inferred. When the prompt defines an event by a list of signs, such as "watch for these redirections", the transition quotes the passage that lists them and takes no guard.
- **Guards.** A condition that a transition requires, as `guard`: `{ "type": "nl", "params": { "text": "the code is correct" } }`, the same shape as an action. In a list of transitions for one event or for `always`, put the guarded transitions first and the unguarded fallback last: The list is evaluated in order, so its guards are alternatives: Use a list only for conditions of which at most one leads on. Conditions that can hold together, such as "after a split" and "when the remote ticket is stale", are actions of one shared state that each state their condition. A guarded transition whose alternative the prompt implies, such as staying while a step's own handling takes over or waiting for the user's reply, takes that alternative as an unguarded fallback: a transition without a target, or to the state that waits. A requirement that only orders two steps, such as "MUST have a failing test before fixing", is not a guard: The step proceeds with `always`. Neither is a condition that only restates its event, such as "a helper result has `ok: false`" on `helper.returns_failure`: Leave it out. A guarded transition of a state inside a flow needs no fallback for an event that the flow's global transition handles, because the global transition then applies. A condition on the user's reply goes on that reply's transitions, not in a separate checking state.
- **Global transitions.** A rule that applies at any point of a flow, such as "at any point, if the customer asks for a human". Group the states of that flow under a compound state, with `initial` naming its first child, and put the transition on the compound state. Create a compound state only for a global transition or an exit action that applies to more than one state. A step that the prompt exempts from the rule, such as one that continues after a failure that stops every other step, stays outside the compound state, and only that step: The step after it is inside, and the exempt step's transition targets it there. A rule that applies at any point is a global transition only of a flow that the prompt states; in a prompt that states no flow, it is a standing rule, together with any remedies that it orders, such as "try A, then B, and only then C".
- **Exit actions.** An action taken whenever the agent leaves a flow goes in the compound state's `exit`.
- **Actions without leaving.** A transition that runs actions and stays in the same state omits `target`.
- **Independent choices in one reply.** When the prompt asks the user for two or more independent choices in one reply, such as "confirm the shipping address, and choose standard or express delivery", each choice is an event of the state that waits for the reply. A choice that only runs actions, such as consenting to an update, is a transition without a target that quotes that choice and runs its actions; the choice that moves the agent takes the transitions to its targets. Never put two independent choices in one list of alternatives, and do not create a state for a choice that only runs actions. An option that does nothing, such as "leave it as it is", takes no transition. A choice in the user's reply is an event, not one of the conditions that can hold together, which are actions of a state.

Write each guard and action as a short imperative or condition in the prompt's words, with pronouns resolved: "explain that the order is outside the refund window", not "explain that it is". A message that the prompt gives the agent to present, such as a fenced template, is one action that presents it and states its content; do not recast its sentences as instructions to the agent.

### Ambient instructions

An ambient instruction holds in every state of a flow, or of the whole prompt, without moving the agent between states: persona, tone, style, and background knowledge, such as "You help customers with refund requests" or "Be warm and concise", and a standing rule that constrains every step, such as which sources the agent may use or what it may never change. List each under the `meta.ambient` of the narrowest container to which it applies, as `{ "quote": "…" }`: the compound state of the flow that it names, or the root. Do not create a compound state for an ambient instruction alone; attach it to the root when the prompt does not state its flow. A leaf state takes none: An instruction that limits one step is an action of that step's state. Quote each as an element is quoted, and list a passage under `meta.ambient` or `meta.unconverted`, never both.

### Gates

A `<HARD-GATE>` encloses an absolute instruction. Its tags mark emphasis, not a kind of element: Represent the gate where its content puts it, and add `"gate": true` to the element that quotes it.

- **A precondition on entering a step**, such as "Do NOT start this phase until the ticket has been approved", is the transition into that step. Its event or guard states the precondition, with an inferred event when the prompt states none; when the event already states it, such as `user.approves_ticket`, the transition takes no guard. The transition quotes the gate and has `meta.gate`.
- **A constraint on how a step is done**, such as "Follow the options and output format exactly", is an action of that step's state. A gated action quotes the gate in a `meta` of its own, which no other action has: `{ "type": "nl", "params": { "text": "follow the output format exactly" }, "meta": { "quote": "Follow the options and output format exactly", "gate": true } }`.
- **A standing rule**, such as a gate that holds throughout the prompt, is an ambient instruction: `{ "quote": "…", "gate": true }`.

A state is never a gate. When one gate states more than one of these, quote each part from its element. When two gates state the same precondition, the transition quotes the one at the step that it guards, and the other, which restates the precondition for the whole prompt, is a gated ambient instruction. The script reports a gate body that no quote overlaps, and a `gate` flag on a quote that overlaps no gate body. A gate inside an HTML comment is markup, not a gate.

### Quotes

Every state and transition contains `meta.quote`: a passage copied verbatim from the prompt, character for character, which must occur in the prompt exactly once.

- Quote the clause that states the element, without leading connectives such as "First,", "Then", "If", or "When": A state quotes its action from the verb ("Look up the order"), and a transition quotes its condition or event from the subject ("the order is older than 30 days"). An unguarded fallback quotes "Otherwise" when the prompt says it.
- A compound state quotes the passage that states its first global transition or, if it has none, its exit action.
- A gated action quotes the gate that it represents. No other action quotes the prompt.
- If the script reports that a quote occurs more than once, lengthen it with neighbouring words until it occurs once.
- An element that the prompt does not state, but that the logic needs, such as the user's reply that a question implies, has `meta.inferred: true` and quotes the passage from which you inferred it: the words of that passage that name this element, such as "or stop" for the state that stopping reaches, not the step before it. An event's quote names what happened and who did it.

### Passages you cannot convert

List under `meta.unconverted` each passage of logic that you cannot express as a state or transition, with a quote and a one-sentence reason, rather than guess at it. A habit with no stated trigger, such as "Mention our seasonal promotion whenever it feels natural", is one. A directive that includes a file whose content the prompt does not contain is a state whose action names the file when it stands for a step of the flow; otherwise, it is listed when it is prose and left out when it is an HTML comment. An ambient instruction is listed under `meta.ambient`, not here.

An HTML comment (`<!--` through the next `-->`) is markup, not logic: Never list one, or a passage inside one, under `meta.unconverted` or any `meta.ambient`. The script reports an entry whose quote lies inside a comment. A state may still quote an include directive written as a comment.

### Findings

A finding records a flaw that you see in the prompt's prose but that the chart's structure does not show. Never resolve a flaw silently: When the prompt leaves you to choose, chart the reading that you choose, mark the element that it needs `inferred`, and record a finding. List each finding under the `meta.findings` of the element that it concerns, or of the root when it concerns no single element, as `{ "kind": "…", "quotes": ["…"], "reason": "…" }`:

- **`contradiction`.** Two passages that cannot both hold, such as a page named as "the only source of … the verdict rule" and a verdict rule that the prompt states itself. Quote both passages.
- **`unused-input`.** An input that the prompt tells the agent to read, fetch, or receive, such as "the list of pre-approved changes", that no later step, condition, or rule uses. Put the finding on the state whose action reads the input.
- **`unhandled-case`.** A value or outcome of an input or a step that the prompt never branches on although it would change what the agent does, such as an empty change type or several pages that match a title. Put the finding on the state at which the case arises.
- **`inferred-resolution`.** A passage that admits two readings, of which you chart one. Put the finding on the inferred element that charts your reading, quote the unclear passage, and name both readings and why you chose yours in the reason.

Quote each passage verbatim, as an element is quoted; a finding may quote a passage that an element also quotes. The reason is one sentence that names the flaw and what the prompt leaves unstated. A finding is not a gap: Do not record a state without an exit, a condition without an alternative, or an unreachable state, which the viewer reports from the structure. The `convert` script reports a finding quote that lies inside an HTML comment, and an `inferred-resolution` finding that is not on an inferred element.

## Prompts outside the representation

Decide first whether the prompt is out of scope. It is when the logic that it states, once its ambient instructions and the passages that you would list under `meta.unconverted` are left out, does not contain a transition between two states: A chart of it would be one state or none. Write the draft below in its place, and do not write a logic draft:

```json
{ "outOfScope": { "reason": "The prompt states standing rules for writing code, but no steps that the agent moves between." } }
```

The reason is one sentence that names what the prompt contains and what it lacks. The `convert` script then writes no config, writes the draft to the problems file, and exits 3.

## Known limits

What a conversion under these rules does not achieve. [`corpus/scorecard.md`](../corpus/scorecard.md) names each instance in the corpus.

- **Run variance.** A conversion of a long prompt can drop or add an element that these rules already cover, such as a guarded alternative stated apart from its rule, a condition under which a step does nothing, or a wait for a reply that the prompt does not ask for. The skill's check of a draft against the prompt, and its coverage map, recover some dropped instructions but not all of them: Under the map, most converted prompts of the corpus still fail coverage, and one run per prompt cannot tell the map's effect from run variance. Another run may drop the same instruction again or a different one, so a review of the chart is what catches it.
- **Inferred events quoted by the request before them.** An inferred event, such as the user's pick or a subagent's report, often quotes the words of the agent's request that precedes it, such as "asks for the pick", although the prompt contains words that name the event. The skill's check of inferred quotes does not reliably catch it.
- **Ambient instructions quoted by their heading.** An ambient instruction quoted by the heading or opening clause of its paragraph, such as "Check the leader before rendering.", leaves the instructions after that clause off the chart, because an ambient instruction shows only its quote. Most coverage gaps in the corpus are of this kind. The coverage map's check does not catch it, because the check counts a paragraph as mapped once any quote overlaps it.
- **Execution order.** A step whose action can fail proceeds with `always`, and the failure is the event of a global transition; likewise, an outcome that the prompt says may happen is an event beside a step's `always`. Run as a machine, the `always` transition would be taken before the event arrives; the chart describes the prompt, and the viewer never runs it.
- **Independent choices that each move the agent.** When two independent choices of one reply each lead to a different step, the chart cannot hold both, because that takes parallel states, which the representation does not have. A conversion charts the choice that the prompt acts on first, and a review of the chart catches the choice that it drops.
- **Quotes from marked-up text.** A quote is verbatim, so a quote taken from a bold heading or a link either contains the markup or starts after it, and the state's id follows the quote.

## The draft

The package's `draftSchema` export, in [`src/convert/draft-schema.ts`](https://github.com/williamthorsen/codeassembly/blob/main/packages/agent-logic/src/convert/draft-schema.ts), defines the draft's shape. The draft is the config without ids or offsets: states are keyed by names that you choose, unique across the draft; `initial` names a child's key; a `target` is `#` followed by a state's key. The script writes each key as words to the state's name, which the viewer shows, and gives each state an id derived from its quote.

Key each state by a short snake_case verb phrase that names its step, such as `ask_for_the_email`. Write an acronym in capitals, such as `open_the_PR`, because the script capitalizes only the first word.

```json
{
  "initial": "ask_for_the_email",
  "states": {
    "ask_for_the_email": {
      "entry": [{ "type": "nl", "params": { "text": "ask the employee for their work email" } }],
      "on": {
        "user.gives_email": [
          {
            "target": "#send_the_code",
            "guard": { "type": "nl", "params": { "text": "the email is a work email" } },
            "meta": { "quote": "their work email", "inferred": true }
          },
          { "target": "#ask_for_the_email", "meta": { "quote": "Ask the employee for their work email", "inferred": true } }
        ]
      },
      "meta": {
        "quote": "Ask the employee for their work email",
        "findings": [
          {
            "kind": "unhandled-case",
            "quotes": ["their work email"],
            "reason": "The prompt does not say what to do when the employee has no work email."
          }
        ]
      }
    },
    "send_the_code": {
      "type": "final",
      "entry": [{ "type": "nl", "params": { "text": "send a verification code to the email" } }],
      "meta": { "quote": "send a verification code to it" }
    }
  },
  "meta": { "unconverted": [], "ambient": [{ "quote": "You reset passwords for employees." }] }
}
```
