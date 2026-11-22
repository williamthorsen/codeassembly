/** Returns the report on a card's text whose name a stored file already has, which the card shows with Replace. */
export function describeConflict(name: string): string {
  return `The store already holds ${name}. Replace it to open this version.`;
}
