# Deploying guidance from the live worktree

On a CodeAssembly developer's machine, the deployed guidance comes from the worktree checked out on the `live` branch (`~/repos/projects/codeassembly.live` beside the main worktree). `codeassembly-sync-live` fast-forwards `live` to a commit and deploys from it in one command.

## Setup

Link the command onto `PATH` once:

```bash
ln -s ~/repos/projects/codeassembly.live/scripts/codeassembly-sync-live.sh ~/.local/bin/codeassembly-sync-live
```

The link points into the `live` worktree, so the command updates itself whenever `live` advances.

## Usage

```bash
codeassembly-sync-live            # advance live to origin/main and deploy
codeassembly-sync-live 5bab2e28   # advance live to a specific commit and deploy
```

The command runs from any directory. It fetches `origin`, fast-forwards `live` to the commit, then installs dependencies, builds every package, and deploys with the `live` worktree's own `codeassembly install` and `codeassembly sync --global`. It refuses, leaving `live` unchanged, when the ref is unknown, when `live` cannot fast-forward, or when the `live` worktree has uncommitted changes. When a deploy step fails after `live` has advanced, rerunning the command completes the deploy. `codeassembly-sync-live --help` lists the exit codes.

## Why it deploys from the live worktree's build

A developer deploys the code on `live`, not the published `codeassembly` package, so the command runs the `live` worktree's own binary rather than one found on `PATH` or through `npx`. That binary is also the one that a [`home-writer`](../packages/agents/docs/project-declaration.md#designated-home-domain-writer) setting designates, and the home-domain provenance records its version and commit.

The command passes `--force` to `install`, because `install` otherwise skips files written by CodeAssembly itself that it reads as user-modified ([#2012](https://github.com/williamthorsen/codeassembly/issues/2012)). It passes `--link`, so the deployed scripts point into the `live` worktree and follow it between installs.

Consumers of CodeAssembly do not need this command: They deploy with `npx codeassembly install` and `npx codeassembly sync --global`, as the [agents README](../packages/agents/README.md) describes.
