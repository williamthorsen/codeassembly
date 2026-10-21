/** Reads the project's declared stage from its own preferences file. */
import { isRecord } from '../lib/type-guards.ts';

export const MATURITY_VALUES = ['hobby', 'early', 'production'] as const;
export const SENSITIVITY_VALUES = ['low', 'personal', 'confidential'] as const;
export const AUDIENCE_VALUES = ['owner', 'team', 'public'] as const;

/** The project's declared stage, each value `null` when the project file does not declare it. */
export interface ProjectStage {
  readonly maturity: (typeof MATURITY_VALUES)[number] | null;
  readonly sensitivity: (typeof SENSITIVITY_VALUES)[number] | null;
  readonly audience: (typeof AUDIENCE_VALUES)[number] | null;
}

/**
 * Narrows the `project` section of the project preferences file to the declared stage. Throws, naming the key path and
 * the allowed values, when a declared value is outside its set.
 */
export function readProjectStage(projectPreferences: Record<string, unknown>): ProjectStage {
  const section = projectPreferences['project'];
  if (section === undefined) {
    return { maturity: null, sensitivity: null, audience: null };
  }
  if (!isRecord(section)) {
    throw new Error(`preferences: 'project' must be an object (got ${JSON.stringify(section)})`);
  }
  return {
    maturity: expectOneOf(section['maturity'], MATURITY_VALUES, 'project.maturity'),
    sensitivity: expectOneOf(section['sensitivity'], SENSITIVITY_VALUES, 'project.sensitivity'),
    audience: expectOneOf(section['audience'], AUDIENCE_VALUES, 'project.audience'),
  };
}

// region | Helpers

/** Narrows `value` to one of `allowed`, or `null` when it is undeclared. */
function expectOneOf<T extends string>(value: unknown, allowed: readonly T[], keyPath: string): T | null {
  if (value === undefined || value === null) {
    return null;
  }
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) {
    throw new Error(
      `preferences: '${keyPath}' must be one of ${allowed.map((candidate) => `"${candidate}"`).join(', ')} (got ${JSON.stringify(value)})`,
    );
  }
  return match;
}

// endregion | Helpers
