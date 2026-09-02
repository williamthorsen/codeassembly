/**
 * The one grammar for the line naming a delivered rulebook's version. Every route that puts a rulebook in front of an
 * agent -- an ambient block, a guidance-hook fill, a rulebook skill file -- renders it here, so a reader meets one
 * form and the provenance recipe is checked against a single producer.
 */

/**
 * Renders the version line for a rulebook as a one-entry list, or an empty list when it declares no version, so a
 * caller splices the result in rather than testing it. The line carries no slug: It is written directly below the
 * marker that names one.
 */
export function renderRulebookVersionLines(version: string | undefined): ReadonlyArray<string> {
  return version === undefined ? [] : [`<!-- rulebook-version: ${version} -->`];
}
