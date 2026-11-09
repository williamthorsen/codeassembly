import { buildTransitionLabel, type ConfigDescription } from '../../layout/describe-config.ts';

/**
 * Returns the announcement of a selection that the agent made, naming the element as the page shows it, or `undefined`
 * when the chart does not contain the path.
 */
export function describeAgentSelection(description: ConfigDescription, path: string | undefined): string | undefined {
  if (path === undefined) return 'Agent cleared the selection.';
  const state = description.states.find((candidate) => candidate.path === path);
  if (state !== undefined) return `Agent selected ${state.name}.`;
  const transition = description.transitions.find((candidate) => candidate.path === path);
  if (transition !== undefined) {
    const { trigger } = buildTransitionLabel(transition);
    const route = `${transition.sourceName} to ${transition.targetName}`;
    return `Agent selected the transition from ${route}${trigger === undefined ? '' : ` on ${trigger}`}.`;
  }
  const ambient = description.ambient.find((candidate) => candidate.path === path);
  if (ambient !== undefined) return `Agent selected an ambient instruction of ${ambient.containerName}.`;
  return undefined;
}
