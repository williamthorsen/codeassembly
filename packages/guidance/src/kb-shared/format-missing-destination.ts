/**
 * Builds the agent-facing error message for a knowledge-base destination that could not be determined: `--kb` was not
 * given, and discovery did not find any `.kb/`.
 */
export function formatMissingDestinationMessage(resolved: {
  registeredKbs: string[];
  defaultName?: string;
  registryError?: string;
}): string {
  if (resolved.registryError !== undefined) {
    return `discovery did not find any .kb/ and --kb was not given, and the kb.yaml registry could not be loaded: ${resolved.registryError}`;
  }
  if (resolved.registeredKbs.length === 0) {
    return 'discovery did not find any .kb/, --kb was not given, and kb.yaml does not register any knowledge bases';
  }
  const kbs = resolved.registeredKbs.join(', ');
  const defaultHint =
    resolved.defaultName !== undefined
      ? `the registry default is "${resolved.defaultName}", available as --kb @default`
      : 'kb.yaml does not configure a default_kb';
  return `discovery did not find any .kb/ and --kb was not given. Registered knowledge bases: ${kbs}. Pass --kb <name> to choose one; ${defaultHint}.`;
}
