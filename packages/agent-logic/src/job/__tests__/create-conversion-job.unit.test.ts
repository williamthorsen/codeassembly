import { describe, expect, it } from 'vitest';

import { MAX_COVERAGE_CHECKS, MAX_SUBMISSIONS } from '../../conversion-session/create-conversion-session.ts';
import { CONVERSION_INSTRUCTIONS } from '../../instructions/conversion-instructions.ts';
import { GREETER_DRAFT, GREETER_MAP, GREETER_PROMPT, MISQUOTED_GREETER_DRAFT } from '../../test-utils/greeter-draft.ts';
import { createConversionJob, createConversionJobFromInput, MAX_ROUNDS } from '../create-conversion-job.ts';

describe(createConversionJob, () => {
  it('sends the conversion instructions and the prompt under its file name, with a round for every allowed call', () => {
    const job = createGreeterJob();

    expect(job.instructions).toBe(CONVERSION_INSTRUCTIONS);
    expect(job.input).toBe(`Prompt file: greeter.md\n\n${GREETER_PROMPT}`);
    expect(Object.keys(job.tools)).toStrictEqual(['check_coverage', 'submit_draft']);
    expect(job.maxRounds).toBe(MAX_ROUNDS);
    expect(MAX_ROUNDS).toBeGreaterThan(MAX_COVERAGE_CHECKS + MAX_SUBMISSIONS);
  });

  it('describes each tool input to the model as a JSON Schema', () => {
    const job = createGreeterJob();

    for (const tool of Object.values(job.tools)) {
      const schema = tool.inputSchema['~standard'].jsonSchema.input({ target: 'draft-2020-12' });

      expect(schema).toMatchObject({ type: 'object' });
    }
  });

  it('has no result after a coverage check or a rejected draft with submissions left', async () => {
    const job = createGreeterJob();

    await callTool(job, 'check_coverage', { map: GREETER_MAP });
    const afterCheck = job.readResult();
    const reply = await callTool(job, 'submit_draft', { draft: JSON.stringify(MISQUOTED_GREETER_DRAFT) });

    expect(afterCheck).toBeUndefined();
    expect(reply).toMatch(/submissions left\.$/);
    expect(job.readResult()).toBeUndefined();
  });

  it('finishes with an accepted config and keeps it through a later submission', async () => {
    const job = createGreeterJob();

    await callTool(job, 'submit_draft', { draft: JSON.stringify(GREETER_DRAFT) });
    await callTool(job, 'submit_draft', { draft: JSON.stringify(MISQUOTED_GREETER_DRAFT) });

    expect(job.readResult()).toMatchObject({ ok: true, config: { id: 'greeter' } });
  });

  it('finishes with an out-of-scope verdict', async () => {
    const job = createGreeterJob();

    await callTool(job, 'submit_draft', { draft: JSON.stringify({ outOfScope: { reason: 'It states no steps.' } }) });

    expect(job.readResult()).toStrictEqual({ ok: false, outOfScope: { reason: 'It states no steps.' } });
  });

  it('finishes with the problems of the last submission, and refuses later checks and drafts', async () => {
    const job = createGreeterJob();

    for (let index = 0; index < MAX_SUBMISSIONS; index += 1) {
      await callTool(job, 'submit_draft', { draft: JSON.stringify(MISQUOTED_GREETER_DRAFT) });
    }
    for (let index = 0; index < MAX_COVERAGE_CHECKS; index += 1) {
      await callTool(job, 'check_coverage', { map: GREETER_MAP });
    }
    const extraCheck = await callTool(job, 'check_coverage', { map: GREETER_MAP });
    const extraDraft = await callTool(job, 'submit_draft', { draft: JSON.stringify(GREETER_DRAFT) });

    expect(job.readResult()).toMatchObject({ ok: false, problems: [{ path: 'states.done.meta.quote' }] });
    expect(extraCheck).toBe('The coverage checks are used up. Go on to the next check of the draft.');
    expect(extraDraft).toBe('No more drafts are accepted. End your turn.');
  });

  it('gives each job its own session', async () => {
    const first = createGreeterJob();
    const second = createGreeterJob();

    await callTool(first, 'submit_draft', { draft: JSON.stringify(GREETER_DRAFT) });

    expect(first.readResult()).toMatchObject({ ok: true });
    expect(second.readResult()).toBeUndefined();
  });
});

describe(createConversionJobFromInput, () => {
  it('creates the job whose input it receives, which converts the same prompt', async () => {
    const original = createGreeterJob();
    const job = createConversionJobFromInput(original.input);

    expect(job.input).toBe(original.input);
    expect(job.instructions).toBe(original.instructions);
    expect(Object.keys(job.tools)).toStrictEqual(Object.keys(original.tools));
    expect(job.maxRounds).toBe(original.maxRounds);

    await callTool(job, 'submit_draft', { draft: JSON.stringify(GREETER_DRAFT) });

    expect(job.readResult()).toMatchObject({ ok: true, config: { id: 'greeter' } });
  });

  it('throws for input that a conversion job does not send', () => {
    expect(() => createConversionJobFromInput(GREETER_PROMPT)).toThrow(/Prompt file:/);
  });
});

// region | Helpers
/** Validates `input` against the named tool's schema, as the runner does, and returns the tool's answer. */
async function callTool(job: ReturnType<typeof createConversionJob>, name: string, input: unknown): Promise<unknown> {
  const tool = job.tools[name];
  if (tool === undefined) throw new Error(`The job does not have a tool named ${name}.`);
  const validated = await tool.inputSchema['~standard'].validate(input);
  if (validated.issues !== undefined) throw new Error(`The input of ${name} is invalid.`);
  return tool.execute(validated.value);
}

/** Creates a job for the greeter prompt. */
function createGreeterJob() {
  return createConversionJob({ prompt: GREETER_PROMPT, name: 'greeter.md' });
}
// endregion | Helpers
