# Bundling helpers

A helper is a TypeScript program that a skill, a subagent, or a harness runs with `node`. It deploys to a directory outside the repository that produced it, where none of its dependencies are installed, so a content root ships each helper as a self-contained `.mjs` bundle beside the content that invokes it. `codeassembly bundle-helpers` builds those bundles, and `--check` confirms that the committed ones are current.

## Declaring helpers

A content root declares its helpers under `helpers:` in the `codeassembly-content.yaml` at its top level. Each entry names the helper's `entry` module and the bundle's `out` path, both relative to the manifest's directory:

```yaml
# content/codeassembly-content.yaml
format: 2

helpers:
  - entry: ../src/kb-add/cli.ts
    out: skills/kb-add/kb-add.mjs
  - entry: ../src/describe-change/cli.ts
    out: scripts/describe-change.mjs
```

The helper source usually lives beside the content root rather than inside it, so `entry` usually begins with `../`. Each `out` must be a `.mjs` inside the content root, and two helpers cannot share one. The command refuses a manifest that breaks either rule, naming the entry.

A bundle's directory follows its consumer: A skill's helper goes in that skill's directory, and a helper that is not owned by any single skill goes in `scripts/`.

Only `bundle-helpers` reads `helpers:`. `sync`, `install`, and `validate` ignore it, so a malformed list never stops a deployment, and adding the key does not require a new content format.

## Building

```sh
codeassembly bundle-helpers --content content
```

The command bundles each helper to its `out` path. The content root comes from `--content <dir>`, otherwise from `codeassembly.content` in `./package.json`, as for `validate`. A root without a manifest or without `helpers:` builds nothing.

The esbuild options belong to the tool, not to the repository: ESM for the `node` platform at `es2022`, minified with names kept, with a banner that defines `require` for CommonJS dependencies, and resolving workspace packages through their `source` export condition. Because the options are fixed, every content repository bundles the same way and a bundle's bytes depend only on its source and the esbuild version.

The bundles are tracked files. Commit a helper's source change together with its rebuilt bundle.

## Checking

```sh
codeassembly bundle-helpers --content content --check
```

`--check` builds every helper into a temporary directory, compares the result with what git records at `HEAD`, and writes nothing. It compares with `HEAD` rather than the working tree because a build rewrites the working tree in place. It fails, listing each bundle, when a bundle:

- differs from a fresh build,
- is declared but not recorded at `HEAD`, or
- is a tracked `.mjs` under the content root that no helper produces.

The check needs the content root to be inside a git work tree with at least one commit, and it fails naming the root otherwise. A repository that runs it in CI keeps its committed bundles in step with their source.

## The esbuild peer

`esbuild` is an optional peer dependency of `codeassembly`. A repository that only consumes guidance through `sync` or `install` does not install it. A repository that builds helpers adds it as a devDependency, within the range that `codeassembly` declares in `peerDependencies`. Without it, `bundle-helpers` fails and names the package and range to add. A content root without helpers can run `--check` without esbuild, since there is nothing to build.

The repository's lockfile pins the esbuild version, so `--check` is stable within a repository. Upgrading esbuild can change a bundle's bytes, so rebuild and commit the bundles in the same change.
