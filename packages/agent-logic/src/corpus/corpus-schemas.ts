import { z } from 'zod';

const verdictSchema = z.enum(['pass', 'fail']);

const blobSchema = z.string().regex(/^[0-9a-f]{40}$/);

/** The `git hash-object` ids of the skill's `SKILL.md` and of `docs/extraction-rules.md`. */
const sourceBlobsSchema = {
  skillBlob: blobSchema,
  rulesBlob: blobSchema,
};

/** A check that a result converted under older sources still holds under the sources named here. */
const recheckSchema = z.strictObject({ ...sourceBlobsSchema, note: z.string().min(1) });

/** Members of every review: the convert runs, the sources that the converter followed, and any recheck. */
const reviewMembers = {
  convertRuns: z.int().positive(),
  ...sourceBlobsSchema,
  recheck: recheckSchema.optional(),
};

const gapSchema = z.strictObject({
  criterion: z.enum(['coverage', 'fidelity', 'placement', 'gates', 'unconverted', 'gapsReport', 'scope']),
  text: z.string().min(1),
});

/** A reviewer's verdict on a prompt that converted, under the six-part rubric. */
const chartReviewSchema = z.strictObject({
  ...reviewMembers,
  verdicts: z.strictObject({
    /** Every step, branch, and rule of the prompt's logic is an element, an ambient instruction, or unconverted. */
    coverage: verdictSchema,
    /**
     * Each element, guard, and action states what the passage that it quotes states, and each state's name names its
     * step.
     */
    fidelity: verdictSchema,
    /**
     * Each quote starts where the Quotes section of `docs/extraction-rules.md` states: neither at another part of its
     * clause, such as after a state's verb or at a transition's action rather than its condition or event, nor at a
     * leading connective.
     */
    placement: verdictSchema,
    /**
     * Every `<HARD-GATE>` is represented in the position that its content decides, as `docs/extraction-rules.md`
     * states, and carries the gate flag. A prompt without a gate passes.
     */
    gates: verdictSchema,
    /** Each unconverted or ambient passage is one that the rules list there, and each reason holds. */
    unconverted: verdictSchema,
    /** Each gap that the viewer reports is a real gap of the prompt's logic. */
    gapsReport: verdictSchema,
  }),
  gaps: z.array(gapSchema),
});

/** A reviewer's verdict on a prompt that the skill reported out of scope: whether the report is right. */
const scopeReviewSchema = z.strictObject({
  ...reviewMembers,
  verdicts: z.strictObject({ scope: verdictSchema }),
  gaps: z.array(gapSchema),
});

/** The hand-written `<name>.review.json` for each corpus prompt, in the corpus's records directory. */
export const reviewSchema = z.union([chartReviewSchema, scopeReviewSchema]);

const commitSchema = z.string().regex(/^[0-9a-f]{40}$/);

/** A path written relative to the home directory, so that `run.json` names no machine's user. */
const homePathSchema = z.string().regex(/^~\//);

/** The build record that `codeassembly` writes to `~/.codeassembly/home-provenance.json` as `lastWrite`. */
const buildSchema = z.strictObject({
  version: z.string().min(1),
  sourcePath: homePathSchema,
  sourceCommit: commitSchema,
  command: z.string().min(1),
  writtenAt: z.iso.datetime(),
});

/**
 * A source that codeassembly declares, with the commit that describes its deployed content: the build's commit for the
 * pinned source, and the last commit that changed any other.
 */
const declaredSchema = z.strictObject({
  name: z.string().min(1),
  path: homePathSchema,
  commit: commitSchema,
  /** Whether the source is in the repository from which the build ran, so that the build's commit pins it. */
  pinnedByBuild: z.boolean(),
});

/** The skills that `codeassembly sync` deployed under `~/.claude`. */
const codeassemblySourceSchema = z.strictObject({
  kind: z.literal('codeassembly'),
  repository: z.string().min(1),
  license: z.string().min(1),
  build: buildSchema,
  declared: z.array(declaredSchema).min(1),
});

/** A Claude Code plugin, as `~/.claude/plugins/installed_plugins.json` records its user-scoped install. */
const pluginSourceSchema = z.strictObject({
  kind: z.literal('plugin'),
  plugin: z.string().min(1),
  repository: z.string().min(1),
  license: z.string().min(1),
  version: z.string().min(1),
  commit: commitSchema,
});

/** Where a prompt came from: a key of `sources`, and the path under that source's root. */
const promptSchema = z.strictObject({
  source: z.string().min(1),
  path: z.string().regex(/^skills\/[^/]+\/SKILL\.md$/),
});

/** The `run.json` that describes the corpus prompts' origins and the runs that produced the corpus outputs. */
export const runSchema = z.strictObject({
  date: z.iso.date(),
  model: z.string().min(1),
  sources: z.record(z.string(), z.discriminatedUnion('kind', [codeassemblySourceSchema, pluginSourceSchema])),
  prompts: z.record(z.string(), promptSchema),
});

/**
 * The `run.json` that `refresh-corpus` reads: the hand-written fields of `runSchema`, with the fields that the refresh
 * and the conversion round write optional.
 */
export const runInputSchema = z.strictObject({
  date: z.iso.date().optional(),
  model: z.string().min(1).optional(),
  sources: z.record(
    z.string(),
    z.discriminatedUnion('kind', [
      codeassemblySourceSchema.partial({ build: true }).extend({
        declared: z.array(declaredSchema.partial({ commit: true, pinnedByBuild: true })).min(1),
      }),
      pluginSourceSchema.partial({ version: true, commit: true }),
    ]),
  ),
  prompts: z.record(z.string(), promptSchema),
});

export type Gap = z.output<typeof gapSchema>;
export type Review = z.output<typeof reviewSchema>;
export type Run = z.output<typeof runSchema>;
export type RunInput = z.output<typeof runInputSchema>;
