import { describe, expect, it } from 'vitest';

import { composeManifest } from '../compose-manifest.ts';
import type { ResolvedPreferences } from '../types.ts';

const NOW = new Date('2026-05-26T02:07:41Z');
const HOME = '/Users/test';
const CWD = '/Users/test/repos/codeassembly';

const DEFAULT_PATHS = { chats: 'chats', devlogs: 'devlogs', plans: 'plans' };

describe(composeManifest, () => {
  // Each it() below corresponds to a numbered worked example originally documented in the
  // now-retired `get-session-context` skill. The cases are preserved here as the test oracle for
  // the manifest composer; see `_data/ticket-id-extraction.md` for the canonical extraction rules.

  it('1: structured branch with workspace and work-type segments', () => {
    const prefs: ResolvedPreferences = { project: { slug: 'configs-macos' } };
    const manifest = composeManifest({
      preferences: prefs,
      branchName: 'MAC-130/agents/feat/branch-manifest',
      cwd: CWD,
      home: HOME,
      now: NOW,
    });
    expect(manifest.ticket_id).toBe('MAC-130');
    expect(manifest.ticket_ref).toBe('MAC-130');
    expect(manifest.project_slug).toBe('configs-macos');
    expect(manifest.branch_name).toBe('MAC-130/agents/feat/branch-manifest');
  });

  it('2: simple branch with description', () => {
    const manifest = composeManifest({
      preferences: { project: { slug: 'example-project' } },
      branchName: 'PT-456/fix/login-redirect',
      cwd: CWD,
      home: HOME,
      now: NOW,
    });
    expect(manifest.ticket_id).toBe('PT-456');
    expect(manifest.ticket_ref).toBe('PT-456');
  });

  it('3: lowercase ticket ID is normalized to uppercase', () => {
    const manifest = composeManifest({
      preferences: { project: { slug: 'configs-macos' } },
      branchName: 'mac-147',
      cwd: CWD,
      home: HOME,
      now: NOW,
    });
    expect(manifest.ticket_id).toBe('MAC-147');
    expect(manifest.branch_name).toBe('mac-147');
  });

  it('4: non-ticket branch produces null ticket fields', () => {
    const manifest = composeManifest({
      preferences: { project: { slug: 'example-project' } },
      branchName: 'experiment/try-new-parser',
      cwd: CWD,
      home: HOME,
      now: NOW,
    });
    expect(manifest.ticket_id).toBeNull();
    expect(manifest.ticket_ref).toBeNull();
  });

  it('5: underscore-separated branch is equivalent to slash-separated', () => {
    const manifest = composeManifest({
      preferences: { project: { slug: 'configs-macos' } },
      branchName: 'MAC-130_agents_feat_branch-manifest',
      cwd: CWD,
      home: HOME,
      now: NOW,
    });
    expect(manifest.ticket_id).toBe('MAC-130');
  });

  it('6: sub-ticket suffix is dropped from ticket_id but preserved in branch_name', () => {
    const manifest = composeManifest({
      preferences: { project: { slug: 'example-project' } },
      branchName: 'NMR-567.2/fix/regression',
      cwd: CWD,
      home: HOME,
      now: NOW,
    });
    expect(manifest.ticket_id).toBe('NMR-567');
    expect(manifest.branch_name).toBe('NMR-567.2/fix/regression');
  });

  it('7: ticket-ID-only branch', () => {
    const manifest = composeManifest({
      preferences: { project: { slug: 'example-project' } },
      branchName: 'MAC-200',
      cwd: CWD,
      home: HOME,
      now: NOW,
    });
    expect(manifest.ticket_id).toBe('MAC-200');
    expect(manifest.branch_name).toBe('MAC-200');
  });

  it('8: single-letter prefix is not a valid ticket ID', () => {
    const manifest = composeManifest({
      preferences: { project: { slug: 'example-project' } },
      branchName: 'a-1-test',
      cwd: CWD,
      home: HOME,
      now: NOW,
    });
    expect(manifest.ticket_id).toBeNull();
    expect(manifest.ticket_ref).toBeNull();
  });

  it('9: bare-numeric branch with configured Jira-style prefix', () => {
    const manifest = composeManifest({
      preferences: { project: { slug: 'configs-macos', ticket_ref_prefix: 'MAC-' } },
      branchName: '147/feat/improve-parser',
      cwd: CWD,
      home: HOME,
      now: NOW,
    });
    expect(manifest.ticket_id).toBe('MAC-147');
    expect(manifest.ticket_ref).toBe('MAC-147');
  });

  it('10: bare-numeric branch without configured prefix returns the bare number', () => {
    const manifest = composeManifest({
      preferences: { project: { slug: 'example-project' } },
      branchName: '42_fix_login-redirect',
      cwd: CWD,
      home: HOME,
      now: NOW,
    });
    expect(manifest.ticket_id).toBe('42');
    expect(manifest.ticket_ref).toBe('42');
  });

  it('11: bare-numeric branch with # display prefix', () => {
    // ticket_id and ticket_ref differ: id is the bare number, ref is '#152'.
    const manifest = composeManifest({
      preferences: { project: { slug: 'codeassembly', ticket_ref_prefix: '#' } },
      branchName: '152',
      cwd: CWD,
      home: HOME,
      now: NOW,
    });
    expect(manifest.ticket_id).toBe('152');
    expect(manifest.ticket_ref).toBe('#152');
  });

  it('12: author-prefixed lowercase branch', () => {
    const manifest = composeManifest({
      preferences: { project: { slug: 'configs-macos' } },
      branchName: 'wt/mac-130',
      cwd: CWD,
      home: HOME,
      now: NOW,
    });
    expect(manifest.ticket_id).toBe('MAC-130');
    expect(manifest.branch_name).toBe('wt/mac-130');
  });

  it('13: custom artifact base directory (relative path) resolves against cwd', () => {
    const cwd = '/Users/william/repos/myproject';
    const manifest = composeManifest({
      preferences: {
        project: { slug: 'myproject' },
        artifacts: { base_dir: 'ai-artifacts' },
      },
      branchName: 'MAC-200/feat/new-feature',
      cwd,
      home: HOME,
      now: NOW,
    });
    expect(manifest.artifact_base_dir).toBe('/Users/william/repos/myproject/ai-artifacts');
  });

  describe('defaults and fallbacks', () => {
    it('defaults scm to github when not configured', () => {
      const manifest = composeManifest({
        preferences: { project: { slug: 'x' } },
        branchName: 'main',
        cwd: CWD,
        home: HOME,
        now: NOW,
      });
      expect(manifest.scm).toBe('github');
    });

    it('defaults default_branch to origin/main when no remote configured', () => {
      const manifest = composeManifest({
        preferences: { project: { slug: 'x' } },
        branchName: 'main',
        cwd: CWD,
        home: HOME,
        now: NOW,
      });
      expect(manifest.default_branch).toBe('origin/main');
    });

    it('uses configured repository.default_remote values', () => {
      const manifest = composeManifest({
        preferences: {
          project: { slug: 'x' },
          repository: { default_remote: { name: 'upstream', default_branch: 'trunk' } },
        },
        branchName: 'main',
        cwd: CWD,
        home: HOME,
        now: NOW,
      });
      expect(manifest.default_branch).toBe('upstream/trunk');
    });

    it('falls back to repository.slug then to working-dir basename for project_slug', () => {
      const fromRepo = composeManifest({
        preferences: { repository: { slug: 'repo-slug' } },
        branchName: 'main',
        cwd: '/anything',
        home: HOME,
        now: NOW,
      });
      expect(fromRepo.project_slug).toBe('repo-slug');

      const fromCwd = composeManifest({
        preferences: {},
        branchName: 'main',
        cwd: '/Users/test/repos/codeassembly',
        home: HOME,
        now: NOW,
      });
      expect(fromCwd.project_slug).toBe('codeassembly');
    });

    it('expands ~ in artifact base_dir against home', () => {
      const manifest = composeManifest({
        preferences: { project: { slug: 'x' }, artifacts: { base_dir: '~/custom-artifacts' } },
        branchName: 'main',
        cwd: CWD,
        home: '/Users/test',
        now: NOW,
      });
      expect(manifest.artifact_base_dir).toBe('/Users/test/custom-artifacts');
    });

    it('defaults artifact base_dir to ~/ai-artifacts when not configured', () => {
      const manifest = composeManifest({
        preferences: { project: { slug: 'x' } },
        branchName: 'main',
        cwd: CWD,
        home: '/Users/test',
        now: NOW,
      });
      expect(manifest.artifact_base_dir).toBe('/Users/test/ai-artifacts');
    });

    it('defaults artifact_paths and merges configured overrides', () => {
      const withDefaults = composeManifest({
        preferences: { project: { slug: 'x' } },
        branchName: 'main',
        cwd: CWD,
        home: HOME,
        now: NOW,
      });
      expect(withDefaults.artifact_paths).toEqual(DEFAULT_PATHS);

      const overridden = composeManifest({
        preferences: {
          project: { slug: 'x' },
          artifacts: { paths: { chats: 'transcripts' } },
        },
        branchName: 'main',
        cwd: CWD,
        home: HOME,
        now: NOW,
      });
      expect(overridden.artifact_paths).toEqual({ ...DEFAULT_PATHS, chats: 'transcripts' });
    });

    it('emits created_at as an ISO 8601 UTC string trimmed to seconds', () => {
      const manifest = composeManifest({
        preferences: { project: { slug: 'x' } },
        branchName: 'main',
        cwd: CWD,
        home: HOME,
        now: NOW,
      });
      expect(manifest.created_at).toBe('2026-05-26T02:07:41Z');
    });

    it('seeds ticket_url and pr_url to null on a fresh compose', () => {
      const manifest = composeManifest({
        preferences: { project: { slug: 'x' } },
        branchName: 'main',
        cwd: CWD,
        home: HOME,
        now: NOW,
      });
      expect(manifest.ticket_url).toBeNull();
      expect(manifest.pr_url).toBeNull();
    });
  });

  describe('ticket URL construction', () => {
    it('constructs ticket_url from base_url and a Jira-style ticket id', () => {
      const manifest = composeManifest({
        preferences: { project: { slug: 'x' }, ticket: { base_url: 'https://org.atlassian.net/browse/' } },
        branchName: 'MAC-130/feat/x',
        cwd: CWD,
        home: HOME,
        now: NOW,
      });
      expect(manifest.ticket_base_url).toBe('https://org.atlassian.net/browse/');
      expect(manifest.ticket_url).toBe('https://org.atlassian.net/browse/MAC-130');
    });

    it('appends the bare ticket id, not the display ref, for a #-prefixed numeric ticket', () => {
      const manifest = composeManifest({
        preferences: {
          project: { slug: 'x', ticket_ref_prefix: '#' },
          ticket: { base_url: 'https://github.com/owner/repo/issues/' },
        },
        branchName: '152',
        cwd: CWD,
        home: HOME,
        now: NOW,
      });
      expect(manifest.ticket_ref).toBe('#152');
      expect(manifest.ticket_url).toBe('https://github.com/owner/repo/issues/152');
    });

    it('normalizes the base/id boundary to one slash when the base lacks a trailing slash', () => {
      const manifest = composeManifest({
        preferences: { project: { slug: 'x' }, ticket: { base_url: 'https://org.atlassian.net/browse' } },
        branchName: 'MAC-130',
        cwd: CWD,
        home: HOME,
        now: NOW,
      });
      expect(manifest.ticket_url).toBe('https://org.atlassian.net/browse/MAC-130');
    });

    it('leaves ticket_url null when no base_url is configured', () => {
      const manifest = composeManifest({
        preferences: { project: { slug: 'x' } },
        branchName: 'MAC-130',
        cwd: CWD,
        home: HOME,
        now: NOW,
      });
      expect(manifest.ticket_base_url).toBeNull();
      expect(manifest.ticket_url).toBeNull();
    });

    it('leaves ticket_url null when a base_url is set but no ticket id can be derived', () => {
      const manifest = composeManifest({
        preferences: { project: { slug: 'x' }, ticket: { base_url: 'https://org.atlassian.net/browse/' } },
        branchName: 'experiment/no-ticket',
        cwd: CWD,
        home: HOME,
        now: NOW,
      });
      expect(manifest.ticket_id).toBeNull();
      expect(manifest.ticket_base_url).toBe('https://org.atlassian.net/browse/');
      expect(manifest.ticket_url).toBeNull();
    });

    it('leaves ticket_url null for a PR-sentinel id even when a base_url is configured', () => {
      const manifest = composeManifest({
        preferences: { project: { slug: 'x' }, ticket: { base_url: 'https://org.atlassian.net/browse/' } },
        branchName: 'PR-123',
        cwd: CWD,
        home: HOME,
        now: NOW,
      });
      expect(manifest.ticket_id).toBe('PR-123');
      expect(manifest.ticket_base_url).toBe('https://org.atlassian.net/browse/');
      expect(manifest.ticket_url).toBeNull();
    });
  });

  describe('PR URL construction', () => {
    it('constructs a GitHub pr_url from a PR-<n> identity and an SSH remote', () => {
      const manifest = composeManifest({
        preferences: { project: { slug: 'x' } },
        branchName: 'PR-950',
        cwd: CWD,
        home: HOME,
        now: NOW,
        remoteUrl: 'git@github.com:owner/repo.git',
      });
      expect(manifest.ticket_id).toBe('PR-950');
      expect(manifest.pr_url).toBe('https://github.com/owner/repo/pull/950');
    });

    it('constructs a GitHub pr_url from an HTTPS remote, stripping the .git suffix', () => {
      const manifest = composeManifest({
        preferences: { project: { slug: 'x' } },
        branchName: 'PR-42',
        cwd: CWD,
        home: HOME,
        now: NOW,
        remoteUrl: 'https://github.com/owner/repo.git',
      });
      expect(manifest.pr_url).toBe('https://github.com/owner/repo/pull/42');
    });

    it('uses the Bitbucket URL shape when scm is bitbucket', () => {
      const manifest = composeManifest({
        preferences: { scm: 'bitbucket', project: { slug: 'x' } },
        branchName: 'PR-7',
        cwd: CWD,
        home: HOME,
        now: NOW,
        remoteUrl: 'git@bitbucket.org:workspace/repo.git',
      });
      expect(manifest.pr_url).toBe('https://bitbucket.org/workspace/repo/pull-requests/7');
    });

    it('leaves pr_url null for a non-PR identity even when a remote is present', () => {
      const manifest = composeManifest({
        preferences: { project: { slug: 'x' } },
        branchName: 'MAC-130',
        cwd: CWD,
        home: HOME,
        now: NOW,
        remoteUrl: 'git@github.com:owner/repo.git',
      });
      expect(manifest.pr_url).toBeNull();
    });

    it('leaves pr_url null for a PR identity when no remote is known', () => {
      const manifest = composeManifest({
        preferences: { project: { slug: 'x' } },
        branchName: 'PR-950',
        cwd: CWD,
        home: HOME,
        now: NOW,
        remoteUrl: null,
      });
      expect(manifest.pr_url).toBeNull();
    });

    it('leaves pr_url null when the remote cannot be parsed to owner/repo', () => {
      const manifest = composeManifest({
        preferences: { project: { slug: 'x' } },
        branchName: 'PR-950',
        cwd: CWD,
        home: HOME,
        now: NOW,
        remoteUrl: 'not-a-remote-url',
      });
      expect(manifest.pr_url).toBeNull();
    });
  });
});
