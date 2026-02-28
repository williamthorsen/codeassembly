import type { Request, Response } from 'express';
import { Router } from 'express';

import { userSettingsSchema } from '../adapters/schemas/settings-schema.js';
import type { SettingsStore } from '../services/settings-store.js';

export function createSettingsRouter(store: SettingsStore): Router {
  const router = Router();

  router.get('/', async (_req: Request, res: Response) => {
    try {
      const settings = await store.load();
      res.json(settings);
    } catch (error) {
      console.error('Failed to load settings:', error);
      res.status(500).json({ error: 'Failed to load settings' });
    }
  });

  router.patch('/', async (req: Request, res: Response) => {
    const result = userSettingsSchema.partial().safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Invalid settings', details: result.error.issues });
      return;
    }

    try {
      const merged = await store.patch(result.data);
      res.json(merged);
    } catch (error) {
      console.error('Failed to update settings:', error);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  return router;
}
