// Subpath barrel for @williamthorsen/kb/taxonomy.
//
// Owns `.kb/taxonomy.yaml` end to end: the schema, the loader, and the comment-preserving writer. The writer sits
// beside the loader because its callers span a package boundary: this package's back-fill command, and the `kb-add`
// helper in `packages/agents`.

export { loadTaxonomy } from './load-taxonomy.ts';
export { describeKeyDefect, type Taxonomy, type TaxonomyEntry, taxonomyFileShape } from './taxonomy-schema.ts';
export { type TaxonomyDeclaration, writeTaxonomy } from './write-taxonomy.ts';
