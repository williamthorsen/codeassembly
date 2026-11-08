/**
 * Turns a draft key into a state's name: each run of `_`, `-`, or whitespace becomes one space, and the first character
 * is uppercased, so that `open_the_PR` becomes `Open the PR`. Returns undefined for a key that contains no other
 * character.
 */
export function formatStateName(key: string): string | undefined {
  const words = key.replaceAll(/[\s_-]+/g, ' ').trim();
  if (words === '') return undefined;
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}
