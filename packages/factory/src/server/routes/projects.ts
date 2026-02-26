import type { Request, Response } from 'express';
import { Router } from 'express';

import type { ProjectIndexProvider } from '../../shared/types/api.js';

export function createProjectsRouter(scanner: ProjectIndexProvider): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    const index = scanner.getIndex();
    if (!index) {
      res.status(503).json({ error: 'Index not ready' });
      return;
    }
    res.json(index);
  });

  return router;
}
