/** Returns the message that starts a conversion: a header line naming the prompt's file, a blank line, and the prompt. */
export function formatConversionInput(prompt: string, name: string): string {
  return `Prompt file: ${name}\n\n${prompt}`;
}
