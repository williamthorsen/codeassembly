/** @noformat -- @generated. Do not edit. Compiled by rdy. */
/* eslint-disable */
export const __readyupVersion = "0.40.0";


// .readyup/kits/default.ts
import { readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { defineRdyKit } from "readyup";
import { isRecord, readFile, readJsonFile, readJsonValue } from "readyup/check-utils";

// .readyup/lib/label-map-drift.ts
import { compareVersions } from "readyup/check-utils";
var ROOT_SCOPE_KEY = "root";
var CHANGE_GRAMMAR_VERSION_PATTERN = /change-grammar-v(\d+\.\d+\.\d+)/;
var RELEASE_KIT_SCHEMA_PATTERN = /\/release-kit-v[^/]+\/packages\/release-kit\/schemas\//;
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
function isReleaseKitSchemaUrl(schemaUrl) {
  return RELEASE_KIT_SCHEMA_PATTERN.test(schemaUrl);
}
function isSchemaVersionBehind(pinnedVersion, installedVersion) {
  return compareVersions(pinnedVersion, installedVersion) < 0;
}
function parseChangeGrammarVersion(schemaUrl) {
  return CHANGE_GRAMMAR_VERSION_PATTERN.exec(schemaUrl)?.[1];
}

// .readyup/kits/default.ts
var LABEL_MAP_PATH = ".meta/label-map.json";
var CHANGE_GRAMMAR_PACKAGE_NAME = "@williamthorsen/change-grammar";
var RELEASE_KIT_DIR = "node_modules/@williamthorsen/release-kit";
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
          name: ".meta/label-map.json $schema matches the installed change-grammar",
          severity: "warn",
          skip: () => {
            if (readInstalledChangeGrammarVersion() === void 0) {
              return "change-grammar version could not be determined";
            }
            const schema = readSchemaUrl();
            if (schema === void 0 || !isReleaseKitSchemaUrl(schema) && parseChangeGrammarVersion(schema) === void 0) {
              return "$schema does not pin a change-grammar version";
            }
            return false;
          },
          check: () => {
            const schema = readSchemaUrl();
            if (schema !== void 0 && isReleaseKitSchemaUrl(schema)) {
              return { ok: false, detail: "pins the release-kit schema, which moved to change-grammar" };
            }
            const installed = readInstalledChangeGrammarVersion();
            const pinned = schema === void 0 ? void 0 : parseChangeGrammarVersion(schema);
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
function readInstalledChangeGrammarVersion() {
  let dir;
  try {
    dir = realpathSync(RELEASE_KIT_DIR);
  } catch {
    return void 0;
  }
  for (; ; ) {
    const packageJson = readJsonFile(join(dir, "node_modules", CHANGE_GRAMMAR_PACKAGE_NAME, "package.json"));
    if (packageJson?.name === CHANGE_GRAMMAR_PACKAGE_NAME && typeof packageJson.version === "string") {
      return packageJson.version;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return void 0;
    }
    dir = parent;
  }
}
function readSchemaUrl() {
  const schema = readJsonValue(LABEL_MAP_PATH, "$schema");
  return typeof schema === "string" ? schema : void 0;
}
export {
  default_default as default
};
