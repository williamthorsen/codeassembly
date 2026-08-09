---
slug: williamthorsen-tooling-preferences
description: William Thorsen's preferences for which command-line tool an agent reaches for, and how it invokes it.
delivery: ambient
version: 1
---

# William Thorsen's tooling preferences

Which command-line tool to reach for, and how to invoke it.

## Searching and finding files

Search file contents with `rg` and find files by name with `fd`. Both are far faster than `grep` and `find`, and over a session the difference is minutes rather than milliseconds.

Reach for `grep` or `find` only where the faster tool is genuinely unavailable: a machine without it, or a portable script whose consumers may not have it.
