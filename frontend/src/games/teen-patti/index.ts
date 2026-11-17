export { TeenPattiGame } from './TeenPattiGame';
export { TeenPattiDealerTable } from './TeenPattiDealerTable';
export { TeenPattiPreview } from './TeenPattiPreview';
export { teenPattiAudio } from './TeenPattiAudio';
export { TeenPattiApi } from './teenPatti.api';

import { TeenPattiGame } from './TeenPattiGame';
import { TeenPattiPreview } from './TeenPattiPreview';
import { TeenPattiApi } from './teenPatti.api';

export const teenPattiFrontendModule = {
  code: 'teen-patti' as const,
  name: 'Teen Patti',
  Component: TeenPattiGame,
  PreviewComponent: TeenPattiPreview,
  api: TeenPattiApi,
};
