/**
 * Builds the agent-facing error message for an omitted `--store`, naming the registered stores and, when configured,
 * the registry default reachable as `--store @default`. Shared by the helpers that refuse a capture with no named
 * destination, so their refusals stay parallel and each surfaces the registered names the resolver already computed.
 *
 * The `--kb` family has its own wording in `formatMissingDestinationMessage`: those tools discover a `.kb/` by walking
 * the working directory, so their refusal has to explain that the walk found nothing as well as that no flag was given.
 */
export function formatMissingStoreMessage(resolved: {
  registeredStores: string[];
  defaultName?: string;
  registryError?: string;
}): string {
  if (resolved.registryError !== undefined) {
    return `--store is required, but the kb.yaml registry could not be loaded: ${resolved.registryError}`;
  }
  if (resolved.registeredStores.length === 0) {
    return '--store is required, but no stores are registered in kb.yaml';
  }
  const stores = resolved.registeredStores.join(', ');
  const defaultHint =
    resolved.defaultName !== undefined
      ? `the registry default is "${resolved.defaultName}", reachable as --store @default`
      : 'no default_kb is configured';
  return `--store is required. Registered stores: ${stores}. Pass --store <name> to choose one; ${defaultHint}.`;
}
