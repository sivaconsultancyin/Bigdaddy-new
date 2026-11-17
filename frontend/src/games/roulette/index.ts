export { RouletteGame } from './RouletteGame';
export { RoulettePreview } from './RoulettePreview';
export { RouletteWheel, RED_SET, WHEEL_NUMBERS } from './RouletteWheel';
export { rouletteAudio } from './RouletteAudio';
export { RouletteApi, buildRouletteBetOperation, type RouletteBetPayload } from './roulette.api';

import { RouletteGame } from './RouletteGame';
import { RoulettePreview } from './RoulettePreview';
import { RouletteApi } from './roulette.api';

export const rouletteFrontendModule = {
  code: 'roulette' as const,
  name: 'European Roulette',
  Component: RouletteGame,
  PreviewComponent: RoulettePreview,
  api: RouletteApi,
};
