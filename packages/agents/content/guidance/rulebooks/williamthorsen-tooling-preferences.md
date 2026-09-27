---
slug: williamthorsen-tooling-preferences
description: William Thorsen's preferences for which command-line tool an agent reaches for, how it invokes it, and how it obtains a tool or resource that is missing.
delivery: ambient
version: '1'
---

# William Thorsen's tooling preferences

Which command-line tool to reach for, how to invoke it, and how to obtain one that is missing.

## Searching and finding files

When searching from the shell, search file contents with `rg` and find files by name with `fd`. Both are far faster than `grep` and `find`, and over a session the difference is minutes rather than milliseconds. A harness search tool that already wraps ripgrep satisfies this rule rather than conflicting with it.

Reach for `grep` or `find` only when the faster tool is genuinely unavailable: on a machine without it, or in a portable script whose consumers may not have it.

## Missing tools and resources

Before reporting a tool, dependency, or service as missing, exhaust the routes that need no action from the developer:

- Run the tool through an ephemeral runner, such as `pnpm dlx`, `npx`, `uvx`, or `go run`.
- Use a copy already present in the project, or an equivalent tool.
- Redirect a cache or temporary path out of a denied location.
- Call the service's API when the CLI is only a wrapper over it.
- Start a stopped service that the project defines, through its compose stack or its start script.

A registry fetch that the sandbox allows is within what the task was given. A fetch that the sandbox denies is not a route: Ask for the resource instead.

Ask for the resource when none of those routes works, when the missing resource is a credential or access, or when the stopped service is one that the project does not define. Name the resource and the command that will run once it arrives, and keep the task: Never restate the task as an action item for the developer. A credential or access is given when the task's plan or the developer names the command that reads it. Never seek any other credential or access: It belongs to the developer.

This rule runs before any fallback that a skill names for an unavailable tool. A skill's "unavailable" means unavailable once these routes are exhausted, and the skill's fallback applies from that point.

The rule licenses no write. Acquiring a resource in a way that mutates shared state, such as installing a tool globally, restarting a service that the project does not define, minting a credential, or widening a sandbox grant, still needs the developer's authorization, and the ask is how to obtain it.

Where a `sandbox-conventions` rulebook is deployed, consult it first for a denial that misreports itself as a missing resource.
