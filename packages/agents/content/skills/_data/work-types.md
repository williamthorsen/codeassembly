# Work types

Use these categories to describe the work done in a commit.

The short `WORK_TYPE` form should be used in commit messages.

The longer "Category" form should be used in any other documentation.

| `WORK_TYPE`  | Category               | Description                                                                                 |
| ------------ | ---------------------- | ------------------------------------------------------------------------------------------- |
| 1. PRIMARY   |
| `fix`        | Fixes                  | Fixes to broken PRIMARY functionality; fixes in any other category belongs to that category |
| `feat`       | Features               | Additions, enhancements, or removals of consumer-facing features.                           |
| `internal`   | Internal functionality | Additions, enhancements, or removals of internal (not consumer-facing) functionality        |
| 2. SECONDARY |
| `refactor`   | Refactoring            | Internal improvements with no consumer-facing changes                                       |
| `tests`      | Tests                  | Test-only changes, no source code modifications                                             |
| 3. TERTIARY  |
| `tooling`    | Tooling                | Development configs, scripts, manifests                                                     |
| `ci`         | CI                     | CI pipeline and supporting CI-only files                                                    |
| `deps`       | Dependencies           | Dependency updates, runtime upgrades, dependency configs                                    |
| `ai`         | AI                     | AI agent rules and AI-specific configurations                                               |
| `docs`       | Documentation          | Documentation and code comments only                                                        |
| `fmt`        | Formatting             | Reformatting with no effect on code execution (e.g., Prettier fixes, import ordering)       |

If a commit comprises multiple work types, use the highest-listed applicable work type from the above table.

If the work causes a breaking change, append a bang: e.g., `feat!`, 'deps!'.
Only PRIMARY work can cause a breaking change.

Special note: Instructions for AI agents (typically in Markdown format) should be treated equivalently to source code,
not as documentation. Such instructions intended for use by other projects are considered consumer-facing.
