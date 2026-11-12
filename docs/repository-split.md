# Splitting the monorepo into three repositories

## Purpose

This repository holds two kinds of thing that have different audiences:

- the guidance library (`packages/guidance`), consumed on each developer machine as a clone and by projects as an
  npm dependency;
- the publishable packages (`packages/agents`, `packages/kb`, `packages/run-core`), published to npm with provenance,
  which requires a public source repository.

The split gives each kind its own repository, beside a private one for AI-driven coding applications:

| Repository                             | Visibility | Contents                                                                              |
| -------------------------------------- | ---------- | ------------------------------------------------------------------------------------- |
| `williamthorsen/codeassembly`          | public     | `codeassembly` CLI, `@williamthorsen/kb`, `codeassembly-run-core`, API specifications |
| `williamthorsen/codeassembly-guidance` | public     | the `codeassembly-guidance` library and its helper sources                            |
| `williamthorsen/codeassembly-studio`   | private    | AI-driven coding applications, starting with the Prompt Logic Viewer                  |

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

A pnpm workspace whose one package stays at `packages/guidance`, so that the deployed path on a machine is
`~/repos/oss/codeassembly-guidance.live/packages/guidance/content`, and so that a second package doesn't move it.

- `codeassembly` and `@williamthorsen/kb` move from `workspace:*` to pinned npm versions.
- The helper bundles stay tracked build output, so a clone deploys without an install. A bundle that embeds
  `package.json` is rebuilt once, because the manifest names the new repository.
- The repository's own `.agents/codeassembly.yaml` keeps its sources, as it does now.
- `codeassembly-repo-conventions` (now `.agents/content/guidance/rulebooks/`) moves here, because it describes the
  library.
- `scripts/codeassembly-sync-live.sh` and `docs/live-deployment.md` move here. The script advances this repository's
  `live` and builds it, then builds the packages repository's `live` worktree without advancing it, and deploys with
  that worktree's binary. It finds that worktree at the sibling path `codeassembly.live` or at the path that
  `CODEASSEMBLY_LIVE_DIR` names.
- The release workflow, `.meta/changelog.json`, `CHANGELOG.md`, and the `codeassembly-guidance-v*` tags carry over, so
  the npm path keeps working. npm trusted publishing moves to this repository's `publish.yaml`, and the packages
  repository stops releasing guidance.
- The root files are copied from the packages repository and narrowed to one package; the new repository's
  `AGENTS.md` describes them.

### `codeassembly` (packages)

The current repository minus the extracted trees. It keeps the pnpm workspace, nmr, the publish and release workflows,
and the root `CHANGELOG.md`.

- `codeassembly-run-core` drops `private: true` and is published, so that a repository outside this one can consume it.
- The `run-index.json` specification is in `packages/run-core/docs/run-data-format.md`, beside the Zod schemas that
  implement it, and guidance's `artifact-conventions.md` points at it. Nothing mechanical ties the two; the split
  makes the gap a cross-repository one, so the spec lives with the implementation.
- The repository consumes guidance as a `package: codeassembly-guidance` source rather than a path, which makes it
  the first consumer of the npm path.

### `codeassembly-studio`

A private pnpm workspace with nmr, holding AI-driven coding applications, starting with the Prompt Logic Viewer. It
does not take the factory or the demos, which were removed from this repository rather than extracted; see
[Reviving the factory](#reviving-the-factory).

## Extraction method

The guidance repository is created from this one with `git filter-repo`, keeping the history of `packages/guidance/`
at the same path, together with each file's earlier paths, chiefly under `packages/agents/` before the library became
its own package. From the extraction on, `packages/guidance` here is frozen, and the tree is deleted here in one
commit, after every machine deploys from the new repository.

Open `scope:guidance` issues are transferred with `gh issue transfer`; closed issues stay. The open `scope:factory`
issues were closed as not planned when the factory was removed, and the `scope:factory` label is archived rather than
deleted, so that it stays on them.

## Reviving the factory

The factory (`packages/factory`) and the demos (`demos/`) stay in this repository's history. The extraction base is the
last commit that contains them, the parent of the commit that removed `packages/factory`:

```sh
git rev-parse "$(git log --max-count=1 --format=%H -- packages/factory)^"
```

Restore the trees from that commit with `git restore --source=<commit> -- packages/factory demos`, or extract them with
their history into a repository of their own by `git filter-repo`.

## Machine and config changes

A machine deploys guidance in one of two modes, which `codeassembly-sync-live` chooses by whether the clone has a
`live` worktree:

- **Developer**, on a machine that develops guidance: The machine deploys from the `codeassembly-guidance.live`
  worktree with the CLI built in this repository's `live` worktree, and links `@williamthorsen/kb` from
  `codeassembly.live/packages/kb`.
- **Consumer**, on any other machine: The machine deploys from the clone kept on `main`, and takes the CLI and
  `@williamthorsen/kb` from npm. It does not need a `live` worktree or a clone of this repository.

The base-only `~/.agents/codeassembly.yaml` in the configs repository names the consumer path, and a developer profile
or a machine whose clone lives elsewhere overrides it in `~/.agents/codeassembly.local.yaml`. The configs repository's
`prepare-codeassembly-guidance` makes a machine match its declaration: It clones the repository, adds the `live`
worktree on a developer machine, links `codeassembly-sync-live`, and with `--deploy` deploys and checks the result. The
configs repository's README, section "Installing on a new Mac", and `docs/live-deployment.md` in the guidance
repository describe both.

## Known costs

- **Two `live` branches advance separately.** A machine deploys guidance from one worktree and the CLI from another,
  and a deploy that needs both changes advances both. The sync command advances only the guidance one.
- **Cross-repository changes need two PRs.** About 5% of recent commits, per the count above.
- **Three sets of CI, labels, and dependency upgrades** instead of one.

## Order of work

The factory and the demos leave first, so that this repository holds only material meant to be public as early as
possible, and the guidance extraction, which touches every machine, follows on its own.

1. Publish `codeassembly-run-core`: drop `private: true` and release it.
2. Remove the factory and the demos here, and close the open `scope:factory` issues as not planned.
3. Prepare the guidance extraction in place: move the `run-index.json` spec next to run-core, and confirm that the
   guidance package builds with pinned npm versions of `codeassembly` and `@williamthorsen/kb` instead of
   `workspace:*`. Confirm also that `nmr ci` passes on a scratch `git filter-repo` extraction of `packages/guidance`
   flattened to the root.
4. Extract the guidance repository: filter-repo, keep `packages/guidance` at its path, carry the workflows over, get
   CI green, move npm trusted publishing, publish a version from the new repository, and stop releasing guidance
   here.
5. Switch the machines: the configs PR, then `prepare-codeassembly-guidance` and one deploy on each machine.
6. Remove the guidance tree here, switch this repository to the `package:` guidance source, and transfer the open
   `scope:guidance` issues. Update the references here that name guidance content or paths: the
   `codeassembly-repo-conventions` rulebook and the `codeassembly-repo` source in `.agents/codeassembly.yaml`, the
   `docs/live-deployment.md` link in `README.md`, the `packages/guidance` pointers in `AGENTS.md`, and the example
   path in `packages/agents/src/lib/declared-sources.ts`.

Step 3 can start as soon as step 1 is merged. Step 6 waits for the guidance repository to be green and deployed, so
that nothing is deleted before its new home works.

## Decisions taken

- The new repositories are named `codeassembly-guidance` and `codeassembly-studio`.
- The guidance repository is a one-package workspace with the package at `packages/guidance`, rather than a flat
  package at the root, which the extraction first planned: The workspace does no harm with one package and is ready
  for the next, and a later conversion would move the deployed path on every machine. A scratch extraction in the flat
  layout had passed `nmr ci`; the extraction itself passed `nmr ci` in the workspace layout.
- The extraction keeps each file's earlier paths, so that the history reaches back before the library was its own
  package, and the triage check of whether guidance changed after a feedback capture keeps working for captures made
  before the split. Commit messages are not rewritten.
- Only the `codeassembly-guidance-v*` tags carry over; the other packages' tags would point at commits that never
  released them.
- The deploy script builds the packages repository's `live` worktree as well as running its binary, because once the
  guidance tree leaves this repository, no other command builds that worktree.
- `packages/guidance` here is frozen from the extraction until its removal; `AGENTS.md` says so, rather than a CI
  check.
- The `run-index.json` specification moves to the packages repository rather than staying in guidance.
- The factory and the demos are removed rather than extracted: Extraction would not make their history private, and
  the factory is dormant.
- Open `scope:guidance` issues transfer to the guidance repository; closed issues stay here.
- In the developer mode, the deploy script keeps running the CLI built in the packages repository's `live` worktree,
  rather than the version that guidance pins, so that a CLI change still reaches the machine on a `live` advance alone.
- A machine that does not develop guidance deploys from a clone on `main`, with the CLI and kb from npm, because the
  `live` worktrees exist to stage changes that the machine's developer makes.
- The base declaration names the consumer path, and developer profiles override it in `codeassembly.local.yaml`
  rather than in a variant of the base-only file, so that a machine without a profile works and a variant does not
  drop the base's rulebooks and collections.
