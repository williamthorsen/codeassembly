# Splitting the monorepo into three repositories

## Purpose

This repository holds three kinds of thing that have different audiences and different reasons to be public:

- the guidance library (`packages/guidance`), consumed on each developer machine as a clone and by projects as an
  npm dependency;
- the publishable packages (`packages/agents`, `packages/kb`, `packages/run-core`), published to npm with provenance,
  which requires a public source repository;
- proprietary applications (`packages/factory`, `demos/`), which are public only because they share the repository.

The split gives each kind its own repository:

| Repository                             | Visibility | Contents                                                                              |
| -------------------------------------- | ---------- | ------------------------------------------------------------------------------------- |
| `williamthorsen/codeassembly`          | public     | `codeassembly` CLI, `@williamthorsen/kb`, `codeassembly-run-core`, API specifications |
| `williamthorsen/codeassembly-guidance` | public     | the `codeassembly-guidance` library and its helper sources                            |
| `williamthorsen/codeassembly-studio`   | private    | factory, demos, future orchestrator and visualizer apps, planning documents           |

The packages repository keeps the current GitHub identity, so the 2200-plus issues and the commit titles that
reference them stay valid, and the provenance links of every published version keep naming the repository that built
it.

## Non-goals

- Renaming any npm package.
- Changing the content specification, the CLI's source model, or the `live` worktree convention.
- Transferring closed issues or rewriting commit messages.

## Why the cut between guidance and packages is cheap

Guidance depends on `codeassembly` and `@williamthorsen/kb` only as devDependencies of its helper build, and nothing
in agents or kb reads guidance. Of the last 400 commits, 19 touch guidance together with agents or kb. After the
split those changes follow the upstream-first order: publish the package, upgrade the pin in guidance, then change
guidance.

## Target shape of each repository

### `codeassembly-guidance`

A single package at the repository root, with `content/` at `<repo>/content`, so that the deployed path on a machine
is `~/repos/projects/codeassembly-guidance.live/content`. The pnpm workspace scaffolding does not carry over; the
build, check, test, and release scripts do.

- `codeassembly` and `@williamthorsen/kb` move from `workspace:*` to pinned npm versions.
- The helper bundles under `content/scripts` stay tracked build output, so a clone deploys without an install.
- The repository's own `.agents/codeassembly.yaml` names `content` as a path source, as it does now.
- `codeassembly-repo-conventions` (now `.agents/content/guidance/rulebooks/`) moves here, because it describes the
  library.
- `scripts/codeassembly-sync-live.sh` and `docs/live-deployment.md` move here. The script advances this repository's
  `live`, installs dependencies, builds the helpers, and deploys with the binary built in the packages repository's
  `live` worktree, found at the sibling path `codeassembly.live` or at the path that an override variable names. Both
  repositories carry the `live` tag in `~/.config/repos.yaml`.
- The release workflow, `.meta/changelog.json`, and `CHANGELOG.md` carry over, so the npm path keeps working.

### `codeassembly` (packages)

The current repository minus the extracted trees. It keeps the pnpm workspace, nmr, the publish and release workflows,
and the root `CHANGELOG.md`.

- `codeassembly-run-core` drops `private: true` and is published, because the studio repository consumes it from npm.
- The `run-index.json` specification, now a section of guidance's `artifact-conventions.md`, moves here beside the Zod
  schemas that implement it, and the guidance file points at it. Nothing mechanical ties the two today; the split
  makes the gap a cross-repository one, so the spec lives with the implementation.
- The repository consumes guidance as a `package: codeassembly-guidance` source rather than a path, which makes it
  the first consumer of the npm path.

### `codeassembly-studio`

`packages/factory`, `demos/catwalk`, `docs/plans`, and `docs/pixel-agents-analysis.md`, as a pnpm workspace with nmr.
It consumes `codeassembly-run-core` from npm and guidance as a `package:` source.

## Extraction method

Each new repository is created from this one with `git filter-repo`, keeping the history of the extracted paths and
renaming them to their new location (`packages/guidance/` to the root for guidance, `packages/factory/` kept as is for
studio). The extracted trees are then deleted here in one commit per repository, after the new repository's CI is green.

Open issues are transferred with `gh issue transfer` by scope label (`scope:guidance`, `scope:factory`). Closed issues
stay.

## Machine and config changes

The configs repository names the guidance path in base-only `~/.agents/codeassembly.yaml`, which changes in one
configs PR that takes effect on each machine once that repository's `live` is advanced. The profiles that link
`@williamthorsen/kb` from `codeassembly.live/packages/kb` in `node-globals.yaml` keep that link, because kb stays in
this repository. Each machine then clones
`codeassembly-guidance`, creates its `live` worktree, and relinks `codeassembly-sync-live` to the new path.

`~/.config/repos.yaml` gains two entries and moves the `live` tag.

## Known costs

- **Two `live` branches advance separately.** A machine deploys guidance from one worktree and the CLI from another,
  and a deploy that needs both changes advances both. The sync command advances only the guidance one.
- **Cross-repository changes need two PRs.** About 5% of recent commits, per the count above.
- **Three sets of CI, labels, and dependency upgrades** instead of one.

## Order of work

The studio trees leave first, so that this repository holds only public material as early as possible, and the guidance
extraction, which touches every machine, follows on its own.

1. Publish `codeassembly-run-core`: drop `private: true` and release it, so that the studio repository can pin it.
2. Extract the studio repository: filter-repo, pin `codeassembly-run-core` from npm, get CI green.
3. Remove the studio trees here and transfer the open `scope:factory` issues.
4. Prepare the guidance extraction in place: move the `run-index.json` spec next to run-core, and confirm that the
   guidance package builds with pinned npm versions of `codeassembly` and `@williamthorsen/kb` instead of
   `workspace:*`. Confirm also that `nmr ci` passes on a scratch `git filter-repo` extraction of `packages/guidance`
   flattened to the root.
5. Extract the guidance repository: filter-repo, flatten to the root, carry the workflows over, get CI green, publish
   a version from the new repository.
6. Switch the machines: configs PR, registry entries, `live` worktrees, relink the sync command, and deploy once from
   the new clone.
7. Remove the guidance tree here, switch this repository to the `package:` guidance source, and transfer the open
   `scope:guidance` issues. Update the references here that name guidance content or paths: the
   `codeassembly-repo-conventions` rulebook and the `codeassembly-repo` source in `.agents/codeassembly.yaml`, the
   `docs/live-deployment.md` link in `README.md`, the `packages/guidance` pointers in `AGENTS.md`, and the example
   path in `packages/agents/src/lib/declared-sources.ts`.

Step 4 can start as soon as step 1 is merged. Each removal step waits for the new repository to be green and, for
guidance, deployed, so that nothing is deleted before its new home works.

## Decisions taken

- The new repositories are named `codeassembly-guidance` and `codeassembly-studio`; both names are free on GitHub.
- The guidance repository is a flat single package, with `content/` at the root, rather than a one-package
  workspace, because the deployed path is shorter and the workspace scaffolding serves nothing there. Whether nmr
  runs a repository whose root is the package is confirmed in step 4; the fallback is a one-package workspace.
- The `run-index.json` specification moves to the packages repository rather than staying in guidance.
- Open issues transfer by scope label; closed issues stay here.
- The deploy script keeps running the CLI built in the packages repository's `live` worktree, rather than the
  version that guidance pins, so that a CLI change still reaches the machine on a `live` advance alone.
