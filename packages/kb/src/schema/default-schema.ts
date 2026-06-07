import type { RecordTypeSchema, Schema } from '../types.ts';

// The bundled default knowledge-base schema, inherited by every store that declares no `.kb/schema.yaml`. It declares
// two record types: `assertion` (the canonical vault note, ranked by freshness) and `event` (the immutable, ULID-keyed
// record written by capture-event, ranked by recurrence-recency).
//
// The constant is deep-frozen at module load: TypeScript's `readonly` modifier is structural only, so without
// `Object.freeze` a downstream consumer could mutate the shared arrays and corrupt every later reader.

const assertion: RecordTypeSchema = {
  required: Object.freeze(['title', 'created', 'updated', 'tags']),
  optional: Object.freeze(['last-verified', 'applies-to', 'sources', 'supersedes', 'superseded-by']),
  recall: 'freshness',
  immutable: false,
};

const event: RecordTypeSchema = {
  required: Object.freeze(['id', 'captured-at', 'session', 'cwd', 'summary']),
  optional: Object.freeze(['repo', 'skill', 'model', 'tags', 'correction']),
  recall: 'recurrence-recency',
  immutable: true,
};

const schema: Schema = {
  recordTypes: Object.freeze({ assertion: Object.freeze(assertion), event: Object.freeze(event) }),
};

/** The bundled default schema, deep-frozen so its record types and arrays cannot be mutated at runtime. */
export const defaultSchema: Schema = Object.freeze(schema);
