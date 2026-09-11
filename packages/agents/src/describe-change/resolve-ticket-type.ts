import { readLabelMap, resolveLabelKey } from './read-label-map.ts';

/**
 * Resolves the work type that a ticket's labels name through the label map's `types` section, yielding nothing where
 * the labels name no type or more than one, and where the repository configures no readable map.
 */
export async function resolveTicketType(input: {
  labelMapPath: string;
  labels: readonly string[];
}): Promise<string | undefined> {
  const { types } = await readLabelMap(input.labelMapPath);
  return resolveLabelKey(types, input.labels);
}
