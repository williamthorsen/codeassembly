import { isRecord } from '../lib/type-guards.ts';
import { resolveWorkType, type WorkType } from '../lib/work-types.ts';

/** The Jira settings that target resolution reads from the merged preferences. */
export interface JiraPreferences {
  issueTypes: Readonly<Record<string, string>>;
  projectKey: string | undefined;
  ticketRefPrefix: string | undefined;
}

/** Where a work item is created, or the reason that the preferences do not name a project. */
export type Target = { issueType: string; projectKey: string } | { fallback: 'no-project-key'; warning: string };

/**
 * Projects the merged preferences to the Jira settings that target resolution reads. Throws with the offending key path
 * when a present field has the wrong type.
 */
export function readJiraPreferences(merged: Readonly<Record<string, unknown>>): JiraPreferences {
  const jira = readSection(readSection(merged, 'integrations'), 'jira', 'integrations.');
  const project = readSection(merged, 'project');

  const issueTypes: Record<string, string> = {};
  const issueTypesValue = jira.issue_types;
  if (issueTypesValue !== undefined && issueTypesValue !== null) {
    if (!isRecord(issueTypesValue)) {
      throw new Error("preferences: 'integrations.jira.issue_types' must be an object");
    }
    for (const [key, value] of Object.entries(issueTypesValue)) {
      issueTypes[key] = readString(value, `integrations.jira.issue_types.${key}`) ?? '';
    }
  }

  return {
    issueTypes,
    projectKey: readString(jira.project_key, 'integrations.jira.project_key'),
    ticketRefPrefix: readString(project.ticket_ref_prefix, 'project.ticket_ref_prefix'),
  };
}

/**
 * Resolves the project key and issue type for a work item of `workType`. The key is `integrations.jira.project_key`,
 * else `project.ticket_ref_prefix` without its trailing separator. The issue type is the `issue_types` entry whose key
 * names the same work type, matched through the taxonomy's aliases, else the map's `default` entry, else `Task`.
 *
 * Throws when `workType` is not declared by the taxonomy, so that a misspelled type does not fall through to `default`.
 */
export function resolveTarget(
  workType: string,
  preferences: JiraPreferences,
  workTypes: ReadonlyMap<string, WorkType>,
): Target {
  const resolved = resolveWorkType(workType, workTypes);
  if (resolved === null) {
    throw new Error(`unknown work type '${workType}'`);
  }

  const projectKey = nonEmpty(preferences.projectKey) ?? deriveKeyFromPrefix(preferences.ticketRefPrefix);
  if (projectKey === undefined) {
    return {
      fallback: 'no-project-key',
      warning:
        'Jira work item not created: neither integrations.jira.project_key nor project.ticket_ref_prefix is set.',
    };
  }

  return { issueType: resolveIssueType(resolved.workType.key, preferences.issueTypes, workTypes), projectKey };
}

// region | Helpers

/** Strips the trailing separator from a ticket-reference prefix (`ABC-` yields `ABC`); a prefix without a key yields none. */
function deriveKeyFromPrefix(prefix: string | undefined): string | undefined {
  return nonEmpty(prefix?.replace(/[^\dA-Za-z]+$/, ''));
}

/** Returns `value` unless it is undefined or empty. */
function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}

/** Reads a string field, treating an absent or null value as unset. Throws when the value is another type. */
function readString(value: unknown, keyPath: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new TypeError(`preferences: '${keyPath}' must be a string`);
  }
  return value;
}

/** Reads a nested section, treating an absent or null value as empty. Throws when the value is not an object. */
function readSection(parent: Readonly<Record<string, unknown>>, key: string, prefix = ''): Record<string, unknown> {
  const value = parent[key];
  if (value === undefined || value === null) {
    return {};
  }
  if (!isRecord(value)) {
    throw new Error(`preferences: '${prefix}${key}' must be an object`);
  }
  return value;
}

/** Takes the first non-empty name from the entry naming `canonicalKey`, then the `default` entry, then `Task`. */
function resolveIssueType(
  canonicalKey: string,
  issueTypes: Readonly<Record<string, string>>,
  workTypes: ReadonlyMap<string, WorkType>,
): string {
  for (const [key, name] of Object.entries(issueTypes)) {
    if (key !== 'default' && workTypes.get(key)?.key === canonicalKey && name !== '') {
      return name;
    }
  }
  return nonEmpty(issueTypes.default) ?? 'Task';
}

// endregion | Helpers
