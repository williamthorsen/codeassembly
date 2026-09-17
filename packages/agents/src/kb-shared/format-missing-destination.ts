/**
 * Builds the agent-facing error message for a knowledge-base destination that could not be determined: no `--kb` was
 * given and no `.kb/` was discoverable.
 */
export function formatMissingDestinationMessage(resolved: {
  registeredKbs: string[];
  defaultName?: string;
  registryError?: string;
}): string {
  if (resolved.registryError !== undefined) {
    return `no .kb/ was discovered and no --kb was given, and the kb.yaml registry could not be loaded: ${resolved.registryError}`;
  }
  if (resolved.registeredKbs.length === 0) {
    return 'no .kb/ was discovered, no --kb was given, and no knowledge bases are registered in kb.yaml';
  }
  const kbs = resolved.registeredKbs.join(', ');
  const defaultHint =
    resolved.defaultName !== undefined
      ? `the registry default is "${resolved.defaultName}", reachable as --kb @default`
      : 'no default_kb is configured';
  return `no .kb/ was discovered and no --kb was given. Registered knowledge bases: ${kbs}. Pass --kb <name> to choose one; ${defaultHint}.`;
}
