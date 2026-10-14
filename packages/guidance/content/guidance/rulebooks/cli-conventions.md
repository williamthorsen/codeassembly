---
slug: cli-conventions
description: 'How a command-line tool talks to its user: help on every command, exit codes, error messages, progress and outcome reports, and help topics. Consult before writing or changing any command-line tool, in any language.'
delivery: skill
version: '2'
---

# CLI conventions

A CLI has two kinds of reader. A person at a terminal reads its help and its messages, and a script or an agent reads its exit code and its streams. A terminal cannot follow a link, and a script cannot read a message, so each rule below serves one of the two without breaking the other.

These rules apply whatever language the tool is written in.

## Help

- **Every command and subcommand answers `--help` and `-h`.** A subcommand prints its own help, not the top level's.
- **Help is recognized before any other parsing.** `<bin> deploy --help` prints help even when `deploy` would reject the rest of its arguments, and never fails with "Unknown option".
- **Help states** the one-line purpose, the usage synopsis, the arguments, the options, and at least one example. A tool that needs an external program names it.
- **Requested help goes to stdout and exits 0**, so that it can be piped to a pager or a search.
- **Usage printed after an error goes to stderr and exits non-zero**, so that it does not mix with the command's output.

## Exit codes

| Situation                                | Exit code |
| ---------------------------------------- | --------- |
| Success                                  | 0         |
| `--help` or `-h` (explicit help request) | 0         |
| Bad input, missing arguments             | 1         |
| Unknown command or subcommand            | 2         |
| Required external command not found      | 127       |

## Error messages

- **Errors go to stderr**, never to stdout, where they would be read as output.
- **Each error is prefixed with the program's name**, as `<bin>: message`, so that a reader of combined output can tell which program wrote it. A subcommand's errors may name the subcommand too: `<bin> deploy: message`.
- **Each error names the fix.** State what went wrong, then the command or action that resolves it. A refusal names the condition under which the command would run.

Example, for a deploy that refuses to run from a dirty checkout:

- ❌ `Error: working tree not clean`
- ✅ `<bin> deploy: the working tree has uncommitted changes; commit or stash them, then run <bin> deploy again`

## Progress and outcome

These rules apply to a command that runs for more than a moment or changes state: a deploy, an install, a migration, a sync.

- **Report each step as it completes**, one line per step, so that a reader can tell where a slow or failed run stopped.
- **End with what changed.** Name the state before and after where both exist, such as the release replaced and the release deployed. When nothing changed, say so in a line of its own; silence does not distinguish "nothing to do" from "did nothing".
- **A failure partway through names what completed and what did not**, then exits non-zero.
- **Keep the default output short.** An agent that runs the command keeps every line in its context, so per-step detail goes behind a verbose flag rather than into the default output.
- **Progress goes to stderr when stdout contains data**, so that a pipe receives the data alone.

Example, for `<bin> deploy`:

- ❌ `<bin> deploy: deployed 20261012-142530Z-a10a17e`
- ✅ One line for each step (pull, build, stage, restart, readiness check), then `<bin> deploy: replaced 20261009-091200Z-4c2e8b1 with 20261012-142530Z-a10a17e (3 commits)`

## Help topics

These rules apply to any CLI that prints a doc as a help topic, as `<bin> help <topic>`.

- **A link to another topic** prints as the command that prints that topic: `<bin> help <topic>`.
- **A link to anything else** prints as its absolute URL.
- **The source doc keeps its relative links**, so that it still works where it is read as Markdown, such as on a code host. The CLI rewrites each link when it prints the topic.
- **The topic also answers to its file stem.** When a doc's file name differs from its topic name, `<bin> help` accepts the stem of the file name as well, so that a name copied from the source still resolves.

### Example

A topic's source says "See authoring kits and the changelog", linking the first phrase to `./authoring-kits.md`, the doc of the `kits` topic, and the second to `../CHANGELOG.md`, which is not a topic. `<bin> help` prints:

- ❌ The raw Markdown, with both relative paths.
- ✅ `See authoring kits (<bin> help kits) and the changelog (https://example.com/repo/blob/main/CHANGELOG.md).`

With the stem alias, `<bin> help authoring-kits` prints the same topic as `<bin> help kits`.
