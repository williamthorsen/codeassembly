---
name: refine-prototype
description: Refine one prototype page at sketch speed, between the verdict on a round and the end vision, or sketch a variant of a built product the same way. Transfers the kept and adapted ideas of the round to the base, applies the developer's commands in batches while the page reloads in their browser, snapshots each accepted version into the ticket's prototype set with its id on the page, and records every accepted change in a refinement log that the end vision reads. Use when the developer wants to refine, combine, or vary prototypes before a ticket is written.
user-invocable: true
supported-harnesses: [claude]
---

# Refine prototype

Work one prototype page the way a designer works a sketch: The developer gives commands, you apply them to the page, their browser shows the result, and nothing else runs. The development gates are off on purpose. A sketch is the reference for the ticket that follows, never the implementation, and it is fast because it skips what a change to the product needs.

The page is in the ticket's prototype set, per {skill:index-prototypes}, and each snapshot adds the accepted version to the set under its id: The snapshot replaces the slug's card on the index under the new id, and the manifest and the refinement log keep the earlier versions.

## Inputs

- **The set**: its manifest and verdicts, the latest `idea-decisions` artifact in the ticket directory, and any `refinement-log` artifact there.
- **The base**: the prototype that the developer names by its number, or the winner when they name none. When the base is a built product rather than a page, the base is one region of it, reconstructed as a page from a screenshot and the design doc. It takes a new slug, and its band and description name what it was built from.
- **The developer's commands**, in their words: "Move the rail under the matrix", "Tighten the row spacing", "Split Start from into two tabs", "Take the scope text area from 4".

## Rules of the sketch

Off:

- Tests, lint, formatters, type checks, and every `nmr` command.
- Commits, branches, and edits to the ticket, the design doc, or any file outside the set directory, the scratch directory, and the artifact directory.
- The brainstorming, planning, test-driven, review, and verification skills. A sketch does not have a plan or a review.
- Questions that a render answers. When a command admits two renderings, render both and let the developer pick.

On:

- The page is self-contained and opens from `file://`, with its demo chrome in a band whose every part is inside an element that has `data-demo`, as the brief that built it required.
- The band's first line is the page's id and title, `{number}.{version} {title}`, so that the developer reads which version they have open without returning to the index.
- {rulebook:accessibility-conventions} is the floor: Check contrast and size when a command changes a colour or a text size.
- A new string on the product surface follows {rulebook:ui-copy-conventions}.
- One working file. A batch edits it in place; a fork is written next to it and is deleted once the developer picks.

## Process

### 1. Resolve the set and the base

Resolve the set directory and the scratch directory per {skill:index-prototypes} step 1, read back the verdicts per its "Read back the verdicts", and read the latest `idea-decisions` and `refinement-log` artifacts in the ticket directory. Name the base to the developer as `{id} {title}`.

A refinement keeps the base's slug, and its first snapshot takes the slug's next version. Resolve the id before the first edit:

```bash
node {harness_home_dir}/skills/index-prototypes/index-prototypes.mjs resolve-ids \
  --set-dir "{set_dir}" \
  --slugs {slug}
```

Copy the base's latest source to `{scratch_dir}/{slug}-v{n}.html`, the working file, and set the band's first line to the new id. A base reconstructed from a built product takes a new slug and starts at version 1, and its band's first line names the source after the id, such as `6.1 Start from as tabs, from the api-tokens page`.

### 2. Serve the working file

Start a reloading server on the scratch directory in the background, and give the developer the working file's URL once:

```bash
pnpm dlx vite --host 127.0.0.1 "{scratch_dir}"
```

Read the host and port from the server's `Local:` line; when `pnpm` is absent, run `npx --yes vite` the same way. The developer keeps `{local_url}/{slug}-v{n}.html` open, and the server reloads it on every save. Capture screenshots from the same server with the Playwright MCP, per {skill:index-prototypes} step 3, at width 1280 and at width 390.

### 3. Propose the transplants

The verdict picked the base; it did not pick the base's ideas over the others. From the `idea-decisions` table, list every row whose decision is `keep` and whose sources do not include the base, and every row whose decision is `adapt`, and propose them as the first batch in one action-items block, ordered so that a structural change comes before the changes that depend on it. The developer trims or reorders the list.

A transplant moves the mechanism, not the look: Read the source prototype's file, and copy the markup, the styles, and the script that make the idea work, fitted to the base. Rebuilding an idea from its screenshot is a defect, because a screenshot does not show what the mechanism does.

<!-- include: ../_partials/action-items.md / -->

### 4. Apply the batches

Each turn, take every command in the developer's message as one batch:

1. Apply every command to the working file.
2. Take the screenshots, and look at them before replying. An overlap, a cut-off, text under the size floor, or a contrast failure that a command caused is reported with the batch, not left for the developer to find.
3. For a command that admits two renderings, write each as `{scratch_dir}/{slug}-v{n}-{letter}.html`, screenshot both, and leave the working file as it was before that command. The developer picks by letter; the next batch applies the pick and deletes the forks.
4. Append each applied command to the session's log, under the id of the version that it will enter, with the developer's reason when they gave one and the source id when it was a transplant.
5. Reply with one line per command (applied, forked with its letters and their URLs, or refused with the reason), and nothing else. The developer looks at the browser, not at a description of it.

Propose a new number when a batch replaces the layout or the model to the point that the earlier version's verdicts and notes no longer describe the page. On yes, the working file takes a new slug and the id that `resolve-ids` gives it, and its band names the version from which it came. The old slug keeps its last snapshot.

### 5. Snapshot

Snapshot when the developer asks for one, in any words ("snapshot", "keep this", "version it"), and at the end of the session before stopping. A snapshot creates a version: Until then the working file is unregistered, and a session that stops without one loses the work since the last.

1. Copy the working file to `{set_dir}/{slug}-v{n}.html`.
2. Publish it with the Artifact tool: to the slug's existing artifact URL when the manifest's latest entry for the slug has one, so that the index card's link stays current, or as a new artifact for a new slug.
3. Capture its screenshots per {skill:index-prototypes} step 3, and register it per its step 4 with `--number {number}`, `--source`, the set's note labels (copied from the latest entry, with any change that the batches made to them), and, for a new slug, a `--description` that names the version from which it came.
4. Update the set's summary per {skill:index-prototypes} step 5, naming the version in `changes`, then render and republish the index per its step 6.
5. The next batch opens the next version: Copy the snapshot to `{scratch_dir}/{slug}-v{n+1}.html` and set the band's id.

### 6. Close

When the developer says that the refinement is done:

1. Snapshot whatever has changed since the last one.
2. When the ticket or the design doc names a component library, dispatch one reader with {tool:Task} (`subagent_type: general-purpose`, model `sonnet`) to list every element of the final page that the library does not supply, each with the nearest thing that the library has. The decisions on those belong to the end vision, not to this skill.
3. Save the log per [The refinement log](#the-refinement-log).
4. Stop the server, and give the developer the index link, the final id, and the log's path.

The end vision writes the design doc from the log and the `idea-decisions` artifact. This skill edits neither.

## The refinement log

Save it with {skill:save-artifact} as a ticket-level `refinement-log` artifact:

- `## Base`: the base's id and title, and the index URL.
- `## Snapshots`: one `### {id}` per snapshot in order, each listing its accepted changes, one line per change, with the developer's reason when they gave one and `from {id}` on a transplant.
- `## Open forks`: forks shown and not picked, each with its letters and what differed.
- `## Library check`: the reader's list from step 6, when it ran.

A later session starts a new log from the latest snapshot; it does not edit this one.
