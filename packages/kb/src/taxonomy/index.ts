// Owns `.kb/taxonomy.yaml` end to end. The note-path-to-domain mapping is exported with the schema, the loader, and the
// writer so that a caller outside this package classifies a note against the same mapping against which the drift rules
// report.

export { resolveDomain, resolveParent } from './domain-paths.ts';
export { loadTaxonomy } from './load-taxonomy.ts';
export { describeKeyDefect, type Taxonomy, type TaxonomyEntry, taxonomyFileShape } from './taxonomy-schema.ts';
export { type TaxonomyDeclaration, writeTaxonomy } from './write-taxonomy.ts';
