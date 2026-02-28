import type { Request, Response } from 'express';
import { Router } from 'express';

import type { UserSettings } from '../../shared/types/settings.js';
import { userSettingsSchema } from '../adapters/schemas/settings-schema.js';

/** Public interface consumed by the settings route. */
export interface SettingsProvider {
  load(): Promise<UserSettings>;
  patch(partial: Partial<UserSettings>): Promise<UserSettings>;
}

export function createSettingsRouter(store: SettingsProvider): Router {
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

    // Build a typed partial — Zod's .partial() infers `T | undefined` for each key, which
    // is not assignable to Partial<UserSettings> under exactOptionalPropertyTypes.
    const partial: Partial<UserSettings> = {};
    if (result.data.dismissedRuns !== undefined) {
      partial.dismissedRuns = result.data.dismissedRuns;
    }

    try {
      const merged = await store.patch(partial);
      res.json(merged);
    } catch (error) {
      console.error('Failed to update settings:', error);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  return router;
}
