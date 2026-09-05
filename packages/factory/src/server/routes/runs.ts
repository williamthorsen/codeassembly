import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { isEnoent, RunDataParseError } from 'codeassembly-run-core';
import { parseRunData, parseRunRawData } from 'codeassembly-run-core/parsers';
import { type Request, type Response, Router } from 'express';
import { marked } from 'marked';

import type { ProjectIndexProvider } from '../../shared/types/api.ts';

interface RunParams {
  projectSlug: string;
  runId: string;
}

interface ArtifactParams extends RunParams {
  filename: string;
}

export function createRunsRouter(scanner: ProjectIndexProvider): Router {
  const router = Router();

  // GET /api/runs/:projectSlug/:runId - return full run status
  router.get('/:projectSlug/:runId', async (req: Request<RunParams>, res: Response) => {
    const { projectSlug, runId } = req.params;

    const runPath = findRunPath(scanner, projectSlug, runId);
    if (!runPath) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    try {
      const status = await parseRunData(runPath);
      res.json(status);
    } catch (error) {
      if (isEnoent(error)) {
        res.status(404).json({ error: 'Run data not found' });
        return;
      }
      console.error('Error getting run status:', error);
      res.status(500).json({ error: 'Failed to get run status' });
    }
  });

  // GET /api/runs/:projectSlug/:runId/events - return raw header + events for v3 runs
  router.get('/:projectSlug/:runId/events', async (req: Request<RunParams>, res: Response) => {
    const { projectSlug, runId } = req.params;

    const runPath = findRunPath(scanner, projectSlug, runId);
    if (!runPath) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    try {
      const { header, events } = await parseRunRawData(runPath);
      res.json({ header, events });
    } catch (error) {
      if (error instanceof RunDataParseError && error.category === 'no_event_log') {
        res.status(404).json({ error: 'Run does not have an event log' });
        return;
      }
      if (isEnoent(error)) {
        res.status(404).json({ error: 'Run data not found' });
        return;
      }
      console.error('Error getting run events:', error);
      res.status(500).json({ error: 'Failed to get run events' });
    }
  });

  // GET /api/runs/:projectSlug/:runId/artifacts - list all artifacts
  router.get('/:projectSlug/:runId/artifacts', async (req: Request<RunParams>, res: Response) => {
    const { projectSlug, runId } = req.params;

    const runPath = findRunPath(scanner, projectSlug, runId);
    if (!runPath) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    try {
      const files = await readdir(runPath);
      const artifacts = files.filter((f) => f.endsWith('.md') || f.endsWith('.json'));
      res.json({ artifacts });
    } catch (error) {
      console.error('Error listing artifacts:', error);
      res.status(500).json({ error: 'Failed to list artifacts' });
    }
  });

  // GET /api/runs/:projectSlug/:runId/artifacts/:filename - get artifact content
  router.get('/:projectSlug/:runId/artifacts/:filename', async (req: Request<ArtifactParams>, res: Response) => {
    const { projectSlug, runId, filename } = req.params;

    if (filename.includes('..') || filename.includes('/') || filename.includes('\\') || filename.includes('\0')) {
      res.status(400).json({ error: 'Invalid filename' });
      return;
    }

    const runPath = findRunPath(scanner, projectSlug, runId);
    if (!runPath) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    const artifactPath = join(runPath, filename);
    try {
      let content = await readFile(artifactPath, 'utf8');
      if (req.query.format === 'html' && filename.endsWith('.md')) {
        content = await marked.parse(content);
      }
      res.json({ content });
    } catch (error) {
      if (isEnoent(error)) {
        res.status(404).json({ error: 'Artifact not found' });
        return;
      }
      console.error('Error reading artifact:', error);
      res.status(500).json({ error: 'Failed to read artifact' });
    }
  });

  return router;
}

function findRunPath(scanner: ProjectIndexProvider, projectSlug: string, runId: string): string | undefined {
  const index = scanner.getIndex();
  if (!index) return undefined;

  for (const project of index.projects) {
    if (project.slug !== projectSlug) continue;
    for (const ticket of project.tickets) {
      for (const run of ticket.runs) {
        if (run.runId === runId) return run.path;
      }
    }
  }
  return undefined;
}
