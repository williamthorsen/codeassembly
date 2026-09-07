import { stringify } from 'yaml';

import { defaultKbConfig } from '../config/config-schema.ts';

// Renders the textual contents of a store's seed files. A value that kb also holds as a constant is serialized from
// it, so a generated store can never drift from the bundled default; the explanatory comment prose and the
// `.editorconfig` body are hand-authored.

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

const EDITORCONFIG_SEED = `root = true

[*]
charset = utf-8
end_of_line = lf
indent_size = 2
indent_style = space
insert_final_newline = true
max_line_length = 120
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
`;

const PRETTIER_HEADER = `# Formatting configuration for this knowledge store.
#
# The single option here is not stylistic. It prevents a specific failure, so read this before removing it.
#
# \`embeddedLanguageFormatting: off\` leaves a note's YAML frontmatter unformatted. Formatted, a long \`tags\` or
# \`addressed-by\` list breaks across several lines, which the note writer puts back onto one the next time it writes
# the note, so the formatter and the writer would rewrite each other's output without end.
#
# Width, indentation, and line endings are set in \`.editorconfig\`, which Prettier reads and every editor reads too.
#
`;

/**
 * The formatting option every store carries that `.editorconfig` cannot express. Held here rather than in the seed
 * prose, so that the file that a store receives cannot diverge from the value that kb documents. See
 * {@link renderPrettierSeed}'s header for what it prevents.
 */
export const canonicalPrettierConfig = {
  embeddedLanguageFormatting: 'off',
};

/** Renders `.kb/tag-aliases.yaml`: an empty `aliases: {}` map under an explanatory header. */
export function renderAliasesSeed(): string {
  return `${ALIASES_HEADER}aliases: {}\n`;
}

/** Renders `.kb/config.yaml`: a fully-commented stub whose example values are the live `defaultKbConfig`. */
export function renderConfigSeed(): string {
  return `${CONFIG_HEADER}${commentBlock(stringify(defaultKbConfig))}\n`;
}

/** Renders `.editorconfig`: the editor and formatter settings every store shares. */
export function renderEditorconfigSeed(): string {
  return EDITORCONFIG_SEED;
}

/** Renders `.prettierrc.yaml`: the canonical formatting option under a header explaining why it is set. */
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
