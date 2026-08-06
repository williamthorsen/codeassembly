# codeassembly

A CLI that installs reusable AI agent guidance into coding-harness directories, and the library of rulebooks, skills, and subagents it deploys.

<!-- section:release-notes --><!-- /section:release-notes -->

## Installation

No install needed to try it:

```bash
npx codeassembly install
npx codeassembly sync
```

Add it to a project when the repo ships guidance of its own, or wants `sync` to run from a script:

```bash
pnpm add --save-dev codeassembly
```

`install` deploys the built-in library into your harness directories. `sync` resolves `.agents/codeassembly.yaml` and materializes exactly what the project declares, including guidance shipped by its dependencies (see [Packages](#packages)).

Supported harnesses are Claude Code and Rovo Dev; `--harness` narrows a run to one.

## Commands

Run via the `codeassembly` CLI: `codeassembly <command> [options]`.

| Command             | Description                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `install`           | Install shared guidance, scripts, and support data into harness directories                                |
| `init`              | Scaffold `.agents/codeassembly.yaml` for the project, or `--global` for `~/.agents/codeassembly.yaml`      |
| `sync`              | Resolve `.agents/codeassembly.yaml` and materialize declared rulebooks, skills, subagents, and collections |
| `uninstall`         | Remove installed guidance, skills, and subagents                                                           |
| `status`            | Show the current state of installed items                                                                  |
| `validate`          | Check a content root for defects that reach a consumer; writes nothing                                     |
| `library list`      | List available library artifacts (rulebooks, skills, subagents, collections)                               |
| `generate <target>` | Generate a configuration file (e.g., `label-map`)                                                          |

Global options: `--harness <claude\|rovo\|all>` (default `all`), `--link`, `--force`, `--dry-run`, and `--help`. `--content <dir>` applies to `validate` alone. Run `codeassembly --help` for the authoritative list.

## Session-lifecycle hooks

Skills report the work they do, but they cannot report a session opening, exiting, or handing a turn back to you — at those moments no skill is running. Each harness reports them instead, through its own event hooks, and `relay-hook-event.mjs` turns a hook into a lifecycle event:

| Event             | Claude Code        | Rovo Dev           |
| ----------------- | ------------------ | ------------------ |
| `session.started` | `SessionStart`     | `on_session_start` |
| `session.ended`   | `SessionEnd`       | `on_session_end`   |
| `turn.started`    | `UserPromptSubmit` | `on_user_prompt`   |
| `turn.completed`  | `Stop`             | `on_complete`      |

`install` places the relay in each harness's `scripts/` directory and then wires the entries below into the harness config (`~/.claude/settings.json`, `~/.rovodev/config.yml`) by default. The wiring is its own step, shared across the CLI:

- `install --skip-hooks` installs everything else and leaves the configs untouched.
- `codeassembly configure-hooks` runs just the wiring, for re-applying it later.
- `configure-hooks --print` prints the entries without writing anything — the manual-adoption path for a config you manage elsewhere. The snippets below are exactly what it emits.
- `uninstall` removes the entries; `status` reports each one as present, drifted, or absent.

Every managed command ends in `--sentinel codeassembly-agents`. That token is the ownership marker: The CLI creates, replaces, and removes only entries whose command carries it, so your own hooks and other tools' entries are never disturbed. The relay accepts the flag and ignores it.

The relay reports a boundary and nothing more. It never carries your prompt text, and it always exits 0 — a relay that failed loudly would be worse than the missing event, since both harnesses read some non-zero hook exits as a signal to block the agent.

### Claude Code

In `~/.claude/settings.json`, under `hooks`. Each entry names the hook it relays, so the relay never has to infer where it was called from:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ~/.claude/scripts/relay-hook-event.mjs --harness claude --hook SessionStart --sentinel codeassembly-agents"
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ~/.claude/scripts/relay-hook-event.mjs --harness claude --hook SessionEnd --sentinel codeassembly-agents"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ~/.claude/scripts/relay-hook-event.mjs --harness claude --hook UserPromptSubmit --sentinel codeassembly-agents"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ~/.claude/scripts/relay-hook-event.mjs --harness claude --hook Stop --sentinel codeassembly-agents"
          }
        ]
      }
    ]
  }
}
```

Omit `matcher` on all four. `SessionStart` and `SessionEnd` accept one to select a start source or an end reason, and leaving it out is what relays every one of them; `UserPromptSubmit` and `Stop` ignore it.

Keep the whole invocation in `command` rather than splitting the flags into an `args` array: `~` expands only in the single-string form.

### Rovo Dev

In `~/.rovodev/config.yml`, under `eventHooks`:

```yaml
eventHooks:
  events:
    - name: on_session_start
      commands:
        - command: node /Users/you/.rovodev/scripts/relay-hook-event.mjs --harness rovo --hook on_session_start --sentinel codeassembly-agents
    - name: on_session_end
      commands:
        - command: node /Users/you/.rovodev/scripts/relay-hook-event.mjs --harness rovo --hook on_session_end --sentinel codeassembly-agents
    - name: on_user_prompt
      commands:
        - command: node /Users/you/.rovodev/scripts/relay-hook-event.mjs --harness rovo --hook on_user_prompt --sentinel codeassembly-agents
    - name: on_complete
      commands:
        - command: node /Users/you/.rovodev/scripts/relay-hook-event.mjs --harness rovo --hook on_complete --sentinel codeassembly-agents
```

Write your home directory out in full where the snippet shows `/Users/you`: `configure-hooks` writes your machine's absolute path here, matching the entries Rovo's own tooling generates.

Two things to know about Rovo:

- **Restart to pick up the change.** Rovo reads its config at startup, so a running session ignores hooks added under it.
- **`on_complete` fires when a run completes successfully.** A turn that errors or is aborted may not report its end, leaving that session reading as still working until its next event.

## Project declaration

A project opts into shared artifacts through `.agents/codeassembly.yaml`. Run `codeassembly init` to scaffold one, declare the artifacts you want, then run `codeassembly sync` to materialize them. The same declaration format resolves in two independent domains — the repo (via `sync`) and the user-global home (via `sync --global`). For the home domain, `codeassembly init --global` scaffolds `~/.agents/codeassembly.yaml`, seeded with the `all` collection. See [Scopes](#scopes).

Authoring conventions for the artifacts you declare — frontmatter fields, the `dependencies:` and `members:` blocks, and naming — live in the `codeassembly-content-specification` rulebook (`content/guidance/rulebooks/codeassembly-content-specification.md`). This section documents the declaration mechanism itself.

### Format

The declaration is grouped by artifact type. Each type's block takes a `use` list (the slugs to adopt) and an optional `drop` list (slugs to remove from what broader scopes contributed):

```yaml
rulebooks:
  use:
    - shell-conventions
skills:
  use:
    - people-report
subagents:
  use:
    - canary
```

A declared rulebook is delivered by its delivery mode: An `ambient` rulebook is injected into the ambient region of each targeted harness's guidance file, and a `skill` rulebook is delivered as a `consult-<slug>` skill in each targeted harness. A rulebook may declare both.

A declared skill is deployed into each targeted harness's project-local skills directory (`.claude/skills/<slug>/`) with the harness transform applied (include expansion, `{tool:…}` rewrite, link rewriting), carrying a `<!-- codeassembly-skill:<slug> -->` ownership marker so `sync` can retract it once it is no longer declared. Bare `sync` deploys into the project's harness directories; `sync --global` resolves the user-global tier and deploys the same way into the home harness directories instead (see [Scopes](#scopes)).

A skill may restrict itself to specific harnesses with a `supported-harnesses:` frontmatter field (a single harness id or a list, e.g. `supported-harnesses: [rovo]`); `sync` then deploys it only into those harnesses, and `library list` shows the restriction. A skill with no `supported-harnesses:` field deploys to every harness. This is how a skill that one harness provides natively — but the library supplies for the others — is targeted at just the harnesses that need it, without duplicating it per harness.

A declared subagent is deployed into each targeted harness's project-local subagents directory (`.claude/agents/<slug>.md`), with the harness transform applied (frontmatter `_defaults` merge, `{tool:…}` rewrite, `{harness_home_dir}` rewrite) and a `<!-- codeassembly-subagent:<slug> -->` ownership marker so `sync` can retract it once it is no longer declared. A declared subagent deploys into the repo under `sync` and into the home harness directories under `sync --global`.

`rulebooks`, `skills`, `subagents`, and `collections` are all deployed.

Two further top-level keys name where artifacts come from rather than which to adopt: `sources` (see [Sources](#sources)) and `packages` (see [Packages](#packages)). `packages` takes the same `use`/`drop` shape as a type block, so the semantics above carry over to it unchanged.

A third, `harnesses`, names where they go: see [Harness targeting](#harness-targeting).

#### Harness targeting

`harnesses` declares which harnesses a `sync` run deploys into, in the same `use`/`drop` shape as a type block, with harness ids for entries:

```yaml
harnesses:
  use:
    - claude
  drop:
    - rovo
```

A run resolves its targets in this order, stopping at the first that answers:

1. The `--harness <id>` flag. (`--harness all` is the not-specified default and falls through.)
2. The `harnesses` declaration, if any file in the chain carries one. A declaration that resolves to an empty set is honored: the run targets nothing and says so.
3. The harnesses installed on the machine, detected by the presence of their home directories (`~/.claude`, `~/.rovodev`). A harness home is created by that harness's own installer, so its presence is evidence the harness is installed; a repository's own `.claude/` directory is not, which is why the repository is never probed.

**`harnesses` resolves on a chain of its own.** Which harnesses a developer runs is a fact about the machine, so the key resolves across the user-global and project tiers together — the one key that crosses the domains defined under [Scopes](#scopes). Artifact keys deliberately do not: a user-global `collections: use: [all]` would otherwise deploy the whole catalog into every repository's harness directories.

**`root: true` clears only its own domain's contributions.** For every artifact key this is indistinguishable from clearing the whole chain, since their chain lies within one domain. It matters for `harnesses` alone, where it keeps a committed project file from discarding what the developer declared for the machine. A `drop` still crosses the boundary, so a gitignored `.agents/codeassembly.local.yaml` can withdraw a harness for one checkout.

The three tiers therefore state three different things: the user-global tier states which harnesses are installed, the project tier states which the project requires, and `codeassembly.local.yaml` overrides either for one developer.

**Targeting selects the harness set; artifact narrowing filters within it.** A run targeting `[claude, rovo]` with a skill declaring `supported-harnesses: [rovo]` deploys that skill to Rovo alone. The two keys are distinct: `harnesses` lives in `codeassembly.yaml` and governs a whole run, while `supported-harnesses` lives in an artifact's frontmatter and governs that artifact.

Both `sync` and `sync --global` honor the declaration. `install`, `uninstall`, `status`, and `configure-hooks` deploy into the harness homes and so are answered by detection alone; they read `--harness` and the installed set, never the declaration.

Every run names what it targeted and what decided it, and a run that fell back to detection names the key that would pin the set:

```
Targeting claude, rovo (detected in ~).
Declare `harnesses.use` in .agents/codeassembly.yaml to pin this.
```

### Collections

A collection is a traversal-only aggregate: It deploys no file of its own, but declaring it pulls in its members' transitive closure, which `sync` then deploys. Declare one like any other type:

```yaml
collections:
  use:
    - recommended
```

A collection lists its constituents under a `members:` key — either an explicit per-type block (the same shape `dependencies:` uses) or the computed token `'@library'`:

```yaml
members:
  skills:
    - capture-feedback
  subagents:
    - canary
```

`members:` is collections-only; rulebooks, skills, and subagents declare prerequisite edges under `dependencies:` instead. Declaring `dependencies:` on a collection, or `members:` on any other type, is an error that names the offending artifact.

Dropping or omitting a collection, or setting `root: true`, excludes its entire closure; dropping a single member that a collection contributed is not supported, so opt out of the whole collection or declare members à la carte instead.

Four collections ship, each carrying a claim a reader can act on:

| Collection       | Claim                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| `recommended`    | Examined and found generally applicable: no personal doctrine, no coupling to one author's environment.    |
| `williamthorsen` | Examined and found deliberately personal — one author's preferences, environment, and domain.              |
| `triage`         | Not yet examined, and where new content lands. It shrinks by promotion.                                    |
| `all`            | The whole catalog, computed. It carries no claim, and is the escape hatch rather than the expected choice. |

An artifact in none of them is standalone: deliberate, declared directly where wanted, and too rarely invoked to repay a standing line in the skill index. The criteria deciding which disposition an artifact takes are recorded in the `codeassembly-content-specification` rulebook, under `## Collections`.

`codeassembly init --global` seeds the user-global declaration (`~/.agents/codeassembly.yaml`) with `recommended` and `triage`; add any other collection to that file yourself. A project adds a collection for repo deployment by declaring it explicitly.

#### The `@library` token

A collection whose `members:` is the string `'@library'` resolves to every deployable artifact — all rulebooks, skills, and subagents — in the content root the collection resolves from: the built-in library for a library collection, or the owning source for a collection declared in a source. It is computed at resolution time so a newly added artifact joins automatically with no edit. The `@` sigil marks a computed directive rather than a literal slug, so the value must be YAML-quoted (`'@library'`). Collections are excluded from the result: The resolver never emits them, and "every collection" would be self-referential.

The shipped `all` collection carries `'@library'`; declaring `collections: use: [all]` deploys the whole catalog.

### Dependencies

A rulebook, skill, or subagent may declare dependencies on other artifacts in its frontmatter, grouped by artifact type. Resolution follows these edges transitively — deduped, with cycle detection — so declaring one artifact pulls in its whole closure:

```yaml
dependencies:
  rulebooks:
    - shell-conventions
  skills:
    - people-report
  subagents:
    - canary
```

The resolver follows `members:` and `dependencies:` identically; the split is semantic — a collection _contains_ members, while an artifact _depends on_ prerequisites.

### Sources

By default, a declared artifact resolves from CodeAssembly's built-in content library. A top-level `sources:` list adds your own content directories — machine-local, project-local, or a third-party guidance repo — each structured like the library's `content/` (`guidance/rulebooks/`, `skills/`, `subagents/`, `collections/`). Resolution searches the declared sources first, then the library:

```yaml
sources:
  - name: org-guidance
    path: ../shared-guidance
  - name: personal
    path: ~/guidance
rulebooks:
  use:
    - team-standards
```

Each source is a `{ name, path }` pair (both required). A relative `path` resolves against the declaring file's `.agents/` directory; `~` expands to the home directory, and absolute paths are used as-is. Declaration entries stay bare slugs — resolution is transparent, so `team-standards` resolves from whichever source (or the library) provides it, with no per-entry `from:` syntax.

**Precedence.** A later-declared source shadows an earlier one, and any source shadows the library, so a source can override a same-slug library artifact. A package adopted via [`packages`](#packages) is a source too, ranked below every hand-declared one. Repeating a source `name` remaps its path and moves it ahead of the sources declared before it. Because paths are `.agents/`-relative, commit only repo-relative source paths in `codeassembly.yaml`; confine machine-specific and absolute paths to `codeassembly.local.yaml`. A higher-precedence tier's `root: true` discards previously-declared sources exactly as it discards `rulebooks`, `skills`, `subagents`, and `collections`.

Every artifact type resolves through sources: An artifact's body and its closure edges (`dependencies:`, or `members:` for a collection) resolve from the source that owns it, with ownership and retraction semantics identical to a library artifact's. A source-resolved skill or subagent expands its `<!-- include: … -->` directives against its own source root — it can reuse partials within its own source tree, but a target that resolves outside that root fails. A source-resolved **collection** expands its members through the resolver like any other type, and its `'@library'` token is source-scoped: It enumerates that source's own catalog rather than the built-in library. A declared source that is missing or not a directory fails the run — dry-run included — before any file is written, and a slug found in no source or the library fails with an error naming every location searched.

### Packages

A dependency can ship the guidance for using it, and a project adopts it by naming the package — no filesystem path, no generated file to keep in sync:

```yaml
packages:
  use:
    - '@williamthorsen/nmr'
```

That one line does two things: the package's content directory joins the source search order, and every rulebook, skill, and subagent the package ships is deployed. Nothing else is needed, because a package's whole catalog is its declaration — which is also why granularity is all-or-nothing. Adopting a package takes every artifact in its catalog; an individual one cannot be dropped, matching the existing limitation on collection members.

`packages:` is an ordinary declaration block, so `use`, `drop`, and `root: true` behave exactly as they do for an artifact type. A project-local tier can therefore decline a package the committed tier adopted:

```yaml
# .agents/codeassembly.local.yaml
packages:
  drop:
    - '@williamthorsen/nmr'
```

**Precedence.** Every `sources` entry, from any tier, outranks every package, and every package outranks the built-in library — a directory you pointed at by hand should win over a dependency's. Among packages the ordinary rule applies: the highest tier wins, and within a tier the last declared wins. A package that masks a library slug is reported by the same shadow warning a declared source triggers; two packages that ship the same slug resolve by precedence with no warning, and `sync --dry-run` names the source each artifact resolved from.

**Resolution.** A declared package resolves through the module resolver, walking the `node_modules` chain Node itself searches, so it holds under pnpm's hoisting and symlinked layouts. It also holds under a `workspace:*` link, which means a repo that produces a guidance-shipping package consumes its own guidance through the same declaration a third party writes, resolved against the live source tree rather than a packed copy. A declared package that is not installed, declares no content directory, or points at a missing one fails the run — dry-run included — before any file is written, naming what was searched.

**Discovery.** `sync` reports any direct dependency that ships content the project has not declared, printing the `packages:` block that would adopt it. That is advice, not action: an undeclared dependency contributes nothing, so installing one changes nothing about what an agent reads, and `drop` silences the advice for a package the project has turned down.

Upgrading an already-declared package is the other case. Its catalog is read from the filesystem, so a version that adds an artifact deploys it with no declaration change — the freshness property that makes the rendered guidance a function of what is installed. `sync --dry-run` prints the resolution report naming every artifact and the source it came from, which is where that change is visible.

#### Shipping guidance from a package

A package declares where its content lives with a `codeassembly` key in its `package.json`, pointing at a directory structured like the library's `content/`:

```json
{
  "name": "@williamthorsen/nmr",
  "codeassembly": { "content": "content/agents" },
  "files": ["bin", "content", "dist"]
}
```

```
content/agents/
  collections/
  guidance/rulebooks/
  skills/
  subagents/
```

The key is required and has no default location. That is deliberate: a default would claim a directory name in every producer's package root, so instead a producer says where its content lives and can nest it under a directory it already owns — including build output, if a build step puts it there.

A package's catalog is its rulebooks, skills, and subagents; a `collections/` entry is resolvable but not adopted on its own, so a collection reaches a consumer only when that consumer declares it by name. Its members are already in the catalog anyway, so the way to pull in an artifact from outside the package — a library rulebook, say — is a `dependencies:` edge on an artifact the catalog does contain.

**Shipping support files.** Anything under `skills/` that carries no `SKILL.md` is a support entry: shared reference content a skill or rulebook reads at runtime by path, `skills/_data/` being the usual case. A package ships them by placing them where the library does, and they deploy alongside the skills whenever the package is adopted — no declaration of their own, since nothing names them but the links that reach them.

```
content/agents/
  skills/
    _data/
      house-style.md
    org-review/
      SKILL.md          # links to ../_data/house-style.md
```

Each source's support entries deploy into a namespace of their own, under `skills/_sources/<source-name>/`, so the built-in library and any number of packages can each ship a `_data/house-style.md` without one masking another. A scoped package name nests as its own segments (`_sources/@williamthorsen/nmr/`). Author links exactly as the library does — relative to the file's own place in the content tree — and delivery rewrites them to wherever they land; a source name that could not name a directory fails the run rather than being silently reshaped.

`_partials/` is the exception, being an include target inlined into the files that include it rather than a file that deploys.

**Include the content directory in `files`.** This is the one thing most likely to go wrong, because a `workspace:*` self-link resolves the live source tree and so never exercises packing. A producer that omits the entry sees its own guidance work perfectly and every consumer's install fail. `pnpm pack` and inspecting the tarball is the check that catches it.

Authoring the artifacts themselves is no different from authoring library content; see the content specification for frontmatter fields, `dependencies:`, `members:`, and invocation tokens.

**Gate the content in the producer's own build.** `codeassembly validate` runs the checks a consumer's `sync` runs before writing — dependency closure, artifact resolution, delivery collisions, and a per-harness render — over the whole content root, writing nothing:

```
codeassembly validate
```

It reads no `codeassembly.yaml`, so a package that produces guidance without consuming any still has a gate: wire it into the repo's `check` and a defect fails the producer's build instead of the next consumer's install. The root comes from `--content <dir>`, or from the `codeassembly.content` key above when the flag is absent; neither yielding one is an error naming both routes. `--harness` narrows the run, and the default checks every harness the root could deploy to, since a defect can reach only one. A clean root exits 0; any defect exits 1 after a report grouped by file. One check has no `sync` counterpart, and catches what nothing else would: a skill declaring the retired `harnesses:` key, which narrows nothing and survives into the deployed file rather than failing anywhere.

Coverage is what the root ships that reaches a consumer: rulebooks, skills, subagents, collections, and the support entries under `skills/` that carry no `SKILL.md`. Link-target existence and cross-file anchors are not checked — a target resolves against the deployed tree, which unions this content with the library's and with every other declared source's.

One shape cannot consume its own guidance: a single-package repo whose package is the repo root has no `workspace:*` self-link to resolve through. Such a repo declares a `sources:` entry pointing at the directory instead.

### Scopes

The declaration resolves in two independent **domains**, each with its own base and local tiers and its own deployment target. The tiers within a domain run lowest to highest precedence.

**Repo domain** — `codeassembly sync`, deploying into the repo:

1. **Project** — `.agents/codeassembly.yaml`, committed and shared with the team.
2. **Project-local** — `.agents/codeassembly.local.yaml`, gitignored, for personal overrides.

**Home domain** — `codeassembly sync --global`, deploying into the home harness directories (`~/.claude`, `~/.rovodev`) and `~/.agents/`:

1. **User-global** — `~/.agents/codeassembly.yaml`, created by `init --global` (declares `all` by default).
2. **User-global-local** — `~/.agents/codeassembly.local.yaml`, for personal overrides that survive reinstalls.

A higher tier adds to and overrides the tiers below it _within the same domain_: `use` adds an entry, `drop` removes one a broader tier in that domain contributed, and `root: true` discards everything from broader tiers in that domain. Artifact keys never cross the domains — a project tier cannot `drop` a user-global rulebook, skill, subagent, or collection, and bare `sync` never writes the home directories (it refuses to run when invoked from the home directory, directing you to `sync --global`). `harnesses` is the one deliberate exception: which harnesses a developer runs is a fact about the machine rather than about either domain's catalog, so it resolves across both tiers (see [Harness targeting](#harness-targeting)). In both domains, ambient rulebooks are injected into the ambient region of a per-harness guidance file the harness loads at launch. In the repo domain the host is each targeted harness's machine-local project guidance file at the project root (`CLAUDE.local.md`, `AGENTS.local.md`), which `sync` creates when the project declares an ambient rulebook and appends its region to when the file already exists; because that host is gitignored, a multi-worktree checkout needs a sync per worktree (see [Keeping deployed guidance current](#keeping-deployed-guidance-current)). In the home domain the host is each targeted harness's guidance file (`~/.claude/CLAUDE.md`, `~/.rovodev/AGENTS.md`), whose region's location comes from `install`'s rendered template while its content belongs to `sync --global`: `install` preserves the region across re-renders and ignores it for drift detection, while hand edits elsewhere in those files still count as drift. Run `install` once before the first `sync --global` so the region exists to fill; a guidance file without the region is skipped with a warning. `sync --global` also retires a legacy `~/.agents/GLOBAL.md`, removing its sync-owned blocks and deleting the file unless it holds hand-written content. For per-machine ambient guidance that should stay out of source control, declare a machine-local source (see [Sources](#sources)) holding a personal rulebook with `delivery: ambient`. In both domains, the deployed Rovo Dev skills are indexed into `.rovodev/prompts.yml` so they surface in Rovo Dev's available-skills list; `sync` owns a single sentinel-delimited region in that file and leaves any hand-authored entries outside it untouched, in the home file as well as the project file.

When upgrading from a build where `install` deployed the catalog, run `install` once before `sync --global`: The new `install` prunes the skills and the whole-file `prompts.yml` it previously planted, and `sync --global` then re-deploys the skills as sync-owned and rewrites `prompts.yml` as a merged region. Running `sync --global` first stops at a refuse-to-overwrite error on those still-`install`-owned skill files, and would merge its region beneath the stale whole-file `prompts.yml` entries until the next `install` prunes them.

## Keeping deployed guidance current

`sync` writes what the declaration resolved at the moment it ran, and nothing re-runs it on its own. The rule is to sync when the content it renders last changed, and that moment falls in a different place depending on where the content comes from:

| Role                                     | Content is ready when      | Trigger            | On failure   |
| ---------------------------------------- | -------------------------- | ------------------ | ------------ |
| Consumer of a guidance-shipping package  | the dependency is unpacked | root `postinstall` | warn, exit 0 |
| Provider whose content is a build output | its build finishes         | after the build    | fail         |

**Consumer.** A project whose declared artifacts come from [packages](#packages) can sync as soon as `pnpm install` finishes, so wire it there:

```json
{
  "scripts": {
    "postinstall": "codeassembly sync --warn-only"
  }
}
```

`--warn-only` reports a failure and exits 0, and it belongs on this trigger specifically. `sync` fails closed on a missing declared source, an unresolvable slug, a foreign-owned target, or a damaged ambient region; without the flag, any of those aborts `pnpm install` for everything downstream, which costs far more than the stale guidance it guards against. `pnpm install --ignore-scripts` skips the hook, so a tree installed that way carries whatever the last sync left.

**Provider.** A repo that produces its own artifacts syncs after the build that produces them, and fails on error: the build has already succeeded by then, so the tree is usable and a non-zero exit is the signal rather than a broken checkout. Invoke the built bin rather than a source runner, so that a sync reached before the build stops at the `codeassembly` wrapper's build-output gate instead of deploying skill directories without the helper bundles the build produces. That same gate is why this trigger cannot move to `postinstall`: pre-build content is incomplete, and the wrapper exits before it parses `--warn-only` when the build output is absent.

A repo whose bootstrap always follows its install needs only the post-build trigger, which covers its package-borne artifacts too. Re-running `sync` on unchanged content rewrites nothing, so a repo with reason to wire both pays only the second run's startup. Either trigger is a no-op in a project that declares no artifacts.

## Preferences

Agent behavior is configured through `.agents/preferences.yaml` files. The resolution cascade is:

1. **Project** — `.agents/preferences.yaml` in the repository root (committed, shared with team)
2. **Global** — `~/.agents/preferences.yaml` in the user's home directory (personal defaults)
3. **Default** — built-in fallback (documented per key below)

Project-level values take precedence over global. An explicitly empty value at the project level (e.g., `title_format: ''`) overrides a non-empty global value.

### Schema

#### `project`

| Key                         | Type   | Default                                      | Description                                                                                                                                                                                                                            |
| --------------------------- | ------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project.slug`              | string | Bare directory name of the working directory | Project identifier used for namespacing artifacts under `{base_dir}/projects/{slug}/`.                                                                                                                                                 |
| `project.ticket_ref_prefix` | string | `''`                                         | Prefix that appears at the start of `ticket_ref`. Use `#` for GitHub issues (added at render time, omitted from file paths) or a Jira project key like `MAC-` (part of the canonical ticket ID, included in file paths and templates). |

#### `artifacts`

| Key                       | Type   | Default          | Description                                                                                                |
| ------------------------- | ------ | ---------------- | ---------------------------------------------------------------------------------------------------------- |
| `artifacts.base_dir`      | string | `~/ai-artifacts` | Root directory for all generated artifacts (chats, plans, devlogs, tickets, runs). Supports `~` expansion. |
| `artifacts.paths.chats`   | string | `chats`          | Subdirectory name for chat artifacts, relative to the project artifact directory.                          |
| `artifacts.paths.devlogs` | string | `devlogs`        | Subdirectory name for devlog artifacts.                                                                    |
| `artifacts.paths.plans`   | string | `plans`          | Subdirectory name for plan artifacts.                                                                      |

#### `repository`

| Key                                        | Type   | Default  | Description                                                                                     |
| ------------------------------------------ | ------ | -------- | ----------------------------------------------------------------------------------------------- |
| `repository.default_remote.name`           | string | `origin` | Name of the default git remote.                                                                 |
| `repository.default_remote.default_branch` | string | `main`   | Default branch of the remote. Combined with the remote name to produce refs like `origin/main`. |
| `repository.slug`                          | string | —        | **Deprecated.** Use `project.slug` instead. Kept as a fallback.                                 |

#### `commit`, `ticket`, `pr`, `merge` — title format conventions

These four sections share the same structure. Each holds a declarative template that `describe-change.sh` renders into the title for the corresponding surface (commit, GitHub issue, pull request, and squash-merge commit).

| Key                   | Type   | Default | Description                                 |
| --------------------- | ------ | ------- | ------------------------------------------- |
| `commit.title_format` | string | `''`    | Template for commit titles.                 |
| `ticket.title_format` | string | `''`    | Template for issue titles.                  |
| `pr.title_format`     | string | `''`    | Template for pull-request titles.           |
| `merge.title_format`  | string | `''`    | Template for the squash-merge commit title. |

A template is a string containing literal text and any combination of the supported tokens listed below, with optional `[...]` groups for parts that should drop when their tokens are empty. An empty template is the explicit way to opt out — the corresponding rendered title will be the empty string. The `describe-change.sh` script outputs JSON with `commit_title`, `ticket_title`, `pr_title`, and `merge_title`.

##### Supported tokens

| Token          | Resolves to                                                                           |
| -------------- | ------------------------------------------------------------------------------------- |
| `{scope}`      | Change scope (workspace, package, module).                                            |
| `{type}`       | Work type (`feat`, `fix`, `docs`, …).                                                 |
| `{title}`      | Bare title text. Required in every template that should produce a non-empty title.    |
| `{ticket_ref}` | Rendered ticket reference (`#466`, `MAC-147`, …); empty when no ticket is associated. |
| `{pr_number}`  | PR number; empty when not yet known. Only meaningful in `merge.title_format`.         |

A template that omits `{title}` will not have it inserted implicitly; unknown tokens (e.g., `{titel}`) are left as-is so typos surface in the output.

Quote `title_format` values in YAML (single or double quotes are both fine). Quoting protects template characters such as `#`, `:`, and `|` from YAML's own parsing rules. In an unquoted value a bare `#` (e.g., `#{pr_number}`) is preserved, but YAML's inline-comment convention — a space immediately followed by `#` — silently truncates the rest of the template. `title_format: {title} # legacy` becomes `{title}` with no warning. When in doubt, quote.

##### Optional groups

A `[...]` group renders verbatim if every token reference inside resolves non-empty. If any inner token is empty, the entire group — literals included — drops. After substitution, runs of multiple spaces are collapsed and leading/trailing whitespace is trimmed. Groups are processed left-to-right; nesting is not supported.

Example template: `[{ticket_ref} ][{scope}|{type}: ]{title}[ (#{pr_number})]`

| Inputs                       | Output                              |
| ---------------------------- | ----------------------------------- |
| All five tokens populated    | `#466 agents\|feat: Add foo (#470)` |
| No `{ticket_ref}`            | `agents\|feat: Add foo (#470)`      |
| No `{scope}` and no `{type}` | `#466 Add foo (#470)`               |
| No `{pr_number}`             | `#466 agents\|feat: Add foo`        |
| Only `{title}`               | `Add foo`                           |

##### Examples

Bare title (no prefix):

```yaml
commit:
  title_format: '{title}'
ticket:
  title_format: '{title}'
pr:
  title_format: '{title}'
```

Produces: `Add script installer`

Type-only prefix (conventional commits without scope):

```yaml
commit:
  title_format: '{type}: {title}'
ticket:
  title_format: '{type}: {title}'
pr:
  title_format: '{type}: {title}'
```

Produces: `feat: Add script installer`

Scope-pipe-type prefix with optional drop (monorepo convention):

```yaml
commit:
  title_format: '[{scope}|{type}: ]{title}'
```

Produces: `agents|feat: Add script installer` when scope and type are present, `Add script installer` when either is missing.

Conventional commits with scope in parentheses:

```yaml
commit:
  title_format: '[{type}({scope}): ]{title}'
```

Produces: `feat(agents): Add script installer`

Squash-merge convention (the typical shape this repo uses):

```yaml
commit:
  title_format: '[{scope}|{type}: ]{title}'
ticket:
  title_format: '{title}'
pr:
  title_format: '[{ticket_ref} ][{scope}|{type}: ]{title}'
merge:
  title_format: '[{ticket_ref} ][{scope}|{type}: ]{title}[ (#{pr_number})]'
```

Produces (for `--scope agents --type feat --title 'Add foo' --ticket-ref '#466' --pr-number 470`):

- `commit_title`: `agents|feat: Add foo`
- `ticket_title`: `Add foo`
- `pr_title`: `#466 agents|feat: Add foo`
- `merge_title`: `#466 agents|feat: Add foo (#470)`

##### Scope values

- In a monorepo, the scope is the workspace name or abbreviation.
- `root` — commit touches only files in the monorepo root.
- `*` — commit spans multiple workspaces, or root and one or more workspaces.
- A root change tightly associated with one workspace (e.g., lockfile updated by a dependency added to that workspace) uses the workspace scope, not `root`.

##### Breaking changes

Append `!` after the type: `agents|feat!: Remove deprecated API`

#### `integrations`

| Key                         | Type    | Default | Description                                                  |
| --------------------------- | ------- | ------- | ------------------------------------------------------------ |
| `integrations.jira.enabled` | boolean | `false` | Enable Jira integration for ticket creation and referencing. |

#### `orchestration`

| Key                                | Type                                 | Default  | Description                                                                                                             |
| ---------------------------------- | ------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| `orchestration.max_review_rounds`  | integer                              | `3`      | Maximum iterative review rounds before marking `needs_manual_review`. Overridden by `--max-review-rounds` CLI argument. |
| `orchestration.approval_threshold` | `low` \| `medium` \| `high`          | `low`    | Minimum finding severity required for code approval. Overridden by `--approval-threshold`.                              |
| `orchestration.budget_threshold`   | `low` \| `medium` \| `high`          | `low`    | Minimum finding severity for spending remaining review-round budget. Overridden by `--budget-threshold`.                |
| `orchestration.mcp_policy`         | `required` \| `optional` \| `prompt` | `prompt` | How to handle MCP unavailability. `required` aborts, `optional` continues with a warning, `prompt` asks the developer.  |

##### Model overrides

`orchestration.models.{role}` assigns a model to a specific agent role. All values are optional and fall back to engine defaults.

| Key                                                   | Engine default |
| ----------------------------------------------------- | -------------- |
| `orchestration.models.default`                        | `sonnet`       |
| `orchestration.models.coder`                          | `opus`         |
| `orchestration.models.architect`                      | `sonnet`       |
| `orchestration.models.planner`                        | `sonnet`       |
| `orchestration.models.reviewer`                       | `sonnet`       |
| `orchestration.models.aspect_code_reviewer`           | `sonnet`       |
| `orchestration.models.aspect_silent_failure_reviewer` | `sonnet`       |
| `orchestration.models.aspect_test_reviewer`           | `sonnet`       |
| `orchestration.models.code_simplification_reviewer`   | `sonnet`       |
| `orchestration.models.holistic_reviewer`              | `opus`         |
| `orchestration.models.savings_analyzer`               | `haiku`        |

Note: `coder`, `holistic_reviewer`, and `savings_analyzer` have their own engine defaults and do not inherit from `orchestration.models.default`.

#### `editors`

Optional list of editor configurations. Each entry maps file extensions to an editor command.

```yaml
editors:
  - name: WebStorm
    command: webstorm
    extensions: '*.md'
```

| Key                    | Type   | Description                                                            |
| ---------------------- | ------ | ---------------------------------------------------------------------- |
| `editors[].name`       | string | Display name of the editor.                                            |
| `editors[].command`    | string | Shell command to open files. The file path is appended as an argument. |
| `editors[].extensions` | string | Glob pattern for file types this editor handles.                       |

### Full example

```yaml
project:
  slug: my-project
  ticket_ref_prefix: '#'

artifacts:
  base_dir: ~/ai-artifacts
  paths:
    chats: chats
    devlogs: devlogs
    plans: plans

repository:
  default_remote:
    name: origin
    default_branch: main

commit:
  title_format: '[{scope}|{type}: ]{title}'
ticket:
  title_format: '{title}'
pr:
  title_format: '[{ticket_ref} ][{scope}|{type}: ]{title}'
merge:
  title_format: '[{ticket_ref} ][{scope}|{type}: ]{title}[ (#{pr_number})]'

integrations:
  jira:
    enabled: false

orchestration:
  max_review_rounds: 3
  approval_threshold: low
  budget_threshold: low
  mcp_policy: prompt
  models:
    coder: sonnet
    holistic_reviewer: opus

editors:
  - name: WebStorm
    command: webstorm
    extensions: '*.md'
```

## Development

### Bin wrapper pattern

A package's `bin` field points to a committed wrapper script under `bin/` that dynamically imports the build output at runtime. Do not point `bin` entries directly into `dist/`: pnpm creates bin symlinks during install, and nothing compiles until `pnpm run bootstrap` runs afterward, so the target won't exist in a fresh worktree and `pnpm install` will emit confusing "Failed to create bin" warnings.

Any new `bin` entry in this monorepo should follow the same pattern. See `packages/mcp/bin/codeassembly-mcp.js` for the template, and the `@williamthorsen/node-monorepo-tools` packages for the original rationale.
