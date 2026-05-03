# Reviewer-context lookup table

This file lists third-party packages whose API surfaces are known to surprise reviewers. When a reviewer is dispatched and the diff includes a static `import` from or `require()` of one of these packages, the orchestrator inlines the matching section into the reviewer's prompt under `## Reviewer context`. The goal is to short-circuit speculative investigation that has historically exhausted reviewer `max_turns` budgets.

## Conventions

- One `## <package-name>` heading per entry. The package name is the exact npm package identifier (for example, `@hyperjump/json-schema`).
- Section bodies are free-form markdown written for the reviewer's eyes. Keep entries short — the goal is to shortcut investigation, not to document the package.
- Section bodies must not contain any line beginning with `## ` — the parser splits on that prefix. Use `###` or higher for sub-headings inside a body.
- Entries are added as new packages cause reviewer failures. There is no schema beyond the heading convention above.

See `packages/agents/content/scripts/resolve-reviewer-context.sh` for the helper script that consumes this file, and ticket #506 for the design rationale.

## @hyperjump/json-schema

Subpath exports matter — the same identifier exists in different subpaths with different semantics:

- `FLAG` is exported from `@hyperjump/json-schema/draft-2020-12` (the dialect-specific entry point).
- `BASIC` and `DETAILED` are exported only from `@hyperjump/json-schema/experimental`. Code that imports them from `@hyperjump/json-schema` directly will fail at module load.
- Type exports follow a similar split: `SchemaObject` is the public draft-agnostic schema type; `JsonSchemaDraft202012Object` is the draft-2020-12-specific structural type. The two are not interchangeable — pick the one that matches the dialect the schema is registered under.

`registerSchema(schema, uri)` is **not idempotent** across module re-evaluations. Vitest watch mode re-imports modules between test runs, so a top-level `registerSchema` call will throw `Schema already registered: <uri>` on the second evaluation. Reviewers seeing test-flakiness reports involving this package should verify whether `registerSchema` is wrapped in a guard (`try { registerSchema(...) } catch { /* already registered */ }`) or moved into a `beforeAll` with explicit deregistration.
