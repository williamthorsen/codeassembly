import { CatwalkCanvas } from '../components/CatwalkCanvas.js';
import { FactoryFloorCanvas } from '../components/FactoryFloorCanvas.js';
import { OfficeCanvas } from '../components/OfficeCanvas.js';
import type { VisualizationComponent } from './types.js';

/** Registry mapping visualization names to their React components. */
export const visualizationRegistry: Record<string, VisualizationComponent> = {
  catwalk: CatwalkCanvas,
  'factory-floor': FactoryFloorCanvas,
  office: OfficeCanvas,
};

/** Default visualization key used when the `vis` URL param is absent. */
export const DEFAULT_VIS = 'catwalk';
