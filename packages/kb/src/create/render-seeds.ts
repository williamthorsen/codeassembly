import { stringify } from 'yaml';

import { defaultKbConfig } from '../config/config-schema.ts';
import { defaultSchema } from '../schema/default-schema.ts';

// Renders the textual contents of the three `.kb/` seed files for a new store. The schema and config values are
// serialized from the in-package constants (`defaultSchema`, `defaultKbConfig`) so a generated store can never drift
// from the bundled defaults; only the explanatory comment prose is hand-authored.

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

const SCHEMA_HEADER = `# Schema for this knowledge store.
#
# This file overrides the bundled default schema outright (the override is a replacement, not a merge). Each record
# type declares its required and optional fields plus its recall policy; a record's family is the
# stored \`recordType\` discriminant.
#
# Date fields (created, updated, last-verified) are written as second-precision UTC timestamps
# (YYYY-MM-DDTHH:MM:SSZ); bare YYYY-MM-DD dates remain valid for hand-authored and legacy notes.
#
# Safe to edit: add record types, or add optional fields. Do NOT remove or rename the default record types or their
# required fields — the kb-* skills (kb-add, capture-event, kb-edit) depend on them. Delete this file to re-inherit
# the bundled default.
`;

/** Renders `.kb/tag-aliases.yaml`: an empty `aliases: {}` map under an explanatory header. */
export function renderAliasesSeed(): string {
  return `${ALIASES_HEADER}aliases: {}\n`;
}

/** Renders `.kb/config.yaml`: a fully-commented stub whose example values are the live `defaultKbConfig`. */
export function renderConfigSeed(): string {
  return `${CONFIG_HEADER}${commentBlock(stringify(defaultKbConfig))}\n`;
}

/** Renders `.kb/schema.yaml`: the bundled default record types, serialized, under an explanatory header. */
export function renderSchemaSeed(): string {
  return `${SCHEMA_HEADER}${stringify({ recordTypes: defaultSchema.recordTypes })}`;
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
