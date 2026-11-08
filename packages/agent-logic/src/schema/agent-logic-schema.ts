import { z } from 'zod';

/** A half-open range of UTF-16 offsets into the config's prompt text. */
export const spanSchema = z
  .strictObject({
    start: z.int().nonnegative(),
    end: z.int().nonnegative(),
  })
  .meta({ id: 'Span' });

/** A guard, stated in natural language, and the shape that an action extends. */
export const nlEntrySchema = z
  .strictObject({
    type: z.literal('nl'),
    params: z.strictObject({ text: z.string().min(1) }),
  })
  .meta({ id: 'NlEntry' });

/** Marks the quoted passage as the body of a `<HARD-GATE>` in the prompt. */
const gateSchema = z.literal(true).optional().meta({
  description: 'Present when the passage is the body of a `<HARD-GATE>`, an absolute instruction, in the prompt.',
});

/** An action, stated in natural language; a gated action quotes its gate. */
export const actionSchema = nlEntrySchema
  .extend({
    meta: z.strictObject({ source: spanSchema, gate: z.literal(true) }).optional(),
  })
  .meta({ id: 'Action' });

/** The span of an ambient instruction. */
export const ambientSpanSchema = spanSchema.extend({ gate: gateSchema }).meta({ id: 'AmbientSpan' });

/** Passages that hold in every state of a container without moving the agent between states. */
const ambientSchema = z.array(ambientSpanSchema).optional().meta({
  description:
    'Spans of the ambient instructions that hold throughout the state, such as persona, tone, background knowledge, and standing rules. Allowed only on the root and on a compound state.',
});

/** The kinds of flaw that a converter can judge from the prompt's prose but that the chart's structure does not show. */
export const findingKindSchema = z
  .enum(['contradiction', 'unused-input', 'unhandled-case', 'inferred-resolution'])
  .meta({ id: 'FindingKind' });

/** A flaw in the prompt as judged by the converter, with the passages that show it. */
export const findingSchema = z
  .strictObject({
    kind: findingKindSchema,
    sources: z.array(spanSchema).min(1),
    reason: z.string().min(1),
  })
  .meta({ id: 'Finding' });

/** The converter's findings about the element that holds them, or about the prompt as a whole on the root. */
const findingsSchema = z.array(findingSchema).optional().meta({
  description:
    "The converter's judgment of flaws in the prompt that concern this element, or the prompt as a whole on the root. An `inferred-resolution` finding sits on the inferred element that it explains.",
});

const elementMetaSchema = z
  .strictObject({
    source: spanSchema,
    inferred: z.literal(true).optional(),
    gate: gateSchema,
    ambient: ambientSchema,
    findings: findingsSchema,
  })
  .meta({ id: 'ElementMeta' });

const stateNameSchema = z.string().min(1).optional().meta({
  description: 'The name that the viewer shows for the state, written as words. Absent, the viewer shows the id.',
});

const stateMetaSchema = elementMetaSchema.extend({ name: stateNameSchema }).meta({ id: 'StateMeta' });

export const transitionSchema = z
  .strictObject({
    target: z.string().regex(/^#.+$/).optional().meta({
      description: 'The `#id` of the target state. Omitted, the transition runs its actions without leaving.',
    }),
    guard: nlEntrySchema.optional(),
    actions: z.array(actionSchema).optional(),
    meta: elementMetaSchema,
  })
  .meta({ id: 'Transition' });

const transitionsSchema = z.union([transitionSchema, z.array(transitionSchema).min(1)]);

export const eventNameSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/)
  .meta({ description: 'A dotted lowercase event name; events from the user start with `user.`.' });

/** Members that every state has, the root included. */
const stateMembers = {
  id: z.string().min(1),
  on: z.record(eventNameSchema, transitionsSchema).optional(),
  always: transitionsSchema.optional(),
  entry: z.array(actionSchema).optional(),
  exit: z.array(actionSchema).optional(),
};

/** A state below the root. Declared by hand because zod cannot infer a recursive type. */
export interface StateConfig {
  id: string;
  type?: 'final' | undefined;
  initial?: string | undefined;
  states?: Record<string, StateConfig> | undefined;
  on?: Record<string, TransitionConfig | TransitionConfig[]> | undefined;
  always?: TransitionConfig | TransitionConfig[] | undefined;
  entry?: Action[] | undefined;
  exit?: Action[] | undefined;
  meta: StateMeta;
}

export const stateSchema: z.ZodType<StateConfig> = z
  .strictObject({
    ...stateMembers,
    type: z.literal('final').optional(),
    initial: z.string().optional(),
    get states() {
      return z.record(z.string(), stateSchema).optional();
    },
    meta: stateMetaSchema,
  })
  .meta({ id: 'State' });

export const unconvertedSpanSchema = spanSchema.extend({ reason: z.string().min(1).optional() });

/** The agent-logic representation: an XState v5 machine config whose root contains the prompt that it describes. */
export const agentLogicConfigSchema = z
  .strictObject({
    ...stateMembers,
    initial: z.string(),
    states: z.record(z.string(), stateSchema),
    meta: z.strictObject({
      name: stateNameSchema,
      prompt: z.string(),
      source: spanSchema,
      unconverted: z.array(unconvertedSpanSchema),
      ambient: ambientSchema,
      findings: findingsSchema,
    }),
  })
  .meta({ title: 'Agent logic config' });

export type Action = z.output<typeof actionSchema>;
export type AmbientSpan = z.output<typeof ambientSpanSchema>;
export type ElementMeta = z.output<typeof elementMetaSchema>;
export type Finding = z.output<typeof findingSchema>;
export type FindingKind = z.output<typeof findingKindSchema>;
export type AgentLogicConfig = z.output<typeof agentLogicConfigSchema>;
export type NlEntry = z.output<typeof nlEntrySchema>;
export type Span = z.output<typeof spanSchema>;
export type StateMeta = z.output<typeof stateMetaSchema>;
export type TransitionConfig = z.output<typeof transitionSchema>;
export type UnconvertedSpan = z.output<typeof unconvertedSpanSchema>;
