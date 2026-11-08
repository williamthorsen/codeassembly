/** Lists the offset of every occurrence of a quote in the prompt, overlapping occurrences included. */
export function findOccurrences(prompt: string, quote: string): number[] {
  const starts: number[] = [];
  for (let start = prompt.indexOf(quote); start !== -1; start = prompt.indexOf(quote, start + 1)) {
    starts.push(start);
  }
  return starts;
}
