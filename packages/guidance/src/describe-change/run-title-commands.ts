import type { ChangeRecord } from '@williamthorsen/change-grammar';

import { describeTaxonomyLocation } from '../lib/work-types.ts';
import { loadTemplates, loadTemplatesWithTaxonomy, readSubject, renderTemplate } from './templates.ts';
import type { DescribeResult, RunInput, Surface } from './types.ts';

/** Reads a subject back through the named surface's template. */
export async function runParseTitle(surface: Surface, subject: string, input: RunInput): Promise<DescribeResult> {
  const { taxonomy, templates, warnings } = await loadTemplatesWithTaxonomy(
    input,
    'parse-title resolves the type against the taxonomy',
  );
  return { output: readSubject(surface, templates[surface], subject, taxonomy), warnings };
}

/**
 * Renders every surface's title from the record, warning rather than refusing when a taxonomy is not readable to verify
 * the templates.
 */
export async function runRenderTitles(record: ChangeRecord, input: RunInput): Promise<DescribeResult> {
  const { taxonomy, templates, warnings } = await loadTemplates(input);
  if (taxonomy === null) {
    warnings.push(
      `work-types.json is missing or unreadable ${describeTaxonomyLocation(input.dataDir)}; templates are not verified`,
    );
  }
  return {
    output: {
      commit_title: renderTemplate(templates.commit, record),
      ticket_title: renderTemplate(templates.ticket, record),
      pr_title: renderTemplate(templates.pr, record),
      merge_title: renderTemplate(templates.merge, record),
    },
    warnings,
  };
}
