import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { buildMinimalConfig } from '../../test-utils/minimal-config.ts';
import { agentLogicConfigSchema, type Finding } from '../agent-logic-schema.ts';
import { JSON_SCHEMA_PATH, renderJsonSchema } from '../write-json-schema.ts';

describe('agent-logic JSON Schema file', () => {
  it('matches the schema against which the app validates', () => {
    const committed = readFileSync(JSON_SCHEMA_PATH, { encoding: 'utf8' });

    expect(committed, 'The JSON Schema file is stale. Run `pnpm run generate:schema`.').toBe(renderJsonSchema());
  });
});

describe('agentLogicConfigSchema', () => {
  it('accepts findings on the root, a state, and a transition', () => {
    const config = buildMinimalConfig();
    const finding: Finding = {
      kind: 'unhandled-case',
      sources: [{ start: 0, end: 5 }],
      reason: 'The prompt says nothing.',
    };
    config.meta.findings = [finding];
    const greeting = config.states['greeting'];
    if (greeting === undefined) throw new Error('The minimal config has no greeting state.');
    greeting.meta.findings = [finding];
    const reply = greeting.on?.['user.replied'];
    if (reply === undefined || Array.isArray(reply)) throw new Error('The minimal config has no single reply.');
    reply.meta.findings = [finding];

    expect(agentLogicConfigSchema.safeParse(config).success).toBe(true);
  });

  it('rejects a finding without a source', () => {
    const config = buildMinimalConfig();
    const value = {
      ...config,
      meta: { ...config.meta, findings: [{ kind: 'contradiction', sources: [], reason: 'x' }] },
    };

    expect(agentLogicConfigSchema.safeParse(value).success).toBe(false);
  });

  it('rejects a finding of an unknown kind', () => {
    const config = buildMinimalConfig();
    const value = {
      ...config,
      meta: { ...config.meta, findings: [{ kind: 'typo', sources: [{ start: 0, end: 1 }], reason: 'x' }] },
    };

    expect(agentLogicConfigSchema.safeParse(value).success).toBe(false);
  });
});
