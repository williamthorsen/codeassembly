import { CatwalkCanvas } from '../components/CatwalkCanvas.js';
import { FactoryFloorCanvas } from '../components/FactoryFloorCanvas.js';
import { TilemapCanvas } from '../components/TilemapCanvas.js';
import type { VisualizationComponent } from './types.js';

/** Registry mapping visualization names to their React components. */
export const visualizationRegistry: Record<string, VisualizationComponent> = {
  catwalk: CatwalkCanvas,
  'factory-floor': FactoryFloorCanvas,
  tilemap: TilemapCanvas,
};

/** Default visualization key used when the `vis` URL param is absent. */
export const DEFAULT_VIS = 'catwalk';
