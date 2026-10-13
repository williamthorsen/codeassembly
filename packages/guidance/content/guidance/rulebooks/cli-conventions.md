---
slug: cli-conventions
description: How a command-line tool presents its help output, starting with the docs that it prints as help topics. Consult before writing or changing a CLI's help output or the docs that it serves as help topics.
delivery: skill
version: '1'
---

# CLI conventions

The reader of a CLI's output is at a terminal. A terminal cannot follow a link, so whatever the output points to must be something that the reader can type or open from there.

## Help topics

These rules apply to any CLI that prints a doc as a help topic, as `<bin> help <topic>`.

- **A link to another topic** prints as the command that prints that topic: `<bin> help <topic>`.
- **A link to anything else** prints as its absolute URL.
- **The source doc keeps its relative links**, so that it still works where it is read as Markdown, such as on a code host. The CLI rewrites each link when it prints the topic.
- **The topic also answers to its file stem.** When a doc's file name differs from its topic name, `<bin> help` accepts the stem of the file name as well, so that a name copied from the source still resolves.

## Example

A topic's source says "See authoring kits and the changelog", linking the first phrase to `./authoring-kits.md`, the doc of the `kits` topic, and the second to `../CHANGELOG.md`, which is not a topic. `<bin> help` prints:

- ❌ The raw Markdown, with both relative paths.
- ✅ `See authoring kits (<bin> help kits) and the changelog (https://example.com/repo/blob/main/CHANGELOG.md).`

With the stem alias, `<bin> help authoring-kits` prints the same topic as `<bin> help kits`.
