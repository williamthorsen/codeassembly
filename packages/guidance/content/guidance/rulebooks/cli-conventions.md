---
slug: cli-conventions
description: 'How a command-line tool talks to its user: subcommands and options, standard option names, configuration, writing modes, help on every command, exit codes, error messages, JSON output, progress and outcome reports, color, the split of logic from presentation, and help topics. Consult before writing or changing any command-line tool, in any language.'
delivery: skill
version: '4'
---

# CLI conventions

A CLI has two kinds of reader. A person at a terminal reads its help and its messages, and a script or an agent reads its exit code and its streams. A terminal cannot follow a link, and a script cannot read a message, so each rule below serves one of the two without breaking the other.

These rules apply whatever language the tool is written in.

## Subcommand names

- **A subcommand that acts names its action and its object**, so that a reader of the bare command line can tell what it does. The object may be left out when the tool acts on only one, as in `<bin> deploy`.
- **A flat verb-object name fits while the object has one action**: `<bin> show-instance-page`. **A noun group with verb subcommands fits once the object has several**: `<bin> instance-page show`, `<bin> instance-page reload`.
- **An existing name that breaks these rules is not precedent for a new one.**

Example, for a subcommand that prints the page of the running instance:

- ❌ `<bin> page`
- ✅ `<bin> show-instance-page`, which becomes `<bin> instance-page show` once the instance page has a second action

## Subcommands and options

- **An action is a subcommand, and an option changes how an action runs.** A reader scans the subcommands to learn what a tool can do, and scans one subcommand's options to learn how to adjust it.
- **Flags that select different actions are subcommands.** A set of mutually exclusive flags, each of which makes the command do something different, hides the tool's actions among its options and leaves a reader to discover which flags cannot be combined.

Example, for a tool that either verifies a file against its template or creates it:

- ❌ `<bin> --verify`, `<bin> --create`
- ✅ `<bin> verify-file`, `<bin> create-file`

## Standard option names

These options mean the same thing in every tool, so that a reader who knows one tool can guess them in another, and a script that passes one does not get a different behavior. A tool that offers the behavior uses the name, and a tool does not use any of these names, long or short, for anything else.

| Option            | Meaning                                                           |
| ----------------- | ----------------------------------------------------------------- |
| `-h`, `--help`    | Print help and exit 0                                             |
| `-V`, `--version` | Print the version and exit 0                                      |
| `-c`, `--config`  | Read configuration from the file at this path                     |
| `-n`, `--dry-run` | Report what a command that writes would change, and write nothing |
| `-f`, `--force`   | Proceed past a safety check or a confirmation                     |
| `-q`, `--quiet`   | Print less: verdicts and errors only                              |
| `-v`, `--verbose` | Print more: per-step detail                                       |
| `--json`          | Print the result as JSON on stdout                                |
| `--write`         | Let a command that reports by default write its changes           |
| `--no-color`      | Turn off color and other terminal styling                         |

Every tool responds to `--version`, so that a bug report can name the version that produced it.

Example, for a tool that reads its input from a file:

- ❌ `<bin> -f input.json`, with `-f` meaning `--file`
- ✅ `<bin> --file input.json`, which leaves `-f` to mean `--force`

## Configuration

- **A tool that reads a config file accepts `--config <path>`, short `-c`.** A relative path resolves against the working directory, as every other path argument does.
- **A setting resolves in the order flag, environment variable, config file, built-in default.** The value given closest to the invocation wins, so that one run can override a project's setting without editing the file.
- **A path given to `--config` that does not exist is an error.** Falling back to defaults would run the command with settings that the caller did not ask for. A config file that the tool looks up by itself may be absent; then the defaults apply.

Example, for `<bin> --config ./ci.yaml` run in a directory that does not contain `ci.yaml`:

- ❌ The command runs with the built-in defaults and reports success.
- ✅ `<bin>: --config ./ci.yaml: file not found` on stderr, with exit 2

## Writing modes

A command's default follows its purpose.

- **A command whose purpose is a change writes by default** and offers `--dry-run`, which reports what it would change and writes nothing. A deploy, an install, and a migration are such commands.
- **A command whose main use is reporting reports by default** and writes only under `--write`. A check, a scan, and a formatter are such commands. Its report says what `--write` would change, so that the reader knows the next step.

Example, for a formatter run without `--write` on files that need changes:

- ❌ `<bin>: 3 files need formatting`
- ✅ `<bin>: 3 files need formatting; run <bin> --write to format them`

## Help

- **Every command and subcommand responds to `--help` and `-h`.** A subcommand prints its own help, not the top level's.
- **`--help` is an option of every command, and it is handled before arguments are validated.** `<bin> deploy --help` prints the help of `deploy`, never "Unknown option", and prints it even when a required argument of `deploy` is missing.
- **Help states** the one-line purpose, the usage synopsis, the arguments, the options, and at least one example. A tool that needs an external program names it.
- **Requested help goes to stdout and exits 0**, so that it can be piped to a pager or a search.
- **Usage printed after an error goes to stderr and exits non-zero**, so that it does not mix with the command's output.

## Exit codes

| Situation                                                                | Exit code |
| ------------------------------------------------------------------------ | --------- |
| Success                                                                  | 0         |
| `--help`, `-h`, `--version`, or `-V`                                     | 0         |
| A check that ran and found problems                                      | 1         |
| Any other failure while running                                          | 1         |
| Usage error: bad input, a missing argument, an unknown command or option | 2         |
| Required external command not found                                      | 127       |

A usage error exits 2 so that a script that runs a check can tell the problems that the check found from a mistake in its own invocation.

## Error messages

- **Errors go to stderr**, never to stdout, where they would be read as output.
- **Each error is prefixed with the program's name**, as `<bin>: message`, so that a reader of combined output can tell which program wrote it. A subcommand's errors may name the subcommand too: `<bin> deploy: message`.
- **Each error names the fix.** State what went wrong, then the command or action that resolves it. A refusal names the condition under which the command would run.
- **An unknown command or option suggests the nearest valid name**, so that a typo costs one more run rather than a trip to the help.
- **An invalid value lists the accepted values.** A tool rejects a value that it does not accept, from a flag or from an environment variable, rather than silently falling back to a default.
- **A secret is never taken as an argument**, because shell history and the process list expose arguments. A secret comes from stdin, a prompt, or a file.

Example, for a deploy that refuses to run from a dirty checkout:

- ❌ `Error: working tree not clean`
- ✅ `<bin> deploy: the working tree has uncommitted changes; commit or stash them, then run <bin> deploy again`

Example, for an invalid value:

- ❌ `<bin>: invalid --format`
- ✅ `<bin>: --format accepts text or json, not yaml`

Example, for a command that needs an access token:

- ❌ `<bin> publish --token <value>`
- ✅ `<bin> publish --token-file <path>`, or the token piped to `<bin> publish --token-stdin`

## JSON output

- **A command whose output a script or an agent may read supports `--json`.** Parsing text written for a person breaks when its wording changes.
- **Under `--json`, stdout contains one JSON document and nothing else.** A command that streams records as it finds them writes JSON Lines instead, one object per line.
- **Progress, warnings, and errors still go to stderr in their usual form, and the exit code keeps its meaning.** A failure is not wrapped in a JSON envelope that exits 0, because a caller that checks the exit code would read it as success.
- **A published field is part of the tool's interface.** Adding a field is safe; renaming, retyping, or removing one is a breaking change.

Example, for a check that found problems, run with `--json`:

- ❌ `{"ok":false,"problems":[...]}` with exit 0
- ✅ `{"problems":[...]}` on stdout with exit 1

## Progress and outcome

These rules apply to a command that runs for more than a moment or changes state: a deploy, an install, a migration, a sync.

- **Report each step as it completes**, one line per step, so that a reader can tell where a slow or failed run stopped.
- **End with what changed.** Name the state before and after when both exist, such as the release replaced and the release deployed. When nothing changed, say so in a line of its own; silence does not distinguish "nothing to do" from "did nothing".
- **A failure partway through names what completed and what did not**, then exits non-zero.
- **Keep the default output short.** An agent that runs the command keeps every line in its context, so put per-step detail behind a verbose flag rather than in the default output.
- **Progress goes to stderr when stdout contains data**, so that a pipe receives the data alone.

Example, for `<bin> deploy`:

- ❌ `<bin> deploy: deployed 20261012-142530Z-a10a17e`
- ✅ One line for each step (pull, build, stage, restart, readiness check), then `<bin> deploy: replaced 20261009-091200Z-4c2e8b1 with 20261012-142530Z-a10a17e (3 commits)`

## Check results

These rules apply to a command that checks state without changing it: a `check` or `verify` mode, a health probe, a pre-flight.

- **Each item's line states what it checked and the state that it found**, on a pass as well as on a failure. A bare `PASS` does not say what was compared with what, so a reader cannot tell a check that verified something from one that compared nothing.
- **A failure shows its evidence in the default output**: a diff for a file compared with its definition, the actual state otherwise. A reader who sees only the verdict must run the check again, or reproduce it by hand, to learn what is wrong.
- **A check whose items read only configuration also probes the function that the configuration serves, end to end.** Configuration that matches its definition does not show that the service works: A resolver can match its config file and still fail to answer a query.
- **`--verbose` adds only detail too long to print on every run.** The per-item lines and a failure's evidence belong in the default output. The exit code stays the contract for scripts, as "Exit codes" states.

Example, for `<bin> check` on a host whose hosts file matches its definition and whose resolver config does not:

- ❌ `PASS hosts`, then `FAIL resolver`
- ✅ `PASS hosts: /etc/hosts matches hosts.conf`, then `FAIL resolver: /etc/resolv.conf differs from resolver.conf`, followed by the diff

## Color

- **Color and other terminal styling appear only when the stream is a terminal.** Escape codes written to a file or a pipe corrupt the text that the reader receives.
- **A set `NO_COLOR` environment variable, or `--no-color`, turns styling off** even on a terminal.

Example, for `<bin> list > list.txt`:

- ❌ `list.txt` contains `\e[32mok\e[0m deploy`
- ✅ `list.txt` contains `ok deploy`

## Logic and presentation

- **A command's logic returns a result value.** It does not write to a stream, and it does not exit.
- **A renderer turns the result into output.** The text renderer and the JSON renderer read the same result, so the two outputs cannot disagree, and each can be tested without running the command.
- **Only the entry point writes to stdout and stderr and sets the exit code.**
- **A library module never prints.** It returns what it found, such as a warning or a fallback that it took, and its caller decides whether and how to report it. A library that prints takes that decision from every caller, including one that runs under `--json` or `--quiet`.

Example, for a library function that finds an invalid state file and falls back to an empty one:

- ❌ The function prints "existing state is invalid and will be reset", even when its caller is a dry run that resets nothing.
- ✅ The function returns the empty state with a flag that records the fallback, and each caller reports it in its own terms.

## Help topics

These rules apply to any CLI that prints a doc as a help topic, as `<bin> help <topic>`.

- **A link to another topic** prints as the command that prints that topic: `<bin> help <topic>`.
- **A link to anything else** prints as its absolute URL.
- **The source doc keeps its relative links**, so that it still works where it is read as Markdown, such as on a code host. The CLI rewrites each link when it prints the topic.
- **The file stem also names the topic.** When a doc's file name differs from its topic name, `<bin> help` accepts the stem of the file name as well, so that a name copied from the source still resolves.

### Example

A topic's source says "See authoring kits and the changelog", linking the first phrase to `./authoring-kits.md`, the doc of the `kits` topic, and the second to `../CHANGELOG.md`, which is not a topic. `<bin> help` prints:

- ❌ The raw Markdown, with both relative paths.
- ✅ `See authoring kits (<bin> help kits) and the changelog (https://example.com/repo/blob/main/CHANGELOG.md).`

With the stem alias, `<bin> help authoring-kits` prints the same topic as `<bin> help kits`.
