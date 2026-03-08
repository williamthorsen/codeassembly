import orchestratorUrl from './assets/orchestrator.svg';
import subagentUrl from './assets/subagent.svg';

/** Identifies the two sprite sheet types used by the catwalk visualization. */
export type CatwalkSpriteType = 'subagent' | 'orchestrator';

/** Maps each catwalk sprite type to the URL of its sprite sheet asset. */
export const SPRITE_SHEET_URLS: Record<CatwalkSpriteType, string> = {
  subagent: subagentUrl,
  orchestrator: orchestratorUrl,
};
