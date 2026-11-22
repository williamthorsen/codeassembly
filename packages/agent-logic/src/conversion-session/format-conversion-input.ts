const HEADER_PREFIX = 'Prompt file: ';

/**
 * Returns the message that starts a conversion: a header line naming the prompt's file, a blank line, and the prompt.
 */
export function formatConversionInput(prompt: string, name: string): string {
  return `${HEADER_PREFIX}${name}\n\n${prompt}`;
}

/**
 * Returns the prompt and the file name from which `formatConversionInput` formatted `input`. Throws when `input` is not
 * in that format, including the formatted input of a name that contains a newline.
 */
export function parseConversionInput(input: string): { prompt: string; name: string } {
  const headerEnd = input.indexOf('\n');
  if (!input.startsWith(HEADER_PREFIX) || headerEnd === -1 || input[headerEnd + 1] !== '\n') {
    throw new Error('Conversion input must start with a `' + HEADER_PREFIX + '{name}` line followed by a blank line.');
  }
  return { prompt: input.slice(headerEnd + 2), name: input.slice(HEADER_PREFIX.length, headerEnd) };
}
