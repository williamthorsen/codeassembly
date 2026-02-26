import type { Request, Response } from 'express';
import { Router } from 'express';

import type { ProjectScanner } from '../services/project-scanner.js';

export function createProjectsRouter(scanner: ProjectScanner): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    try {
      const index = scanner.getIndex();
      if (!index) {
        res.status(503).json({ error: 'Index not ready' });
        return;
      }
      res.json(index);
    } catch (error) {
      console.error('Error getting projects:', error);
      res.status(500).json({ error: 'Failed to get projects' });
    }
  });

  return router;
}
