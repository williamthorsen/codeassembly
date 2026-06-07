import type { RecordTypeSchema, Schema } from '../types.ts';

// The bundled default knowledge-base schema, inherited by every store that declares no `.kb/schema.yaml`. It declares
// two record types: `assertion` (the canonical vault note, ranked by freshness) and `event` (the immutable, ULID-keyed
// record written by capture-event, ranked by recurrence-recency).
//
// The constant is deep-frozen at module load: TypeScript's `readonly` modifier is structural only, so without
// `Object.freeze` a downstream consumer could mutate the shared arrays and corrupt every later reader.

const assertion: RecordTypeSchema = {
  required: Object.freeze(['created', 'tags', 'title', 'updated']),
  optional: Object.freeze(['applies-to', 'last-verified', 'sources', 'superseded-by', 'supersedes']),
  recall: 'freshness',
  immutable: false,
};

const event: RecordTypeSchema = {
  required: Object.freeze(['captured-at', 'cwd', 'id', 'session', 'summary']),
  optional: Object.freeze(['correction', 'model', 'repo', 'skill', 'tags']),
  recall: 'recurrence-recency',
  immutable: true,
};

const schema: Schema = {
  recordTypes: Object.freeze({ assertion: Object.freeze(assertion), event: Object.freeze(event) }),
};

/** The bundled default schema, deep-frozen so its record types and arrays cannot be mutated at runtime. */
export const defaultSchema: Schema = Object.freeze(schema);
