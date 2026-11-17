export { AndarBaharGame } from './AndarBaharGame';
export { AndarBaharDealerTable } from './AndarBaharDealerTable';
export { AndarBaharPreview } from './AndarBaharPreview';
export { andarBaharAudio } from './AndarBaharAudio';
export { AndarBaharApi } from './andarBahar.api';

import { AndarBaharGame } from './AndarBaharGame';
import { AndarBaharPreview } from './AndarBaharPreview';
import { AndarBaharApi } from './andarBahar.api';

export const andarBaharFrontendModule = {
  code: 'andar-bahar' as const,
  name: 'Andar Bahar',
  Component: AndarBaharGame,
  PreviewComponent: AndarBaharPreview,
  api: AndarBaharApi,
};
