/** @noformat -- @generated. Do not edit. Compiled by rdy. */
/* eslint-disable */
export const __readyupVersion = "0.34.0";


// .readyup/kits/default.ts
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { defineRdyKit } from "readyup";
import { isRecord, readFile, readJsonFile, readJsonValue } from "readyup/check-utils";

// .readyup/lib/label-map-drift.ts
import { compareVersions } from "readyup/check-utils";
var ROOT_SCOPE_KEY = "root";
var RELEASE_KIT_VERSION_PATTERN = /release-kit-v(\d+\.\d+\.\d+)/;
function deriveExpectedScopeKeys(packageDirNames) {
  if (packageDirNames.length === 0) {
    return [];
  }
  return [...packageDirNames, ROOT_SCOPE_KEY].toSorted();
}
function describeScopeDrift(drift) {
  const parts = [];
  if (drift.missing.length > 0) {
    parts.push(`missing: ${drift.missing.join(", ")}`);
  }
  if (drift.extra.length > 0) {
    parts.push(`extra: ${drift.extra.join(", ")}`);
  }
  return parts.join("; ");
}
function diffScopeKeys(expected, actual) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  return {
    missing: expected.filter((key) => !actualSet.has(key)),
    extra: actual.filter((key) => !expectedSet.has(key))
  };
}
function isSchemaVersionBehind(pinnedVersion, installedVersion) {
  return compareVersions(pinnedVersion, installedVersion) < 0;
}
function parseReleaseKitVersion(schemaUrl) {
  return RELEASE_KIT_VERSION_PATTERN.exec(schemaUrl)?.[1];
}

// .readyup/kits/default.ts
var LABEL_MAP_PATH = ".meta/label-map.json";
var RELEASE_KIT_PACKAGE_JSON = "node_modules/@williamthorsen/release-kit/package.json";
var REGENERATE_FIX = "Run `codeassembly generate label-map --force` to regenerate the label map";
var default_default = defineRdyKit({
  checklists: [
    {
      name: "default",
      checks: [
        {
          name: ".meta/label-map.json exists",
          check: () => {
            const content = readFile(LABEL_MAP_PATH);
            return content !== void 0;
          },
          fix: "Run `codeassembly generate label-map` to create a starter label map"
        },
        {
          name: ".meta/label-map.json scopes match the workspace",
          severity: "error",
          check: () => {
            const map = readJsonFile(LABEL_MAP_PATH);
            if (map === void 0) {
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
          fix: REGENERATE_FIX
        },
        {
          name: ".meta/label-map.json $schema matches the installed release-kit",
          severity: "warn",
          skip: () => {
            if (readInstalledReleaseKitVersion() === void 0) {
              return "release-kit version could not be determined";
            }
            if (readPinnedReleaseKitVersion() === void 0) {
              return "$schema does not pin a release-kit version";
            }
            return false;
          },
          check: () => {
            const installed = readInstalledReleaseKitVersion();
            const pinned = readPinnedReleaseKitVersion();
            if (installed === void 0 || pinned === void 0) {
              return true;
            }
            if (isSchemaVersionBehind(pinned, installed)) {
              return { ok: false, detail: `pins v${pinned}, installed v${installed}` };
            }
            return true;
          },
          fix: REGENERATE_FIX
        }
      ]
    }
  ]
});
function listPackageDirNames() {
  let entries;
  try {
    entries = readdirSync("packages");
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  return entries.filter((entry) => statSync(join("packages", entry)).isDirectory());
}
function readInstalledReleaseKitVersion() {
  const packageJson = readJsonFile(RELEASE_KIT_PACKAGE_JSON);
  return typeof packageJson?.version === "string" ? packageJson.version : void 0;
}
function readPinnedReleaseKitVersion() {
  const schema = readJsonValue(LABEL_MAP_PATH, "$schema");
  return typeof schema === "string" ? parseReleaseKitVersion(schema) : void 0;
}
export {
  default_default as default
};
