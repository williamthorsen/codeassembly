import { examples } from '../../examples/examples.ts';
import { describeConfig, listGaps } from '../../layout/describe-config.ts';
import type { AgentLogicConfig } from '../../schema/agent-logic-schema.ts';
import type { Problem } from '../../schema/validate-config.ts';

/**
 * Returns the announcement of a chart that loaded, with the counts of its unconverted passages, its gaps, and its
 * findings.
 */
export function describeLoaded(source: string, config: AgentLogicConfig): string {
  return [`${source} loaded.`, ...countListed(config)].join(' ');
}

/** Returns the announcement of a chart that the agent loaded, with the same counts as `describeLoaded`. */
export function describeLoadedByAgent(source: string, config: AgentLogicConfig): string {
  return [`Agent loaded ${source}.`, ...countListed(config)].join(' ');
}

/** Returns the announcement of a failed load: its problem, or the count of its problems. */
export function describeNotLoaded(source: string, problems: Problem[]): string {
  const [first, second] = problems;
  if (first !== undefined && second === undefined) return `${source} not loaded. ${first.message}`;
  return `${source} not loaded. ${problems.length} problems listed.`;
}

/** Returns the message for a URL that names an example that does not exist, with the names of those that do. */
export function describeUnknownExample(value: string): string {
  const names = new Intl.ListFormat('en', { type: 'conjunction' }).format(examples.map(({ name }) => name));
  const problem = value === '' ? 'The URL names an empty example.' : `No example is named “${value}”.`;
  return `${problem} The examples are ${names}.`;
}

// region | Helpers
/** Returns a sentence for each nonzero count of a chart's unconverted passages, gaps, and findings. */
function countListed(config: AgentLogicConfig): string[] {
  const { length } = config.meta.unconverted;
  const description = describeConfig(config);
  const gapCount = listGaps(description).length;
  const findingCount = description.findings.length;
  return [
    ...(length === 0 ? [] : [`${length} unconverted ${length === 1 ? 'passage' : 'passages'} listed.`]),
    ...(gapCount === 0 ? [] : [`${gapCount} ${gapCount === 1 ? 'gap' : 'gaps'} listed.`]),
    ...(findingCount === 0 ? [] : [`${findingCount} ${findingCount === 1 ? 'finding' : 'findings'} listed.`]),
  ];
}
// endregion | Helpers
