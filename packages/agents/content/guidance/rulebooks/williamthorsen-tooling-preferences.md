---
slug: williamthorsen-tooling-preferences
description: William Thorsen's preferences for which command-line tool an agent reaches for, and how it invokes it.
delivery: ambient
version: 1
---

# William Thorsen's tooling preferences

Which command-line tool to reach for, and how to invoke it.

## Searching and finding files

When searching from the shell, search file contents with `rg` and find files by name with `fd`. Both are far faster than `grep` and `find`, and over a session the difference is minutes rather than milliseconds. A harness search tool that already wraps ripgrep satisfies this rule rather than competing with it.

Reach for `grep` or `find` only where the faster tool is genuinely unavailable: a machine without it, or a portable script whose consumers may not have it.
