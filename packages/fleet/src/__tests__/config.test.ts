import { homedir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CLOSE_AFTER_MS, DEBOUNCE_MS, HEARTBEAT_MS, resolveConfig, RETENTION_MS } from '../config.ts';

describe('resolveConfig', () => {
  it('applies defaults when the environment is empty', () => {
    expect(resolveConfig({})).toEqual({
      closeAfterMs: CLOSE_AFTER_MS,
      debounceMs: DEBOUNCE_MS,
      eventsDir: join(homedir(), '.codeassembly', 'events'),
      heartbeatMs: HEARTBEAT_MS,
      port: 4178,
      rescanMs: 5000,
      retentionMs: RETENTION_MS,
      staleMs: 90_000,
    });
  });

  it('reads every FLEET_* override from the environment', () => {
    const config = resolveConfig({
      FLEET_EVENTS_DIR: '/srv/events',
      FLEET_PORT: '9000',
      FLEET_RESCAN_MS: '250',
      FLEET_RETENTION_MS: '600000',
      FLEET_STALE_MS: '1000',
    });

    expect(config.eventsDir).toBe('/srv/events');
    expect(config.port).toBe(9000);
    expect(config.rescanMs).toBe(250);
    expect(config.retentionMs).toBe(600_000);
    expect(config.staleMs).toBe(1000);
  });

  it.each([
    ['empty', ''],
    ['non-numeric', 'not-a-number'],
  ])('when a numeric variable is %s, falls back to the default', (_label, value) => {
    expect(resolveConfig({ FLEET_PORT: value }).port).toBe(4178);
  });

  it('when the events dir is set to an empty string, falls back to the default', () => {
    expect(resolveConfig({ FLEET_EVENTS_DIR: '' }).eventsDir).toBe(join(homedir(), '.codeassembly', 'events'));
  });
});
