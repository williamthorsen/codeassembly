import {
  type ChangeRecord,
  compileTemplate,
  findLossyRenders,
  parse,
  render,
  type Taxonomy,
  verify,
} from '@williamthorsen/change-grammar';

import { describeTaxonomyLocation, loadTaxonomy } from '../lib/work-types.ts';
import { loadPreferences } from './load-preferences.ts';
import { resolveRunProjectRoot } from './run-project-root.ts';
import { type ParseTitleOutcome, type RunInput, type Surface, SURFACES } from './types.ts';

/** The project root, the templates to which it resolves, the taxonomy if one is readable, and what loading reported. */
export interface LoadedTemplates {
  projectRoot: string;
  taxonomy: Taxonomy | null;
  templates: Record<Surface, string>;
  warnings: string[];
}

/**
 * Resolves the project root and the templates configured by its preferences files, then refuses any configured
 * template that the engine cannot round-trip and warns of any whose render loses a token, when a taxonomy is readable
 * to verify against.
 */
export async function loadTemplates(input: RunInput): Promise<LoadedTemplates> {
  const { projectRoot, warning } = resolveRunProjectRoot(input);
  const { templates, warnings } = await loadPreferences({ home: input.home, projectRoot });
  if (warning !== undefined) {
    warnings.unshift(warning);
  }

  const taxonomy = await loadTaxonomy(input.dataDir);
  if (taxonomy !== null) {
    refuseUnverifiableTemplates(templates, taxonomy);
    warnings.push(...findLossyTemplates(templates, taxonomy));
  }
  return { projectRoot, taxonomy, templates, warnings };
}

/** Loads the templates for a subcommand that cannot run without the taxonomy, prefixing the refusal with `reason`. */
export async function loadTemplatesWithTaxonomy(
  input: RunInput,
  reason: string,
): Promise<LoadedTemplates & { taxonomy: Taxonomy }> {
  const loaded = await loadTemplates(input);
  const { taxonomy } = loaded;
  if (taxonomy === null) {
    throw new Error(`${reason}; none is readable ${describeTaxonomyLocation(input.dataDir)}`);
  }
  return { ...loaded, taxonomy };
}

/** Reads a subject back through one surface's template, reporting each field that the record names. */
export function readSubject(
  surface: Surface,
  template: string,
  subject: string,
  taxonomy: Taxonomy,
): ParseTitleOutcome {
  if (template === '') {
    throw new Error(`${surface}.title_format is empty, so a ${surface} subject cannot be read back`);
  }
  const record = parse(compileTemplate(template), subject, taxonomy);
  if (record === undefined) {
    return { matched: false };
  }
  return {
    breaking: record.breaking === true,
    matched: true,
    pr_number: record.prNumber ?? null,
    scope: record.scope ?? null,
    ticket_ref: record.ticketRef ?? null,
    title: record.title ?? null,
    type: record.type ?? null,
  };
}

/** Renders one template against the record; an unconfigured surface renders empty rather than compiling nothing. */
export function renderTemplate(template: string, record: ChangeRecord): string {
  return template === '' ? '' : render(compileTemplate(template), record);
}

// region | Helpers

/** Reports each configured template whose render some record shape cannot read back, naming the surface. */
function findLossyTemplates(templates: Record<Surface, string>, taxonomy: Taxonomy): string[] {
  return SURFACES.filter((surface) => templates[surface] !== '').flatMap((surface) =>
    findLossyRenders(templates[surface], taxonomy).map((warning) => `${surface}.title_format: ${warning}`),
  );
}

/** Refuses every configured template that the engine cannot round-trip, naming the surface, the template, and the defect. */
function refuseUnverifiableTemplates(templates: Record<Surface, string>, taxonomy: Taxonomy): void {
  const defects: string[] = [];
  for (const surface of SURFACES) {
    const template = templates[surface];
    if (template !== '') {
      defects.push(...verify(template, taxonomy).map((defect) => `${surface}.title_format: ${defect}`));
    }
  }
  if (defects.length > 0) {
    throw new Error(defects.join('\n'));
  }
}

// endregion | Helpers
