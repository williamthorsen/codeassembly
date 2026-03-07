import { beforeEach, describe, expect, it, vi } from 'vitest';

import { discoverRunDirectories } from '../run-directory-scanner.js';

const { mockedReaddir, mockedStat } = vi.hoisted(() => ({
  mockedReaddir: vi.fn(),
  mockedStat: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  default: { readdir: mockedReaddir, stat: mockedStat },
  readdir: mockedReaddir,
  stat: mockedStat,
}));

function mockReaddirResult(names: string[]): void {
  mockedReaddir.mockResolvedValueOnce(names);
}

function mockStatDirectory(isDir = true): void {
  mockedStat.mockResolvedValueOnce({ isDirectory: () => isDir });
}

describe('discoverRunDirectories', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('discovers run directories using Pattern 1 (tickets/ subdirectory)', async () => {
    // base -> [factory]
    mockReaddirResult(['factory']);
    mockStatDirectory();
    // factory -> [tickets]
    mockReaddirResult(['tickets']);
    // factory/tickets -> [TICKET-1]
    mockReaddirResult(['TICKET-1']);
    mockStatDirectory();
    // factory/tickets/TICKET-1 -> [run-1]
    mockReaddirResult(['run-1']);
    mockStatDirectory();

    const result = await discoverRunDirectories('/base');

    expect(result).toEqual([
      {
        projectSlug: 'factory',
        ticketId: 'TICKET-1',
        runId: 'run-1',
        runPath: '/base/factory/tickets/TICKET-1/run-1',
      },
    ]);
  });

  it('discovers run directories using Pattern 2 (no tickets/ directory)', async () => {
    mockReaddirResult(['rad-app']);
    mockStatDirectory();
    mockReaddirResult(['RAD-1']);
    mockStatDirectory();
    mockReaddirResult(['run-1']);
    mockStatDirectory();

    const result = await discoverRunDirectories('/base');

    expect(result).toEqual([
      {
        projectSlug: 'rad-app',
        ticketId: 'RAD-1',
        runId: 'run-1',
        runPath: '/base/rad-app/RAD-1/run-1',
      },
    ]);
  });

  it('prefers Pattern 1 when tickets/ directory exists alongside other entries', async () => {
    mockReaddirResult(['proj']);
    mockStatDirectory();
    mockReaddirResult(['tickets', 'OTHER-1']);
    // Pattern 1: scan tickets/
    mockReaddirResult(['TICKET-1']);
    mockStatDirectory();
    mockReaddirResult(['run-1']);
    mockStatDirectory();

    const result = await discoverRunDirectories('/base');

    expect(result).toHaveLength(1);
    expect(result[0]?.ticketId).toBe('TICKET-1');
  });

  it('skips hidden directories at project level', async () => {
    mockReaddirResult(['.hidden', 'visible']);
    mockStatDirectory(); // stat for visible
    mockReaddirResult([]); // visible has no entries

    const result = await discoverRunDirectories('/base');

    expect(result).toEqual([]);
    expect(mockedStat).toHaveBeenCalledTimes(1); // only visible was stat'd
  });

  it('skips hidden directories at ticket level', async () => {
    mockReaddirResult(['proj']);
    mockStatDirectory();
    mockReaddirResult(['.hidden-ticket', 'TICKET-1']);
    mockStatDirectory(); // stat for TICKET-1
    mockReaddirResult([]); // TICKET-1 has no runs

    const result = await discoverRunDirectories('/base');

    expect(result).toEqual([]);
  });

  it('skips directories ending with -interactive', async () => {
    mockReaddirResult(['proj']);
    mockStatDirectory();
    mockReaddirResult(['TICKET-1']);
    mockStatDirectory();
    mockReaddirResult(['run-1-interactive', 'run-2']);
    // No stat for -interactive — skipped before stat
    mockStatDirectory(); // stat for run-2

    const result = await discoverRunDirectories('/base');

    expect(result).toHaveLength(1);
    expect(result[0]?.runId).toBe('run-2');
  });

  it('skips non-directory entries', async () => {
    mockReaddirResult(['file.txt', 'proj']);
    mockStatDirectory(false); // file.txt is not a directory
    mockStatDirectory(true); // proj is a directory
    mockReaddirResult([]); // proj has no entries

    const result = await discoverRunDirectories('/base');

    expect(result).toEqual([]);
  });

  it('returns empty array when base directory is empty', async () => {
    mockReaddirResult([]);

    const result = await discoverRunDirectories('/base');

    expect(result).toEqual([]);
  });

  it('returns empty array when base directory does not exist', async () => {
    const error = new Error('ENOENT');
    Object.assign(error, { code: 'ENOENT' });
    mockedReaddir.mockRejectedValueOnce(error);

    const result = await discoverRunDirectories('/nonexistent');

    expect(result).toEqual([]);
  });

  it('discovers multiple runs across multiple projects and tickets', async () => {
    // base -> [proj-a, proj-b]
    mockReaddirResult(['proj-a', 'proj-b']);
    mockStatDirectory(); // proj-a
    mockStatDirectory(); // proj-b

    // proj-a -> [TICKET-1] (Pattern 2)
    mockReaddirResult(['TICKET-1']);
    mockStatDirectory();
    mockReaddirResult(['run-1', 'run-2']);
    mockStatDirectory(); // run-1
    mockStatDirectory(); // run-2

    // proj-b -> [tickets] (Pattern 1)
    mockReaddirResult(['tickets']);
    mockReaddirResult(['T-1']);
    mockStatDirectory();
    mockReaddirResult(['run-3']);
    mockStatDirectory();

    const result = await discoverRunDirectories('/base');

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.runId)).toEqual(['run-1', 'run-2', 'run-3']);
  });
});
