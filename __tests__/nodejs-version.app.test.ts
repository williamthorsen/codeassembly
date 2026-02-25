import assert from 'node:assert';
import fs from 'node:fs';

import { isObject } from '@williamthorsen/toolbelt.objects';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

import { GITHUB_ACTION_FILE, GITHUB_ACTION_FILE_PATH } from './config.ts';
import { getRuntimeVersionFromAsdf } from './helpers/getRuntimeVersionFromAsdf.ts';
import { getValueAtPathOrThrow } from './helpers/getValueAtPathOrThrow.ts';

describe('Node.js version consistency', () => {
  it('version is the same in GitHub action and .tool-versions', async () => {
    const toolVersion = await getRuntimeVersionFromAsdf('nodejs');
    const actionVersion = await getNodeVersionFromAction();

    expect(toolVersion).toBe(actionVersion);
  });
});

async function getNodeVersionFromAction() {
  const actionYaml = await fs.promises.readFile(GITHUB_ACTION_FILE_PATH, { encoding: 'utf8' });
  const action = yaml.load(actionYaml);
  assert.ok(action, `Action not found in ${GITHUB_ACTION_FILE}`);

  const steps = getValueAtPathOrThrow(action, 'jobs.code-quality.steps');
  assert.ok(Array.isArray(steps), 'jobs.code-quality.steps is not an array');

  const nodeStep = steps.find((step: unknown) => isObject(step) && step.name === 'Set up Node.js');
  assert.ok(nodeStep, '"Set up Node.js" step not found in action');

  return getValueAtPathOrThrow(nodeStep, 'with.node-version');
}
