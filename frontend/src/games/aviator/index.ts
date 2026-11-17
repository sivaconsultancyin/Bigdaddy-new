export { AviatorGame } from './AviatorGame';
export { AviatorBetPanel } from './AviatorBetPanel';
export { AviatorBetsList } from './AviatorBetsList';
export { AviatorCanvas } from './AviatorCanvas';
export { AviatorApi } from './aviator.api';

import { AviatorGame } from './AviatorGame';
import { AviatorApi } from './aviator.api';

export const aviatorFrontendModule = {
  code: 'aviator' as const,
  name: 'Aviator / Crash',
  Component: AviatorGame,
  api: AviatorApi,
};
