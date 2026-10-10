<!-- readme-type: cli -->

# codeassembly

A CLI that deploys reusable AI agent guidance (rulebooks, skills, and subagents) from the content sources that a declaration names into coding-harness directories. The CodeAssembly library of that guidance is the sibling package [`codeassembly-guidance`](../guidance/README.md).

<!-- section:release-notes --><!-- /section:release-notes -->

## Installation

The tool deploys only what a declaration names, so the first run starts by declaring where the content is. To deploy the CodeAssembly library into the home harness directories:

```bash
git clone https://github.com/williamthorsen/codeassembly.git ~/repos/codeassembly
npx codeassembly init --global
```

Uncomment the `sources:` entry in `~/.agents/codeassembly.yaml` and point it at the clone:

```yaml
sources:
  - name: codeassembly-guidance
    path: ~/repos/codeassembly/packages/guidance/content
```

Then deploy:

```bash
npx codeassembly install
npx codeassembly sync --global
```

`install` deploys the harness guidance files and scripts. `sync --global` deploys the artifacts that the home declaration names, with each source's support files under `skills/_sources/<name>/`. Both commands stop without writing anything until a source is declared.

A project declares its own sources and artifacts in `.agents/codeassembly.yaml` (`codeassembly init` scaffolds one), and `sync` materializes exactly what it declares, including guidance shipped by its dependencies (see [Packages](docs/project-declaration.md#packages)). Add the tool to a project when the repo ships guidance of its own, or wants `sync` to run from a script:

```bash
pnpm add --save-dev codeassembly
```

A project can also consume a guidance library as a dependency and pick from it: Install the package, name it as a source, and declare what to deploy from it (see [Sources](docs/project-declaration.md#sources)):

```yaml
sources:
  - package: codeassembly-guidance
collections:
  use:
    - recommended
```

Supported harnesses are Claude Code and Rovo Dev; `--harness` narrows a run to one.

Optional: For a project whose tickets live in Jira, the deployed guidance resolves them through Atlassian's [`acli`](https://developer.atlassian.com/cloud/acli/) when it is on `PATH`, so `acli jira auth login --web` is worth running once. Without it, resolution falls back to a connected Jira read tool and then to asking for the ticket content.

## Commands

Run via the `codeassembly` CLI: `codeassembly <command> [options]`.

| Command             | Description                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `install`           | Install harness guidance files and scripts from the declared sources                                       |
| `init`              | Scaffold `.agents/codeassembly.yaml` for the project, or `--global` for `~/.agents/codeassembly.yaml`      |
| `sync`              | Resolve `.agents/codeassembly.yaml` and materialize declared rulebooks, skills, subagents, and collections |
| `uninstall`         | Remove installed guidance, skills, and subagents                                                           |
| `sizes`             | Rank the last recorded deployment's documents by size, with the context aggregates beneath them            |
| `status`            | Show the current state of installed items                                                                  |
| `validate`          | Check a content root for defects that reach a consumer; writes nothing                                     |
| `bundle-helpers`    | Bundle the helpers that a content root declares; `--check` fails on a stale bundle                         |
| `library list`      | List each declared source's artifacts, marking those that a higher-precedence source shadows               |
| `generate <target>` | Generate a configuration file (e.g., `label-map`, whose scopes come from `pnpm-workspace.yaml`)            |

Global options: `--harness <claude\|rovo\|all>` (default `all`), `--link`, `--force`, `--dry-run`, `--output-style <auto\|plain\|rich>`, and `--help`. `--output-style` prints status glyphs as emoji (`rich`) or as words (`plain`); `auto`, the default, prints plain to a stream that is not a terminal or in CI, and `CODEASSEMBLY_OUTPUT_STYLE` sets it when the flag is absent. `--content <dir>` applies to `validate` and `bundle-helpers`, and `--check` to `bundle-helpers` alone, and `--override-writer` to `install` and `sync --global` (see [Designated home-domain writer](docs/project-declaration.md#designated-home-domain-writer)). Run `codeassembly --help` for the authoritative list.

## Project declaration

A project opts into shared artifacts through `.agents/codeassembly.yaml`. Run `codeassembly init` to scaffold one, declare the artifacts that the project needs, then run `codeassembly sync` to materialize them. The same declaration format resolves in two independent domains: the repo (via `sync`) and the user-global home (via `sync --global`). For the home domain, `codeassembly init --global` scaffolds `~/.agents/codeassembly.yaml`, seeded with the `recommended` and `triage` collections. See [Scopes](docs/project-declaration.md#scopes).

Authoring conventions for the declared artifacts (frontmatter fields, the `dependencies:` and `members:` blocks, and naming) live in the library's `codeassembly-content-specification` rulebook ([`codeassembly-content-specification.md`](../guidance/content/guidance/rulebooks/codeassembly-content-specification.md)). [Project declaration](docs/project-declaration.md) documents the declaration mechanism itself:

- [Format](docs/project-declaration.md#format): the `use` and `drop` lists, harness targeting, and guidance hooks.
- [Collections](docs/project-declaration.md#collections): aggregates that pull in their members, and the `@library` token.
- [Dependencies](docs/project-declaration.md#dependencies): artifacts that a declared artifact pulls in.
- [Sources](docs/project-declaration.md#sources): the content roots from which every artifact resolves, and how one shadows another.
- [Packages](docs/project-declaration.md#packages): guidance shipped by a dependency.
- [References](docs/project-declaration.md#references): documentation that a dependency ships for agents.
- [Content-format version](docs/project-declaration.md#content-format-version): the format contract that a content root declares.
- [Scopes](docs/project-declaration.md#scopes): the repo and home domains, the designated home-domain writer, and home-domain provenance.

A content root's own tests read it as consumers receive it through the `codeassembly/api` subpath; see [Content API](docs/content-api.md).

## Keeping deployed guidance current

`sync` writes what the declaration resolved at the moment it ran, and nothing re-runs it on its own. The rule is to sync when the content that it renders last changed, and that moment falls in a different place depending on where the content comes from:

| Role                                     | Content is ready when      | Trigger            | On failure   |
| ---------------------------------------- | -------------------------- | ------------------ | ------------ |
| Consumer of a guidance-shipping package  | the dependency is unpacked | root `postinstall` | warn, exit 0 |
| Provider whose content is a build output | its build finishes         | after the build    | fail         |

**Consumer.** A project whose declared artifacts come from [packages](docs/project-declaration.md#packages) can sync as soon as `pnpm install` finishes, so wire it there:

```json
{
  "scripts": {
    "postinstall": "codeassembly sync --warn-only"
  }
}
```

A failed `sync` reports every defect found by its pre-write gates, grouped by file the way `validate` reports a content root, and says that nothing was written and that the previously deployed guidance remains in effect. One run therefore names every rejected artifact rather than sending the author back for another run per file, and neither posture leaves a reader to guess whether part of the deployment was written.

`--warn-only` reports a failure and exits 0, and it belongs on this trigger specifically. `sync` fails closed on an unusable declared source, an unresolvable slug, a foreign-owned target, or a damaged ambient region; without the flag, any of those aborts `pnpm install` for everything downstream, which is far more disruptive than the stale guidance that it guards against. `pnpm install --ignore-scripts` skips the hook, so a tree installed that way keeps whatever the last sync left.

**Provider.** A repo that produces its own artifacts syncs after the build that produces them, and fails on error: The build has already succeeded by then. The tree is usable, and a non-zero exit is the signal rather than a broken checkout. Invoke the built bin rather than a source runner, so that a sync reached before the build stops at the `codeassembly` wrapper's build-output gate instead of deploying skill directories without the helper bundles that the build produces. That same gate is why this trigger cannot move to `postinstall`: Pre-build content is incomplete, and the wrapper exits before it parses `--warn-only` when the build output is absent.

A repo whose bootstrap always follows its install needs only the post-build trigger, which covers its package-borne artifacts too. Re-running `sync` on unchanged content rewrites nothing, so wiring both adds only the second run's startup. Either trigger is a no-op in a project that doesn't declare any artifacts.

Each live `sync` also records the deployment's sizes: It measures every file that it and `install` wrote and appends a size snapshot to a machine-local record under `~/.codeassembly/deployed-sizes/`, outside every repository. A live sync then reports what changed: each document that it added, removed, or resized, a warning for each that has just passed the growth ceiling, and the three totals. The `sizes` command reads that record and ranks the deployment's documents by size, with the always-loaded, on-invocation, and asset totals beneath them; `--global` reads the home deployment's record whatever the working directory. A sync never fails on a size condition, and `--dry-run` records nothing.

For the record's path and line shape, the conditions under which a snapshot is appended, and how the three aggregates are computed, see [Deployed sizes](docs/deployed-sizes.md).

## Preferences

The library's skills read `.agents/preferences.yaml`; the [`codeassembly-guidance` README](../guidance/README.md#preferences) documents the cascade and every key.

## Development

### Bin wrapper pattern

A package's `bin` field points to a committed wrapper script under `bin/` that dynamically imports the build output at runtime. Do not point `bin` entries directly into `dist/`: pnpm creates bin symlinks during install, and nothing compiles until `pnpm run bootstrap` runs afterward, so the target won't exist in a fresh worktree and `pnpm install` will emit confusing "Failed to create bin" warnings.

Any new `bin` entry in this monorepo should follow the same pattern. See `packages/agents/bin/codeassembly.js` for the template, and the `@williamthorsen/node-monorepo-tools` packages for the original rationale.
