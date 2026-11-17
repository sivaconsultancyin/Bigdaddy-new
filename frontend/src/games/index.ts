import React from 'react';
import { aviatorFrontendModule, AviatorGame, AviatorApi } from './aviator';
import { rouletteFrontendModule, RouletteGame, RoulettePreview, RouletteApi } from './roulette';
import { diceFrontendModule, DiceGame, DicePreview, DiceApi } from './dice';
import {
  dragonTigerFrontendModule,
  DragonTigerGame,
  DragonTigerPreview,
  DragonTigerApi,
} from './dragon-tiger';
import {
  andarBaharFrontendModule,
  AndarBaharGame,
  AndarBaharPreview,
  AndarBaharApi,
} from './andar-bahar';
import {
  teenPattiFrontendModule,
  TeenPattiGame,
  TeenPattiPreview,
  TeenPattiApi,
} from './teen-patti';

export interface FrontendGameModule {
  code: string;
  name: string;
  Component: React.FC<{ onBackToLobby: () => void }>;
  PreviewComponent?: React.FC<any>;
  api: Record<string, any>;
}

export const FRONTEND_GAME_MODULES: FrontendGameModule[] = [
  aviatorFrontendModule,
  rouletteFrontendModule,
  teenPattiFrontendModule,
  diceFrontendModule,
  dragonTigerFrontendModule,
  andarBaharFrontendModule,
];

export function getFrontendGameModule(code: string | null | undefined): FrontendGameModule | undefined {
  if (!code) return undefined;
  const normalized = code.trim().toLowerCase().replace(/_/g, '-');
  return FRONTEND_GAME_MODULES.find((mod) => mod.code === normalized);
}

export {
  aviatorFrontendModule,
  rouletteFrontendModule,
  diceFrontendModule,
  dragonTigerFrontendModule,
  andarBaharFrontendModule,
  teenPattiFrontendModule,
  AviatorGame,
  AviatorApi,
  RouletteGame,
  RoulettePreview,
  RouletteApi,
  DiceGame,
  DicePreview,
  DiceApi,
  DragonTigerGame,
  DragonTigerPreview,
  DragonTigerApi,
  AndarBaharGame,
  AndarBaharPreview,
  AndarBaharApi,
  TeenPattiGame,
  TeenPattiPreview,
  TeenPattiApi,
};
