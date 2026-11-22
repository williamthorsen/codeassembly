/** Reports whether the name contains the query, ignoring case and the space around the query; a blank query matches. */
export function matchesName(name: string, query: string): boolean {
  return name.toLowerCase().includes(query.trim().toLowerCase());
}
