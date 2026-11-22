/** Returns the text's first words, with an ellipsis when it has more. */
export function abbreviate(text: string, wordCount = 5): string {
  const words = text.trim().split(/\s+/);
  const lead = words.slice(0, wordCount).join(' ');
  return words.length > wordCount ? `${lead}…` : lead;
}
