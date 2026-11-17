import { Express, Router } from 'express';
import { aviatorModule, AviatorEngine, aviatorEngine, aviatorRouter } from './aviator';
import { rouletteModule, RouletteEngine, rouletteEngine, rouletteRouter } from './roulette';
import { diceModule, DiceEngine, diceEngine, diceRouter } from './dice';
import { dragonTigerModule, DragonTigerEngine, dragonTigerEngine, dragonTigerRouter } from './dragon-tiger';
import { andarBaharModule, AndarBaharEngine, andarBaharEngine, andarBaharRouter } from './andar-bahar';
import { teenPattiModule, TeenPattiEngine, teenPattiEngine, teenPattiRouter } from './teen-patti';

export interface BackendGameModule {
  code: string;
  name: string;
  mode: 'CONTINUOUS_BACKEND_LOOP' | 'AUTHORITATIVE_TURN_BASED_ENGINE';
  mountPaths: string[];
  engine: unknown;
  router: Router;
  mount: (app: Express) => void;
  getEngineStatus: (poolBalance: string) => Record<string, unknown>;
}

export const BACKEND_GAME_MODULES: BackendGameModule[] = [
  aviatorModule,
  rouletteModule,
  diceModule,
  dragonTigerModule,
  andarBaharModule,
  teenPattiModule,
];

export function getBackendGameModule(code: string): BackendGameModule | undefined {
  const normalized = String(code || '').trim().toLowerCase().replace(/_/g, '-');
  return BACKEND_GAME_MODULES.find((mod) => mod.code === normalized);
}

export function getBackendGameRouters(): Router[] {
  return BACKEND_GAME_MODULES.map((mod) => mod.router);
}

export function mountBackendGameModules(app: Express): void {
  for (const mod of BACKEND_GAME_MODULES) {
    mod.mount(app);
  }
}

export {
  aviatorModule,
  rouletteModule,
  diceModule,
  dragonTigerModule,
  andarBaharModule,
  teenPattiModule,
  AviatorEngine,
  aviatorEngine,
  aviatorRouter,
  RouletteEngine,
  rouletteEngine,
  rouletteRouter,
  DiceEngine,
  diceEngine,
  diceRouter,
  DragonTigerEngine,
  dragonTigerEngine,
  dragonTigerRouter,
  AndarBaharEngine,
  andarBaharEngine,
  andarBaharRouter,
  TeenPattiEngine,
  teenPattiEngine,
  teenPattiRouter,
};
