<!-- readme-type: content -->

# codeassembly-guidance

The CodeAssembly library of agent guidance: rulebooks, skills, and subagents for coding harnesses, which the [`codeassembly`](../agents/README.md) CLI deploys into Claude Code and Rovo Dev.

<!-- section:release-notes --><!-- /section:release-notes -->

## Using the library

A declaration names the library as a source and selects artifacts from it, usually through a collection. For the home harness directories, clone the repository and declare its content directory in `~/.agents/codeassembly.yaml`:

```yaml
sources:
  - name: codeassembly-guidance
    path: ~/repos/codeassembly/packages/guidance/content
collections:
  use:
    - recommended
```

Then run `codeassembly install` and `codeassembly sync --global`. A project declares the same in its own `.agents/codeassembly.yaml` and runs `codeassembly sync`. [Project declaration](../agents/docs/project-declaration.md) documents the declaration format.

## What the content contains

`content/` is a content root, laid out as the `codeassembly` tool expects:

| Directory      | Contains                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| `collections/` | Named sets of artifacts: `recommended` is vetted and generally applicable, and `triage` is not yet examined |
| `guidance/`    | Rulebooks, and the harness guidance templates that `install` deploys                                        |
| `skills/`      | Skills, and the support files under `skills/_data/` that they read at runtime                               |
| `subagents/`   | Subagent definitions                                                                                        |
| `scripts/`     | Shell scripts and helper bundles that `install` deploys into each harness's `scripts/` directory            |
| `_partials/`   | Text that the expander inlines into several artifacts at deploy time                                        |

## Adding or changing content

The `codeassembly-content-specification` rulebook ([`content/guidance/rulebooks/codeassembly-content-specification.md`](content/guidance/rulebooks/codeassembly-content-specification.md)) is the authoring contract: frontmatter fields, dependencies, invocation tokens, and naming. [`_partials/README.md`](content/_partials/README.md) covers shared text.

A skill that needs more than a few lines of shell runs a TypeScript helper. Its source lives under `src/`, `content/codeassembly-content.yaml` declares it, and `codeassembly bundle-helpers` builds it into a tracked `.mjs` bundle beside the skill. Commit a helper's source change together with its rebuilt bundle.

The package's `check` runs the tests, then `codeassembly validate` and `codeassembly bundle-helpers --check`, which fail on content that would be deployed to a consumer broken and on a bundle that is stale.

## Preferences

Agent behavior is configured through `.agents/preferences.yaml` files. The resolution cascade is:

1. **Project**: `.agents/preferences.yaml` in the repository root (committed, shared with team)
2. **Global**: `~/.agents/preferences.yaml` in the user's home directory (personal defaults)
3. **Default**: built-in fallback (documented per key in [Preferences](docs/preferences.md))

Project-level values take precedence over global, key by key within each section: A project `ticket` section that sets only `title_format` keeps the global `ticket.base_url`. A map-valued key inside a section, such as `artifacts.paths` or `repository.default_remote`, is one value, which a project value replaces whole. An explicitly empty value at the project level (e.g., `title_format: ''`) overrides a non-empty global value.

The package publishes a JSON Schema for the file; [Schemas](docs/schemas.md) gives its identifier and versioning. To validate preferences files in a repository's own checks, install this package and run its bin on them; [Validation](docs/preferences.md#validation) states its options and rules.

```sh
codeassembly-validate-preferences --strict .agents/preferences.yaml
```

## Helper reference

- [Prose sweep helper](docs/revise-prose-helper.md): the sweep that the `revise-prose` skill runs.
- [Backlog sweep helper](docs/groom-backlog-helper.md): the helper that the `groom-backlog` skill runs.
- [Next-ticket helper](docs/pull-from-backlog-helper.md): the helper that the `pull-from-backlog` skill runs.
- [Prototype index helper](docs/index-prototypes-helper.md): the helper that the `index-prototypes` skill runs.
- [Guidance streamlining helper](docs/streamline-guidance-helper.md): the helper that the `streamline-guidance` skill runs.
- [Findings triage helper](docs/triage-spike-findings-helper.md): the helper that the `triage-spike-findings` skill runs.
- [Code-health helper](docs/assess-code-health-helper.md): the helper that the `assess-code-health` skill runs.
- [Feedback triage helpers](docs/triage-feedback-helper.md): the helpers that the `triage-feedback` skill runs.
