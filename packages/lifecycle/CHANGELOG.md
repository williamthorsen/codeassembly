# Changelog

All notable changes to this project will be documented in this file.

## 0.4.1 — 2026-08-20

### ⚙️ Tooling

- Activate import/extensions so a .js specifier naming a .ts file fails lint (#1311)

  Adds `eslint-import-resolver-typescript` and wires it into the repo-root ESLint config, so `import/extensions` now reports a relative `.js` specifier that names a `.ts` file, dynamic `import()` included. `packages/factory` is currently exempt.

  Separately, every package's `eslint.config.ts` now extends the repo-root config instead of importing `@williamthorsen/eslint-config-typescript` directly. That inheritance is what carries the resolver into a per-workspace lint run, and a guard fails when a package config bypasses the root.

## 0.4.0 — 2026-08-13

### 🎉 Features

- Attach causes to kb's loader errors and retire its lint deferral (#1272)

  Errors `kb` raises on malformed input now carry the underlying parse error as their cause. Callers constructing one of these errors themselves can attach a cause. When `kb` reports a thrown error that carries no message, the diagnostic now names the error's class instead of trailing off empty.

### ♻️ Refactoring

- Fix lint and retire rule deferrals (#1265)

  Fixes deferred lint violations in the `lifecycle`, `run-core`, and `foreman` packages and removes the cap on the severity of associated rules when a strict-lint check is run.

### ⚙️ Tooling

- Remove shelled nmr calls from package manifests (#1291)

  `nmr build` no longer reaches nmr through a shell, so a failing package build reports the step that failed instead of the whole nested subtree, and interrupting a run stops what would have followed. Five packages had a `build` override doing that: `kb`, `lifecycle`, `mcp`, and `run-core` restated a default nmr already supplies and now resolve `build` to its built-in `['compile']`, and `codeassembly`'s two post-compile steps move into its `build:post` hook. The warning nmr printed for each, five on every build, goes with them.

  A root test keeps the pattern out: It fails when any manifest in the repo, the monorepo root's included, declares a script reaching `nmr`. It catches the forms nmr's own warning misses, `npx nmr` and `pnpm --recursive exec nmr` among them, and exempts the npm lifecycle names along with root's `bootstrap`.

- Upgrade eslint-config-typescript to 10 and complete manifest metadata (#1301)

  Upgrades `@williamthorsen/eslint-config-typescript` to v10 and adds missing `package.json` values required by rules activated in the upgrade.

  `codeassembly`'s empty `exports` had been the declaration that the package has no library surface. This has been changed to `{"./package.json": "./package.json"}`, which complies with the new rules without exposing an importable module.

## 0.3.0 — 2026-08-07

### 🎉 Features

- 🚨 **Breaking:** Rename the harness id to rovo and qualify the frontmatter key (#1199)

  Renames the internal ID for the Rovo Dev harness from `rovodev` to `rovo`. `--harness rovo` replaces `--harness rovodev` in every command.

  Separately, renames the `harnesses` frontmatter key (which narrows a skill to particular harnesses) to `supported-harnesses:` to avoid confusion.

## 0.2.1 — 2026-08-05

### 🧪 Tests

- Name every test file's isolation tier (#1185)

  Every test file now embeds the name of its tier (unit or tool), each of which can be run separately (`nmr test:unit` or `nmr test:tool`). Git isolation settings that had previously been removed from the root-level test configurations are now restored.

## 0.2.0 — 2026-08-04

### 🎉 Features

- Bound fold memory and rescan cost with a retention window (#1057)

  Defines a retention window so that a Fleet server run against a long-lived events root no longer grows without bound. A branch that stays idle past the retention window (three days by default) is now dropped from the fleet, so the server's memory footprint and per-rescan filesystem cost only track currently-active work. A dropped branch reappears if it becomes active again.

- Add the read-only git adapter for worktree and base-branch ground truth (#1059)

  Fleet's lane view now reflects each worktree's real git state (the checked-out branch, the number of uncommitted files, and how far ahead or behind the base branch it sits), refreshed on a configurable interval. A lane whose worktree has been deleted now closes on its own, instead of lingering indefinitely.

- Make codeassembly and kb CLI tools publishable (#1164)

  The `codeassembly` CLI now installs from npm, and its `install` and `sync` commands deploy the rulebooks, skills, and subagents it ships into any consuming project. The knowledge-base library `@williamthorsen/kb` and the session-lifecycle event package `codeassembly-lifecycle` are published alongside it.

### 🏗️ Internal features

- Add lifecycle workspace with the canonical envelope, vocabulary & lane fold (#1049)

  Introduces `@codeassembly/lifecycle`, a shared workspace package that houses the canonical lifecycle-event envelope, the event vocabulary, and the fold that turns a lane's events into session and lane state. The package is dependency-free and browser-bundle-safe.

### ♻️ Refactoring

- Rename packages to publishable names (#1157)

  Renames CodeAssembly packages in preparation for their initial publication. The package responsible for deploying and syncing agent guidance is now called `codeassembly`.

### ⚙️ Tooling

- Move compilation out of the install lifecycle into a bootstrap step (#1102)

  Fixes an issue where installation of dependencies failed intermittently. Reaching a usable tree afterward now takes one command, `pnpm run bootstrap`, and every workflow that needs a built tree runs it. A command-line tool invoked before bootstrapping now points to a command that exists.

- Migrate Vitest to nmr's centralized model (#1154)

  Changes Vitest configuration so that test suites are selected by project ("unit", "integration", and "app"), eliminating the need for category-specific configuration files. Every package keeps a single Vitest config file, which composes the repo's shared settings rather than carrying its own copy. The nmr fmt command now formats shell scripts as well, and the corresponding package-file scripts have been removed as redundant.

- Run every test in the default gate, classified by what it reaches (#1155)

  Upgrades `nmr` to 0.24, which changes Vitest configuration so that test suites are selected by a tier ("unit", "tool", "localhost", and "remote") corresponding to the services they use. `nmr test:unit` and `nmr test:tool` each run one of these; `nmr test:all` runs every suite. All tests are covered by the default run. `nmr test:integration` no longer exists, and no tests carry the `.int.` infix. The upgraded `nmr` includes a caching feature that skips checks that already succeeded against an identical working tree.

<!-- Generated by release-kit. Do not edit this file. Use .meta/changelog-overrides.json to override entries. -->
