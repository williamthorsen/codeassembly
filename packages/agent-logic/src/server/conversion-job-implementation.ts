import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { implementJob, type JobImplementation } from '@williamthorsen/telefactor/server';
import { describeError } from '@williamthorsen/toolbelt.errors';

import { conversionJob, problemsFileSchema } from '../contract/conversion-job.ts';
import type { ConvertResult } from '../convert/convert-prompt.ts';
import { outOfScopeSchema } from '../convert/draft-schema.ts';
import { sanitizeName } from '../convert/sanitize-name.ts';
import { validateConfig } from '../schema/validate-config.ts';

/** The number of trailing lines of a harness's output that a failure quotes. */
const TAIL_LINES = 20;

/** The outcomes after which a job's directory is deleted; a failed or timed-out job keeps it for inspection. */
const RELEASED_OUTCOMES = new Set(['cancelled', 'done']);

/**
 * Implements the conversion job: Each run writes the prompt to a file in a directory of its own under
 * `conversionsDirectory`, expands `{prompt}`, `{output}`, and `{problems}` in the harness command to absolute paths in
 * that directory, and reads back the agent-logic file that the command writes or, when it writes none, the problems or
 * out-of-scope verdict in the problems file.
 */
export function createConversionJobImplementation({
  conversionsDirectory,
}: {
  conversionsDirectory: string;
}): JobImplementation<typeof conversionJob> {
  return implementJob(conversionJob, {
    async prepare({ id, harness, prompt, input }) {
      const baseName = sanitizeName(input.name);
      const directory = path.join(conversionsDirectory, id);
      const paths = {
        prompt: path.join(directory, `${baseName}.md`),
        output: path.join(directory, `${baseName}.agent-logic.json`),
        problems: path.join(directory, `${baseName}.problems.json`),
      };
      try {
        await mkdir(directory, { recursive: true });
        await writeFile(paths.prompt, prompt);
      } catch (error) {
        await rm(directory, { recursive: true, force: true });
        throw error;
      }
      return {
        placeholders: paths,
        stdin: '',
        async read({ stdout, stderrTail }) {
          const result = (await readOutput(paths.output)) ?? (await readProblems(paths.problems));
          if (result === undefined) {
            const tail = formatOutputTail(stdout, stderrTail);
            throw new Error(`The harness ${harness} exited without writing ${paths.output}.${tail}`);
          }
          return result;
        },
        async release(outcome) {
          if (RELEASED_OUTCOMES.has(outcome)) await rm(directory, { recursive: true, force: true });
        },
      };
    },
  });
}

// region | Helpers
/**
 * Returns the last lines of the stdout followed by the stderr, on lines of their own after a line break, or an empty
 * string for none. A harness may explain itself on either stream.
 */
function formatOutputTail(stdout: string, stderrTail: string): string {
  const output = [stdout.trim(), stderrTail.trim()].filter((part) => part !== '').join('\n');
  return output === '' ? '' : `\n${output.split('\n').slice(-TAIL_LINES).join('\n')}`;
}

/** Reads and validates the agent-logic file; returns `undefined` when the command did not write one. */
async function readOutput(outputPath: string): Promise<ConvertResult | undefined> {
  let text: string;
  try {
    text = await readFile(outputPath, 'utf8');
  } catch {
    return undefined;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    const reason = describeError(error);
    return { ok: false, problems: [{ path: '', message: `The agent-logic file is not valid JSON: ${reason}.` }] };
  }
  const validated = validateConfig(value);
  return validated.ok ? { ok: true, config: validated.config, text } : validated;
}

/**
 * Reads the problems or the out-of-scope verdict that the `convert` script wrote; returns `undefined` when the file is
 * missing or malformed.
 */
async function readProblems(problemsPath: string): Promise<ConvertResult | undefined> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(problemsPath, 'utf8'));
  } catch {
    return undefined;
  }
  const verdict = outOfScopeSchema.safeParse(value);
  if (verdict.success) return { ok: false, outOfScope: verdict.data.outOfScope };
  const parsed = problemsFileSchema.safeParse(value);
  return parsed.success ? { ok: false, problems: parsed.data.problems } : undefined;
}
// endregion | Helpers
