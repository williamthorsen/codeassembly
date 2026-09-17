/** Returns the value at `key`, inserting one produced by `create` when absent. */
export function getOrCreate<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  const existing = map.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const created = create();
  map.set(key, created);
  return created;
}

/** Drops every map key absent from `keep`, bounding the map to a currently resident set. */
export function retainKeys<K, V>(map: Map<K, V>, keep: ReadonlySet<K>): void {
  for (const key of map.keys()) {
    if (!keep.has(key)) {
      map.delete(key);
    }
  }
}
