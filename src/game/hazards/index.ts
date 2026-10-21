/** Directeur des obstacles : PNJ perturbateurs, pièges des cloches, événements de salle. */
import type { CreateHazards, HazardDirector } from './api';
import { Director } from './director';

export { Director } from './director';

export const createHazards: CreateHazards = (world): HazardDirector => new Director(world);
