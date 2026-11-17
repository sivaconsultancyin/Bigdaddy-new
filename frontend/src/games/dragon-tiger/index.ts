export { DragonTigerGame } from './DragonTigerGame';
export { DragonTigerDealerTable } from './DragonTigerDealerTable';
export { DragonTigerPreview } from './DragonTigerPreview';
export { dragonTigerAudio } from './DragonTigerAudio';
export {
  DragonTigerApi,
  buildDragonTigerBetOperation,
  type DragonTigerBetPayload,
} from './dragonTiger.api';

import { DragonTigerGame } from './DragonTigerGame';
import { DragonTigerPreview } from './DragonTigerPreview';
import { DragonTigerApi } from './dragonTiger.api';

export const dragonTigerFrontendModule = {
  code: 'dragon-tiger' as const,
  name: 'Dragon Tiger',
  Component: DragonTigerGame,
  PreviewComponent: DragonTigerPreview,
  api: DragonTigerApi,
};
