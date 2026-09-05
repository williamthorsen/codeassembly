import { CatwalkCanvas } from '../components/CatwalkCanvas.tsx';
import { FactoryFloorCanvas } from '../components/FactoryFloorCanvas.tsx';
import { OfficeCanvas } from '../components/OfficeCanvas.tsx';
import type { VisualizationComponent } from './types.ts';

/** Registry mapping visualization names to their React components. */
export const visualizationRegistry: Record<string, VisualizationComponent> = {
  catwalk: CatwalkCanvas,
  'factory-floor': FactoryFloorCanvas,
  office: OfficeCanvas,
};

/** Default visualization key used when the `vis` URL param is absent. */
export const DEFAULT_VIS = 'catwalk';
