import { z } from 'zod';

import { eventNameSchema, findingKindSchema, nlEntrySchema, transitionSchema } from '../schema/agent-logic-schema.ts';

/** Quotes of the ambient instructions that hold throughout a state: on the root, or on a compound state. */
const draftAmbientSchema = z
  .array(z.strictObject({ quote: z.string().min(1), gate: z.literal(true).optional() }))
  .optional();

/** The converter's findings about an element, or about the prompt on the root, each quoting the passages involved. */
const draftFindingsSchema = z
  .array(
    z.strictObject({
      kind: findingKindSchema,
      quotes: z.array(z.string().min(1)).min(1),
      reason: z.string().min(1),
    }),
  )
  .optional();

/** Where an element comes from: a passage copied verbatim from the prompt, which must occur in it exactly once. */
const draftMetaSchema = z.strictObject({
  quote: z.string().min(1),
  inferred: z.literal(true).optional(),
  gate: z.literal(true).optional(),
  ambient: draftAmbientSchema,
  findings: draftFindingsSchema,
});

/** An action; a gated action quotes the gate that it represents. */
const draftActionSchema = nlEntrySchema.extend({
  meta: z.strictObject({ quote: z.string().min(1), gate: z.literal(true) }).optional(),
});

/** A transition whose `target` is `#` followed by the key of a state in the draft. */
const draftTransitionSchema = transitionSchema.extend({
  actions: z.array(draftActionSchema).optional(),
  meta: draftMetaSchema,
});

const draftTransitionsSchema = z.union([draftTransitionSchema, z.array(draftTransitionSchema).min(1)]);

/** Members that every draft state has, the root included. */
const draftStateMembers = {
  on: z.record(eventNameSchema, draftTransitionsSchema).optional(),
  always: draftTransitionsSchema.optional(),
  entry: z.array(draftActionSchema).optional(),
  exit: z.array(draftActionSchema).optional(),
};

/** A draft state below the root. Declared by hand because zod cannot infer a recursive type. */
export interface DraftState {
  type?: 'final' | undefined;
  initial?: string | undefined;
  states?: Record<string, DraftState> | undefined;
  on?: Record<string, DraftTransition | DraftTransition[]> | undefined;
  always?: DraftTransition | DraftTransition[] | undefined;
  entry?: DraftAction[] | undefined;
  exit?: DraftAction[] | undefined;
  meta: DraftMeta;
}

export const draftStateSchema: z.ZodType<DraftState> = z.strictObject({
  ...draftStateMembers,
  type: z.literal('final').optional(),
  initial: z.string().optional(),
  get states() {
    return z.record(z.string(), draftStateSchema).optional();
  },
  meta: draftMetaSchema,
});

/**
 * What the model writes: the agent-logic config without offsets or ids. Each element quotes the prompt instead of
 * giving a span, `initial` names a child's key, and a target names a state's key, so keys are unique across the draft.
 */
export const draftSchema = z.strictObject({
  ...draftStateMembers,
  initial: z.string(),
  states: z.record(z.string(), draftStateSchema),
  meta: z.strictObject({
    unconverted: z.array(z.strictObject({ quote: z.string().min(1), reason: z.string().min(1) })),
    ambient: draftAmbientSchema,
    findings: draftFindingsSchema,
  }),
});

/**
 * What the model writes for a prompt that the representation cannot usefully hold, in place of a draft. The `convert`
 * script writes the same object to the problems file.
 */
export const outOfScopeSchema = z.strictObject({
  outOfScope: z.strictObject({
    reason: z.string().refine((value) => value.trim() !== '', 'State why the prompt is out of scope'),
  }),
});

export type Draft = z.output<typeof draftSchema>;
export type DraftAction = z.output<typeof draftActionSchema>;
export type DraftFinding = NonNullable<z.output<typeof draftFindingsSchema>>[number];
export type DraftMeta = z.output<typeof draftMetaSchema>;
export type DraftTransition = z.output<typeof draftTransitionSchema>;
export type OutOfScope = z.output<typeof outOfScopeSchema>['outOfScope'];
