import type { Schema } from '../types.js';

// The bundled default knowledge-base schema. Its `types` are the four Diátaxis
// modes; its `required` and `optional` field sets are the canonical vault
// frontmatter conventions.
//
// The constant is deep-frozen at module load: TypeScript's `readonly` modifier
// is structural only, so without `Object.freeze` a downstream consumer could
// mutate the shared arrays and corrupt every later reader.

const schema: Schema = {
  types: Object.freeze(['howto', 'concept', 'reference', 'tutorial']),
  required: Object.freeze(['title', 'type', 'created', 'updated', 'tags']),
  optional: Object.freeze(['last-verified', 'applies-to', 'sources', 'supersedes', 'superseded-by']),
};

/** The bundled default schema, deep-frozen so its arrays cannot be mutated at runtime. */
export const defaultSchema: Schema = Object.freeze(schema);
