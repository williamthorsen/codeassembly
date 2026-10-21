import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveClosure } from '../dependency-resolver.ts';
import {
  buildSingleSourceResolver,
  writeArtifact,
  writeArtifactWithBody,
  writeRulebookPartial,
  writeSkillPartial,
  writeSubagent,
} from '../test-utils/resolver-fixtures.ts';

describe(resolveClosure, () => {
  let contentDir: string;

  beforeEach(async () => {
    contentDir = path.join(tmpdir(), `agents-test-resolver-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(contentDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(contentDir, { recursive: true, force: true });
  });

  describe('body invocation tokens', () => {
    it('pulls a skill body invocation token into the closure', async () => {
      await writeArtifact(contentDir, 'skill', 'capture-event');
      await writeArtifactWithBody(contentDir, 'skill', 'wrap-up', 'Invoke {skill:capture-event} to record it.');

      const closure = await resolveClosure({ skill: ['wrap-up'] }, buildSingleSourceResolver(contentDir));

      expect(closure.skills.toSorted()).toEqual(['capture-event', 'wrap-up']);
    });

    it('pulls a subagent body invocation token into the closure', async () => {
      await writeArtifact(contentDir, 'subagent', 'planner');
      await writeArtifactWithBody(contentDir, 'subagent', 'orchestrator', 'Dispatch {subagent:planner} first.');

      const closure = await resolveClosure({ subagent: ['orchestrator'] }, buildSingleSourceResolver(contentDir));

      expect(closure.subagents.toSorted()).toEqual(['orchestrator', 'planner']);
    });

    it('pulls a token in an included partial into the closure', async () => {
      await writeArtifact(contentDir, 'skill', 'capture-event');
      await writeSkillPartial(contentDir, 'wrap-up', 'frag.md', 'Then invoke {skill:capture-event}.');
      await writeArtifactWithBody(contentDir, 'skill', 'wrap-up', '# wrap-up\n\n<!-- include: _partials/frag.md / -->');

      const closure = await resolveClosure({ skill: ['wrap-up'] }, buildSingleSourceResolver(contentDir));

      expect(closure.skills.toSorted()).toEqual(['capture-event', 'wrap-up']);
    });

    it('pulls a token in a rulebook-inlined partial into the closure', async () => {
      await writeArtifact(contentDir, 'skill', 'capture-event');
      await writeRulebookPartial(contentDir, 'frag.md', 'Then invoke {skill:capture-event}.');
      await writeArtifactWithBody(
        contentDir,
        'rulebook',
        'nmr-scripts',
        '# nmr-scripts\n\n<!-- include: _partials/frag.md / -->',
      );

      const closure = await resolveClosure({ rulebook: ['nmr-scripts'] }, buildSingleSourceResolver(contentDir));

      expect(closure).toEqual({ rulebooks: ['nmr-scripts'], skills: ['capture-event'], subagents: [] });
    });

    it("pulls a subagent's injected rulebook into the closure", async () => {
      await writeArtifact(contentDir, 'rulebook', 'review-criteria');
      await writeArtifact(contentDir, 'skill', 'anti-patterns');
      await writeSubagent(contentDir, 'orchestrated-coder', ['anti-patterns'], undefined, ['review-criteria']);

      const closure = await resolveClosure({ subagent: ['orchestrated-coder'] }, buildSingleSourceResolver(contentDir));

      expect(closure).toEqual({
        rulebooks: ['review-criteria'],
        skills: ['anti-patterns'],
        subagents: ['orchestrated-coder'],
      });
    });

    it('fails the run when an injected rulebook names a non-existent artifact', async () => {
      await writeArtifact(contentDir, 'skill', 'anti-patterns');
      await writeSubagent(contentDir, 'orchestrated-coder', ['anti-patterns'], undefined, ['ghost']);

      await expect(
        resolveClosure({ subagent: ['orchestrated-coder'] }, buildSingleSourceResolver(contentDir)),
      ).rejects.toThrow(/rulebook "ghost", named by subagent:orchestrated-coder, was not found/);
    });

    it('fails the run when a body token names a non-existent artifact', async () => {
      await writeArtifactWithBody(contentDir, 'skill', 'wrap-up', 'Invoke {skill:ghost}.');

      await expect(resolveClosure({ skill: ['wrap-up'] }, buildSingleSourceResolver(contentDir))).rejects.toThrow(
        /skill "ghost", named by skill:wrap-up, was not found/,
      );
    });

    it('deduplicates a slug named by both a body token and a dependencies edge', async () => {
      await writeArtifact(contentDir, 'skill', 'capture-event');
      await writeArtifactWithBody(contentDir, 'skill', 'wrap-up', 'Invoke {skill:capture-event}.', {
        skill: ['capture-event'],
      });

      const closure = await resolveClosure({ skill: ['wrap-up'] }, buildSingleSourceResolver(contentDir));

      expect(closure.skills.toSorted()).toEqual(['capture-event', 'wrap-up']);
    });

    it('pulls a skill named by a rulebook body token into the closure', async () => {
      await writeArtifact(contentDir, 'skill', 'capture-event');
      await writeArtifactWithBody(contentDir, 'rulebook', 'some-rulebook', 'Invoke {skill:capture-event}.');

      const closure = await resolveClosure({ rulebook: ['some-rulebook'] }, buildSingleSourceResolver(contentDir));

      expect(closure).toEqual({ rulebooks: ['some-rulebook'], skills: ['capture-event'], subagents: [] });
    });

    it('pulls a subagent named by a rulebook body token into the closure', async () => {
      await writeArtifact(contentDir, 'subagent', 'planner');
      await writeArtifactWithBody(contentDir, 'rulebook', 'some-rulebook', 'Dispatch {subagent:planner}.');

      const closure = await resolveClosure({ rulebook: ['some-rulebook'] }, buildSingleSourceResolver(contentDir));

      expect(closure).toEqual({ rulebooks: ['some-rulebook'], skills: [], subagents: ['planner'] });
    });

    it('pulls a rulebook named by a rulebook body token into the closure', async () => {
      await writeArtifact(contentDir, 'rulebook', 'nmr-scripts');
      await writeArtifactWithBody(contentDir, 'rulebook', 'nmr-cheatsheet', 'See {rulebook:nmr-scripts}.');

      const closure = await resolveClosure({ rulebook: ['nmr-cheatsheet'] }, buildSingleSourceResolver(contentDir));

      expect(closure.rulebooks.toSorted()).toEqual(['nmr-cheatsheet', 'nmr-scripts']);
    });

    it('drops a rulebook body self-token so that a self-reference renders without becoming an edge', async () => {
      await writeArtifactWithBody(contentDir, 'rulebook', 'nmr-scripts', 'Re-read {rulebook:nmr-scripts} for detail.');

      const closure = await resolveClosure({ rulebook: ['nmr-scripts'] }, buildSingleSourceResolver(contentDir));

      expect(closure.rulebooks).toEqual(['nmr-scripts']);
    });

    it('pulls a rulebook named by a skill body token into the closure', async () => {
      await writeArtifact(contentDir, 'rulebook', 'nmr-scripts');
      await writeArtifactWithBody(contentDir, 'skill', 'wrap-up', 'See {rulebook:nmr-scripts}.');

      const closure = await resolveClosure({ skill: ['wrap-up'] }, buildSingleSourceResolver(contentDir));

      expect(closure).toEqual({ rulebooks: ['nmr-scripts'], skills: ['wrap-up'], subagents: [] });
    });

    it('pulls a rulebook named by a subagent body token into the closure', async () => {
      await writeArtifact(contentDir, 'rulebook', 'nmr-scripts');
      await writeArtifactWithBody(contentDir, 'subagent', 'planner', 'See {rulebook:nmr-scripts}.');

      const closure = await resolveClosure({ subagent: ['planner'] }, buildSingleSourceResolver(contentDir));

      expect(closure).toEqual({ rulebooks: ['nmr-scripts'], skills: [], subagents: ['planner'] });
    });

    it('keeps a rulebook and a skill of the same slug as distinct edges', async () => {
      await writeArtifact(contentDir, 'rulebook', 'commit');
      await writeArtifactWithBody(contentDir, 'skill', 'commit', 'See {rulebook:commit} for the format.');

      const closure = await resolveClosure({ skill: ['commit'] }, buildSingleSourceResolver(contentDir));

      expect(closure).toEqual({ rulebooks: ['commit'], skills: ['commit'], subagents: [] });
    });

    it('drops a skill body self-token so that a self-reference renders without becoming an edge', async () => {
      await writeArtifactWithBody(
        contentDir,
        'skill',
        'capture-feedback',
        'Invoke {skill:capture-feedback} on feedback.',
      );

      const closure = await resolveClosure({ skill: ['capture-feedback'] }, buildSingleSourceResolver(contentDir));

      expect(closure.skills).toEqual(['capture-feedback']);
    });

    it('drops a subagent body self-token so that a self-reference renders without becoming an edge', async () => {
      await writeArtifactWithBody(contentDir, 'subagent', 'planner', 'Re-dispatch {subagent:planner} to continue.');

      const closure = await resolveClosure({ subagent: ['planner'] }, buildSingleSourceResolver(contentDir));

      expect(closure.subagents).toEqual(['planner']);
    });

    it('still throws on a genuine cycle formed by body tokens', async () => {
      await writeArtifactWithBody(contentDir, 'skill', 'alpha', 'See {skill:beta}.');
      await writeArtifactWithBody(contentDir, 'skill', 'beta', 'See {skill:alpha}.');

      await expect(resolveClosure({ skill: ['alpha'] }, buildSingleSourceResolver(contentDir))).rejects.toThrow(
        /cycle.*skill:alpha → skill:beta → skill:alpha/s,
      );
    });

    it('still throws on a self-dependency declared in frontmatter', async () => {
      await writeArtifactWithBody(contentDir, 'skill', 'selfdep', '# selfdep', { skill: ['selfdep'] });

      await expect(resolveClosure({ skill: ['selfdep'] }, buildSingleSourceResolver(contentDir))).rejects.toThrow(
        /cycle.*skill:selfdep → skill:selfdep/s,
      );
    });
  });
});
