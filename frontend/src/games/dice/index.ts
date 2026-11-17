export { DiceGame } from './DiceGame';
export { DicePreview } from './DicePreview';
export { DiceCanvas } from './DiceCanvas';
export { CssDiceArena } from './CssDiceArena';
export { diceAudio } from './DiceAudio';
export { DiceApi } from './dice.api';

import { DiceGame } from './DiceGame';
import { DicePreview } from './DicePreview';
import { DiceApi } from './dice.api';

export const diceFrontendModule = {
  code: 'dice' as const,
  name: 'Dice',
  Component: DiceGame,
  PreviewComponent: DicePreview,
  api: DiceApi,
};
