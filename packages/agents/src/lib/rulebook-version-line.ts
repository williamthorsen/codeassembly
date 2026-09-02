/**
 * The one grammar for the line naming a delivered rulebook's version. Every route that puts a rulebook in front of an
 * agent -- an ambient block, a guidance-hook fill, a rulebook skill file -- renders it here, so a reader meets one
 * form and the provenance recipe is checked against a single producer.
 */

/**
 * Renders the version line for a rulebook, or an empty string when it declares no version. The line carries no slug:
 * It is written directly below the marker that names one.
 */
export function renderRulebookVersionLine(version: string | undefined): string {
  return version === undefined ? '' : `<!-- rulebook-version: ${version} -->`;
}
