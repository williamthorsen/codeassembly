# Schemas

The package publishes a JSON Schema for each file format that its skills read. Each schema is versioned independently of the package.

| Schema        | Validates                              | Import path                                         |
| ------------- | -------------------------------------- | --------------------------------------------------- |
| `preferences` | `.agents/preferences.yaml`             | `codeassembly-guidance/schemas/preferences.v1.json` |
| `work-types`  | `content/skills/_data/work-types.json` | `codeassembly-guidance/schemas/work-types.v1.json`  |

## Identifiers

Each `$id` names the release that publishes the schema: `https://unpkg.com/codeassembly-guidance@<version>/schemas/<name>.v<N>.json`. A release on npm never changes, so the URL keeps resolving and always names the same schema. To validate without a network call, load the schema from the installed package under its import path.

An editor validates `.agents/preferences.yaml` through a modeline on its first line, which names the schema's `$id` or a path to the installed copy:

```yaml
# yaml-language-server: $schema=https://unpkg.com/codeassembly-guidance@<version>/schemas/preferences.v1.json
```

## Evolution policy

The `v<N>` in a file name is the schema's major version.

- Adding an optional field keeps the version.
- Removing, renaming, or re-typing a field bumps it. Widening a closed set of values counts as re-typing.
