# The title

These rules govern the text of a title: the string that an author composes for a ticket, a commit, a pull request, or a squash merge. [`title-templates.md`](./title-templates.md) states how that string is rendered on each surface.

The rules apply to both authored strings: the ticket string, which becomes the issue title, and the change string, which becomes the commit, pull-request, and squash-merge title.

- **72 characters, hard.** Count the authored string, not a rendering of it. The bound is a ceiling, not a target.
- **Imperative, task-oriented.** The verb names the task: "Add…", "Fix…", "Prevent…", "Enable…", not "Adds…". A title states the task, not the topic: "Enable playback at different speeds", not "Different playback speeds".
- **The bug-ticket exception.** A bug's ticket string states the symptom, declaratively; its change string still states the fix.
  - Ticket: Playback stutters at speeds higher than 32x
  - Change: Fix playback stutter at speeds higher than 32x
- **The subject, not the occasion.** A change string names what the diff does; a ticket string names the work wanted, or the symptom of a bug. Neither names the review, the meeting, or the conversation that raised it: never "Address review findings" or "Apply feedback".
- **Specific over categorical.** "Disambiguate phase name mismatch between agents and factory layers", not "Phase name disambiguation".
- **No ephemeral references.** The title must make sense to a reader who has only a `git log`: no ticket ID, pull-request number, review-finding ID, or run identifier. It contains no ticket reference; a template adds one to any surface that shows it.
- **No backticks.** Write an identifier bare: "Add listConsoleLines to toolbelt.vitest". In a body, backtick identifiers as usual.
- **No external actions.** A ticket updated or a notification sent belongs to neither string.
