module.exports = {
  filterResults,
  reject,
};

/**
 * Returns true if the upgraded version of the package should be included in available upgrades.
 *
 * @param {string} packageName
 * @param {VersioningMetadata} versioningMetadata
 * @returns {boolean} - true if the package should be included
 */
function filterResults(packageName, versioningMetadata) {
  if (packageName === '@types/node' && Number.parseInt(versioningMetadata.upgradedVersionSemver.major) > 24) {
    return false;
  }

  // tsx 4.22.x breaks CJS require() of .json files (e.g. ajv/dist/refs/data.json),
  // crashing the MCP stdio smoke test. Tracked in
  // https://github.com/williamthorsen/codeassembly/issues/612 — re-allow once a fixed
  // version ships and the ticket is resolved.
  if (
    packageName === 'tsx' &&
    versioningMetadata.upgradedVersionSemver.major === '4' &&
    versioningMetadata.upgradedVersionSemver.minor === '22'
  ) {
    return false;
  }

  return true;
}

/**
 * Returns true if no check for available upgrades should be made for the package.
 *
 * @param {string} _packageName
 * @param {SemVer[]} versionRanges
 * @returns {boolean} - true if the package should be excluded
 *
 * @todo: When can `versionRanges` can have more than one element?
 */
function reject(_packageName, versionRanges) {
  const [versionRange] = versionRanges;

  if (!versionRange) return false;

  return false;
}

// region | Types
/**
 * @typedef {Object} SemVer
 * @property {string} semver
 * @property {string} major
 * @property {string} minor
 * @property {string} patch
 */

/**
 * @typedef {Object} VersioningMetadata
 * @property {string} currentVersion
 * @property {SemVer[]} currentVersionSemver
 * @property {string} upgradedVersion
 * @property {SemVer} upgradedVersionSemver
 */
// endregion | Types
