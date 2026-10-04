import { describe, expect, it } from 'vitest';

import { loadWorkTypes } from '../../lib/work-types.ts';
import { type JiraPreferences, readJiraPreferences, resolveTarget } from '../resolve-target.ts';

const workTypes = await loadWorkTypes();
if (workTypes === null) {
  throw new Error('embedded taxonomy did not load');
}

describe(resolveTarget, () => {
  it('takes integrations.jira.project_key over the ticket-reference prefix', () => {
    const target = resolveTarget('feat', preferences({ projectKey: 'JIRA', ticketRefPrefix: 'ABC-' }), workTypes);

    expect(target).toEqual({ issueType: 'Task', projectKey: 'JIRA' });
  });

  it('derives the project key from the ticket-reference prefix without its separator', () => {
    const target = resolveTarget('feat', preferences({ ticketRefPrefix: 'ABC-' }), workTypes);

    expect(target).toEqual({ issueType: 'Task', projectKey: 'ABC' });
  });

  it('falls back when neither the project key nor the prefix is set', () => {
    const target = resolveTarget('feat', preferences({}), workTypes);

    expect(target).toEqual({ fallback: 'no-project-key', warning: expect.stringContaining('project_key') });
  });

  it('falls back when the prefix does not contain a key', () => {
    const target = resolveTarget('feat', preferences({ ticketRefPrefix: '#' }), workTypes);

    expect(target).toHaveProperty('fallback', 'no-project-key');
  });

  it('takes the entry keyed by the canonical work type', () => {
    const target = resolveTarget(
      'fix',
      preferences({ projectKey: 'ABC', issueTypes: { default: 'Task', fix: 'Bug' } }),
      workTypes,
    );

    expect(target).toHaveProperty('issueType', 'Bug');
  });

  it('matches an entry keyed by an alias of the work type', () => {
    const target = resolveTarget('fix', preferences({ projectKey: 'ABC', issueTypes: { bugfix: 'Bug' } }), workTypes);

    expect(target).toHaveProperty('issueType', 'Bug');
  });

  it('matches a canonical entry when the work type is spelled as an alias', () => {
    const target = resolveTarget('bugfix', preferences({ projectKey: 'ABC', issueTypes: { fix: 'Bug' } }), workTypes);

    expect(target).toHaveProperty('issueType', 'Bug');
  });

  it('accepts a work type spelled with the breaking marker', () => {
    const target = resolveTarget('fix!', preferences({ projectKey: 'ABC', issueTypes: { fix: 'Bug' } }), workTypes);

    expect(target).toHaveProperty('issueType', 'Bug');
  });

  it('takes the default entry when no entry names the work type', () => {
    const target = resolveTarget(
      'feat',
      preferences({ projectKey: 'ABC', issueTypes: { default: 'Story', fix: 'Bug' } }),
      workTypes,
    );

    expect(target).toHaveProperty('issueType', 'Story');
  });

  it('takes Task when neither a matching entry nor a default is set', () => {
    const target = resolveTarget('feat', preferences({ projectKey: 'ABC', issueTypes: { fix: 'Bug' } }), workTypes);

    expect(target).toHaveProperty('issueType', 'Task');
  });

  it('throws on a work type that the taxonomy does not declare', () => {
    expect(() => resolveTarget('feature-ish', preferences({}), workTypes)).toThrow("unknown work type 'feature-ish'");
  });
});

describe(readJiraPreferences, () => {
  it('reads the Jira settings and the ticket-reference prefix', () => {
    const merged = {
      integrations: { jira: { enabled: true, issue_types: { fix: 'Bug' }, project_key: 'ABC' } },
      project: { ticket_ref_prefix: 'ABC-' },
    };

    expect(readJiraPreferences(merged)).toEqual({
      issueTypes: { fix: 'Bug' },
      projectKey: 'ABC',
      ticketRefPrefix: 'ABC-',
    });
  });

  it('reads absent sections as unset', () => {
    expect(readJiraPreferences({})).toEqual({ issueTypes: {}, projectKey: undefined, ticketRefPrefix: undefined });
  });

  it('throws with the key path when a field has the wrong type', () => {
    const merged = { integrations: { jira: { issue_types: { fix: 3 } } } };

    expect(() => readJiraPreferences(merged)).toThrow("'integrations.jira.issue_types.fix' must be a string");
  });
});

// region | Helpers

/** Builds Jira preferences from the fields that a test sets. */
function preferences(fields: Partial<JiraPreferences>): JiraPreferences {
  return { issueTypes: {}, projectKey: undefined, ticketRefPrefix: undefined, ...fields };
}

// endregion | Helpers
