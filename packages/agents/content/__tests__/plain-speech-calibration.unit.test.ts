import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// The calibration names the checking standard for the `plain-speech` unit, and the record keys a sweep's coverage on
// the version it declares. Nothing else ties that version to the rule the calibration calibrates, so a rule edit
// would otherwise leave every repository recorded as swept against a rule that has since changed.
//
// The pin below is what forces the look. A rule edit fails this suite until the author decides which of the two
// remedies applies, and the failure message states both.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;

const CALIBRATION = '_partials/plain-speech-calibration.md';
const RULE = '_partials/plain-speech.md';

/** The version the calibration declares, and the rule text that version was calibrated against. */
const PINNED_RULE_HASH = '65eb0a34c4da5a24e2c281be4339824c09efd30a70b072beefda325864296718';
const PINNED_VERSION = '1';

/** Matches the calibration's opening version marker, whose captured group is the version. */
const UNIT_VERSION_REGEX = /^<!--\s*unit-version:\s*plain-speech\s+(\S+)\s*-->$/m;

const DRIFT_MESSAGE =
  `${RULE} no longer matches the text that ${CALIBRATION} was calibrated against. Choose one remedy: ` +
  `bump the calibration's \`unit-version\` marker (and \`PINNED_VERSION\` here) where the rule's operative content ` +
  `moved, so every repository's record re-opens its plain-speech coverage for review; or re-pin ` +
  `\`PINNED_RULE_HASH\` alone where the edit left the operative content as it was.`;

describe('plain-speech calibration', () => {
  it('declares the pinned unit version', async () => {
    const declared = UNIT_VERSION_REGEX.exec(await readContentFile(CALIBRATION))?.[1];

    const message = `${CALIBRATION} must open with \`<!-- unit-version: plain-speech <version> -->\`; the skill reads the unit's version from that line`;
    expect(declared, message).toBe(PINNED_VERSION);
  });

  it('is calibrated against the rule as it stands', async () => {
    expect(hashText(await readContentFile(RULE)), DRIFT_MESSAGE).toBe(PINNED_RULE_HASH);
  });

  it('reports drift from a one-character change to the rule', async () => {
    const mutated = `${await readContentFile(RULE)} `;

    expect(hashText(mutated)).not.toBe(PINNED_RULE_HASH);
    expect(DRIFT_MESSAGE).toContain('bump');
    expect(DRIFT_MESSAGE).toContain('re-pin');
  });
});

// region | Helpers

/** Hashes a file's text, which is the whole file rather than its operative content: any edit at all reports drift. */
function hashText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Reads one content file by its path relative to the content root. */
async function readContentFile(relativePath: string): Promise<string> {
  return readFile(path.join(CONTENT_ROOT, relativePath), 'utf8');
}

// endregion | Helpers
