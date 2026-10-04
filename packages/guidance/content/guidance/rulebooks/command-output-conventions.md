---
slug: command-output-conventions
description: What an agent prints from a command's output, which is the fact that the step needs, decided before the command runs.
delivery: ambient
version: '1'
---

# Command output conventions

Output that a command prints into the conversation stays in the context window for the rest of the session. Before running a command whose output is large or repeats across iterations, name the fact that the step needs from it, and print only that fact.

- Filter, count, or diff inside the command, rather than printing everything and reading it.
- When an evaluation repeats across iterations, such as scoring each reply against an answer key, write a small scorer once and print one line per case: the verdict, what is missing, and what is extra.
- Open detail only for a failing case, and only the part that explains the failure.
