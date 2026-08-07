// Subpath barrel for @williamthorsen/kb/taxonomy.
//
// Owns `.kb/taxonomy.yaml` end to end: the schema, the loader, the comment-preserving writer, and the note-path-to-
// domain mapping. All four sit together because their callers span a package boundary: this package's back-fill
// command and drift rules, and the `kb-add` helper in `packages/agents`, which classifies against the same mapping
// the rules report against.

export { resolveDomain, resolveParent } from './domain-paths.ts';
export { loadTaxonomy } from './load-taxonomy.ts';
export { describeKeyDefect, type Taxonomy, type TaxonomyEntry, taxonomyFileShape } from './taxonomy-schema.ts';
export { type TaxonomyDeclaration, writeTaxonomy } from './write-taxonomy.ts';
