import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Request, Response } from 'express';
import { Router } from 'express';

import type { ProjectIndexProvider } from '../../shared/types/api.js';
import { parseStatusFile } from '../adapters/status-adapter.js';

function isEnoent(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

export function createRunsRouter(scanner: ProjectIndexProvider): Router {
  const router = Router();

  // GET /api/runs/:projectSlug/:runId - return full run status
  router.get('/:projectSlug/:runId', async (req: Request, res: Response) => {
    const { projectSlug, runId } = req.params;
    if (typeof projectSlug !== 'string' || typeof runId !== 'string') {
      res.status(400).json({ error: 'Missing required parameters' });
      return;
    }

    const runPath = findRunPath(scanner, projectSlug, runId);
    if (!runPath) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    const statusPath = join(runPath, 'status.json');
    try {
      const status = await parseStatusFile(statusPath);
      res.json(status);
    } catch (error) {
      if (isEnoent(error)) {
        res.status(404).json({ error: 'Status file not found' });
        return;
      }
      console.error('Error getting run status:', error);
      res.status(500).json({ error: 'Failed to get run status' });
    }
  });

  // GET /api/runs/:projectSlug/:runId/artifacts - list all artifacts
  router.get('/:projectSlug/:runId/artifacts', async (req: Request, res: Response) => {
    const { projectSlug, runId } = req.params;
    if (typeof projectSlug !== 'string' || typeof runId !== 'string') {
      res.status(400).json({ error: 'Missing required parameters' });
      return;
    }

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
  router.get('/:projectSlug/:runId/artifacts/:filename', async (req: Request, res: Response) => {
    const { projectSlug, runId, filename } = req.params;
    if (typeof projectSlug !== 'string' || typeof runId !== 'string' || typeof filename !== 'string') {
      res.status(400).json({ error: 'Missing required parameters' });
      return;
    }

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
      const content = await readFile(artifactPath, 'utf8');
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
