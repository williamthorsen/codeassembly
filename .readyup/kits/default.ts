import { readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { defineRdyKit } from 'readyup';
import { isRecord, readFile, readJsonFile, readJsonValue } from 'readyup/check-utils';

import {
  deriveExpectedScopeKeys,
  describeScopeDrift,
  diffScopeKeys,
  isReleaseKitSchemaUrl,
  isSchemaVersionBehind,
  parseChangeGrammarVersion,
} from '../lib/label-map-drift.ts';

const LABEL_MAP_PATH = '.meta/label-map.json';
const CHANGE_GRAMMAR_PACKAGE_NAME = '@williamthorsen/change-grammar';
const RELEASE_KIT_DIR = 'node_modules/@williamthorsen/release-kit';
const REGENERATE_FIX = 'Run `codeassembly generate label-map --force` to regenerate the label map';

/**
 * Default internal rdy kit for the codeassembly monorepo.
 *
 * Diagnostic checks for files that this repo owns as the source of truth.
 * Generic monorepo and git checks are in upstream kits; see
 * williamthorsen/templates.node-monorepo and williamthorsen/git-recon.
 * Project-guidance checks are in the kit published by the `codeassembly` package,
 * which `.config/readyup.config.ts` names in its `packages` list.
 */
export default defineRdyKit({
  checklists: [
    {
      name: 'default',
      checks: [
        {
          name: '.meta/label-map.json exists',
          check: () => {
            const content = readFile(LABEL_MAP_PATH);
            return content !== undefined;
          },
          fix: 'Run `codeassembly generate label-map` to create a starter label map',
        },
        {
          name: '.meta/label-map.json scopes match the workspace',
          severity: 'error',
          check: () => {
            const map = readJsonFile(LABEL_MAP_PATH);
            if (map === undefined) {
              return true;
            }
            const actual = isRecord(map.scopes) ? Object.keys(map.scopes) : [];
            const expected = deriveExpectedScopeKeys(listPackageDirNames());
            const drift = diffScopeKeys(expected, actual);
            if (drift.missing.length === 0 && drift.extra.length === 0) {
              return true;
            }
            return { ok: false, detail: describeScopeDrift(drift) };
          },
          fix: REGENERATE_FIX,
        },
        {
          name: '.meta/label-map.json $schema matches the installed change-grammar',
          severity: 'warn',
          skip: () => {
            if (readInstalledChangeGrammarVersion() === undefined) {
              return 'change-grammar version could not be determined';
            }
            const schema = readSchemaUrl();
            if (
              schema === undefined ||
              (!isReleaseKitSchemaUrl(schema) && parseChangeGrammarVersion(schema) === undefined)
            ) {
              return '$schema does not pin a change-grammar version';
            }
            return false;
          },
          check: () => {
            const schema = readSchemaUrl();
            if (schema !== undefined && isReleaseKitSchemaUrl(schema)) {
              return { ok: false, detail: 'pins the release-kit schema, which moved to change-grammar' };
            }
            const installed = readInstalledChangeGrammarVersion();
            const pinned = schema === undefined ? undefined : parseChangeGrammarVersion(schema);
            if (installed === undefined || pinned === undefined) {
              return true;
            }
            if (isSchemaVersionBehind(pinned, installed)) {
              return { ok: false, detail: `pins v${pinned}, installed v${installed}` };
            }
            return true;
          },
          fix: REGENERATE_FIX,
        },
      ],
    },
  ],
});

/** Lists the immediate subdirectory names of `packages/`, or none when the directory is absent. */
function listPackageDirNames(): string[] {
  let entries: string[];
  try {
    entries = readdirSync('packages');
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  // stat follows symlinks, so symlinked package dirs count, matching the generated map; Dirent would drop them.
  return entries.filter((entry) => statSync(join('packages', entry)).isDirectory());
}

/**
 * Reads the version of `@williamthorsen/change-grammar` that the installed release-kit resolves, by walking up
 * from release-kit's real directory as Node's resolver does, or undefined when either package cannot be found.
 */
function readInstalledChangeGrammarVersion(): string | undefined {
  let dir: string;
  try {
    dir = realpathSync(RELEASE_KIT_DIR);
  } catch {
    return undefined;
  }
  for (;;) {
    const packageJson = readJsonFile(join(dir, 'node_modules', CHANGE_GRAMMAR_PACKAGE_NAME, 'package.json'));
    if (packageJson?.name === CHANGE_GRAMMAR_PACKAGE_NAME && typeof packageJson.version === 'string') {
      return packageJson.version;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

/** Reads the label map's `$schema` URL, or undefined when absent. */
function readSchemaUrl(): string | undefined {
  const schema = readJsonValue(LABEL_MAP_PATH, '$schema');
  return typeof schema === 'string' ? schema : undefined;
}
