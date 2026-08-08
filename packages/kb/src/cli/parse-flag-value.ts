// The `kb` CLI's flag-value grammar, shared so every command accepts a value the same way.
//
// Each value-taking flag supports both the space form (`--kb x`) and the equals form (`--kb=x`). A command's own
// parser decides which flags exist; these two decide what a value looks like once one is found.

/** Reads the value from an inline flag (`--kb=x`), throwing when it is empty. */
export function takeInlineValue(arg: string, prefix: string): string {
  const value = arg.slice(prefix.length);
  if (value === '') {
    throw new Error(`${prefix.replace(/=$/, '')} requires a value`);
  }
  return value;
}

/**
 * Reads the value after a space-form flag (`--kb x`), throwing when it is missing, empty, or looks like another flag.
 * An empty value is rejected on both forms, so the two spellings of a flag accept the same set of values.
 */
export function takeValue(argv: readonly string[], index: number, flag: string): string {
  const next = argv[index + 1] ?? null;
  if (next === null || next === '' || next.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return next;
}
