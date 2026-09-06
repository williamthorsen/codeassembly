import { stringify } from 'yaml';

import { defaultKbConfig } from '../config/config-schema.ts';

// Renders the textual contents of a store's seed files. Every value is serialized from an in-package constant so a
// generated store can never drift from the bundled default; only the explanatory comment prose is hand-authored.

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

const PRETTIER_HEADER = `# Formatting configuration for this knowledge store.
#
# Neither option is stylistic. Each one prevents a specific failure, so read this before removing either.
#
# \`embeddedLanguageFormatting: off\` leaves a note's YAML frontmatter unformatted. Formatted, a long \`tags\` or
# \`addressed-by\` list breaks across several lines, which the note writer puts back onto one the next time it writes
# the note — so the formatter and the writer would rewrite each other's output without end.
#
# \`printWidth\` fixes the width rather than leaving it inherited. Prettier reads \`.editorconfig\` where a store has
# one and falls back to 80 where it does not, and this file outranks both.
#
`;

/**
 * The formatting options every store carries. Held here rather than in the seed prose, so that the file that a store
 * receives cannot diverge from the values that kb documents. See {@link renderPrettierSeed}'s header for what each
 * option prevents.
 */
export const canonicalPrettierConfig = {
  embeddedLanguageFormatting: 'off',
  printWidth: 120,
};

/** Renders `.kb/tag-aliases.yaml`: an empty `aliases: {}` map under an explanatory header. */
export function renderAliasesSeed(): string {
  return `${ALIASES_HEADER}aliases: {}\n`;
}

/** Renders `.kb/config.yaml`: a fully-commented stub whose example values are the live `defaultKbConfig`. */
export function renderConfigSeed(): string {
  return `${CONFIG_HEADER}${commentBlock(stringify(defaultKbConfig))}\n`;
}

/** Renders `.prettierrc.yaml`: the canonical formatting options under a header explaining why each one is set. */
export function renderPrettierSeed(): string {
  return `${PRETTIER_HEADER}${stringify(canonicalPrettierConfig)}`;
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
