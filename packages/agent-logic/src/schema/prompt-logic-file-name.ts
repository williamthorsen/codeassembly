/** Returns the name without a trailing prompt-logic suffix, new or legacy, or the name itself. */
export function dropPromptLogicSuffix(name: string): string {
  const suffix = SUFFIXES.find((candidate) => name.endsWith(candidate));
  return suffix === undefined ? name : name.slice(0, -suffix.length);
}

/** Reports whether the name ends in `.prompt-logic.json` or `.agent-logic.json` after a non-empty base. */
export function isPromptLogicFileName(name: string): boolean {
  return SUFFIXES.some((suffix) => name.length > suffix.length && name.endsWith(suffix));
}

/** The suffix that names a prompt-logic file in a store and in a download. */
export const PROMPT_LOGIC_SUFFIX = '.prompt-logic.json';

// region | Helpers
/** The suffix of a prompt-logic file written before the file took its current name, which the package still reads. */
const LEGACY_SUFFIX = '.agent-logic.json';

const SUFFIXES = [PROMPT_LOGIC_SUFFIX, LEGACY_SUFFIX];
// endregion | Helpers
