import { Express } from 'express';
import { rouletteEngine, RouletteEngine } from './roulette.engine';
import { rouletteRouter } from './roulette.routes';

export const rouletteModule = {
  code: 'roulette' as const,
  name: 'European Roulette',
  mode: 'CONTINUOUS_BACKEND_LOOP' as const,
  mountPaths: ['/api/games/roulette'],
  engine: rouletteEngine,
  router: rouletteRouter,
  mount(app: Express) {
    app.use(this.mountPaths, this.router);
  },
  getEngineStatus(poolBalance: string) {
    return {
      code: this.code,
      mode: this.mode,
      round: this.engine.getPublicRoundState(),
      poolBalance,
    };
  },
};

export { RouletteEngine, rouletteEngine, rouletteRouter };
