import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { defineRdyKit } from 'readyup';
import { isRecord, readFile, readJsonFile, readJsonValue } from 'readyup/check-utils';

import {
  deriveExpectedScopeKeys,
  describeScopeDrift,
  diffScopeKeys,
  isSchemaVersionBehind,
  parseReleaseKitVersion,
} from '../lib/label-map-drift.ts';

const LABEL_MAP_PATH = '.meta/label-map.json';
const RELEASE_KIT_PACKAGE_JSON = 'node_modules/@williamthorsen/release-kit/package.json';
const REGENERATE_FIX = 'Run `codeassembly generate label-map --force` to regenerate the label map';

/**
 * Default internal rdy kit for the codeassembly monorepo.
 *
 * Diagnostic checks for files this repo owns as the source of truth.
 * Generic monorepo and git checks live in upstream kits — see
 * williamthorsen/templates.node-monorepo and williamthorsen/git-recon.
 * Project-guidance checks live in the kit the `codeassembly` package publishes,
 * reached through the `packages` list in `.config/readyup.config.ts`.
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
          name: '.meta/label-map.json $schema matches the installed release-kit',
          severity: 'warn',
          skip: () => {
            if (readInstalledReleaseKitVersion() === undefined) {
              return 'release-kit version could not be determined';
            }
            if (readPinnedReleaseKitVersion() === undefined) {
              return '$schema does not pin a release-kit version';
            }
            return false;
          },
          check: () => {
            const installed = readInstalledReleaseKitVersion();
            const pinned = readPinnedReleaseKitVersion();
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
  // stat follows symlinks so symlinked package dirs count, matching the generated map; Dirent would drop them.
  return entries.filter((entry) => statSync(join('packages', entry)).isDirectory());
}

/** Reads the installed `@williamthorsen/release-kit` version, or undefined when it cannot be resolved. */
function readInstalledReleaseKitVersion(): string | undefined {
  const packageJson = readJsonFile(RELEASE_KIT_PACKAGE_JSON);
  return typeof packageJson?.version === 'string' ? packageJson.version : undefined;
}

/** Reads the release-kit version pinned in the label map's `$schema`, or undefined when absent. */
function readPinnedReleaseKitVersion(): string | undefined {
  const schema = readJsonValue(LABEL_MAP_PATH, '$schema');
  return typeof schema === 'string' ? parseReleaseKitVersion(schema) : undefined;
}
