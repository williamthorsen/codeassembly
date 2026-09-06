import { stringify } from 'yaml';

import { defaultKbConfig } from '../config/config-schema.ts';

// Renders the textual contents of the two `.kb/` seed files for a new store. The config values are serialized from the
// in-package `defaultKbConfig` constant so a generated store can never drift from the bundled default; only the
// explanatory comment prose is hand-authored.

const ALIASES_HEADER = `# Tag aliases for this knowledge store.
#
# Map each canonical tag to the aliases that should resolve to it, for example:
#   aliases:
#     typescript: [ts, type-script]
# The \`aliases:\` key is required even when empty.
`;

const CONFIG_HEADER = `# Check configuration for this knowledge store.
#
# Both keys are optional and fall back to the defaults shown below; an absent file uses these defaults too. Uncomment
# and edit to override. \`targets\` selects which notes \`kb check\` enumerates and \`exclude\` removes matches;
# patterns are slash-separated and relative to the store root.
#
`;

/** Renders `.kb/tag-aliases.yaml`: an empty `aliases: {}` map under an explanatory header. */
export function renderAliasesSeed(): string {
  return `${ALIASES_HEADER}aliases: {}\n`;
}

/** Renders `.kb/config.yaml`: a fully-commented stub whose example values are the live `defaultKbConfig`. */
export function renderConfigSeed(): string {
  return `${CONFIG_HEADER}${commentBlock(stringify(defaultKbConfig))}\n`;
}

// region | Helpers

/** Prefixes every line with a YAML comment marker, emitting a bare `#` for blank lines. */
function commentBlock(text: string): string {
  return text
    .trimEnd()
    .split('\n')
    .map((line) => (line === '' ? '#' : `# ${line}`))
    .join('\n');
}

// endregion | Helpers
