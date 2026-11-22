const HEADER_PREFIX = 'Prompt file: ';

/**
 * Returns the message that starts a conversion: a header line naming the prompt's file, a blank line, and the prompt.
 * Throws for a name that contains a newline, which the header line cannot hold.
 */
export function formatConversionInput(prompt: string, name: string): string {
  if (name.includes('\n')) throw new Error(`The prompt's file name cannot contain a newline: ${JSON.stringify(name)}.`);
  return `${HEADER_PREFIX}${name}\n\n${prompt}`;
}

/**
 * Returns the prompt and the file name from which `formatConversionInput` formatted `input`. Throws when `input` is not
 * in that format.
 */
export function parseConversionInput(input: string): { prompt: string; name: string } {
  const headerEnd = input.indexOf('\n');
  if (!input.startsWith(HEADER_PREFIX) || headerEnd === -1 || input[headerEnd + 1] !== '\n') {
    throw new Error('Conversion input must start with a `' + HEADER_PREFIX + '{name}` line followed by a blank line.');
  }
  return { prompt: input.slice(headerEnd + 2), name: input.slice(HEADER_PREFIX.length, headerEnd) };
}
