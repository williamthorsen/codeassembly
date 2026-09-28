/**
 * Builds the agent-facing error message for an omitted `--store`.
 *
 * The `--kb` family has its own wording in `formatMissingDestinationMessage`: Those tools discover a `.kb/` by walking
 * the working directory, so their refusal has to explain that the walk found nothing as well as that the flag was not
 * given.
 */
export function formatMissingStoreMessage(resolved: {
  registeredStores: string[];
  defaultName?: string;
  feedbackName?: string;
  registryError?: string;
}): string {
  if (resolved.registryError !== undefined) {
    return `--store is required, but the kb.yaml registry could not be loaded: ${resolved.registryError}`;
  }
  if (resolved.registeredStores.length === 0) {
    return '--store is required, but kb.yaml does not register any stores';
  }
  const stores = resolved.registeredStores.join(', ');
  const roleHints = [
    ...(resolved.defaultName === undefined
      ? []
      : [`the registry default is "${resolved.defaultName}", available as --store @default`]),
    ...(resolved.feedbackName === undefined
      ? []
      : [`the feedback store is "${resolved.feedbackName}", available as --store @feedback`]),
  ];
  const roleHint =
    roleHints.length === 0 ? 'kb.yaml does not configure a default_kb or a feedback_kb' : roleHints.join('; ');
  return `--store is required. Registered stores: ${stores}. Pass --store <name> to choose one; ${roleHint}.`;
}
