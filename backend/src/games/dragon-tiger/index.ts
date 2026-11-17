import { Express } from 'express';
import { dragonTigerEngine, DragonTigerEngine } from './dragon-tiger.engine';
import { dragonTigerRouter } from './dragon-tiger.routes';

export const dragonTigerModule = {
  code: 'dragon-tiger' as const,
  name: 'Dragon Tiger',
  mode: 'CONTINUOUS_BACKEND_LOOP' as const,
  mountPaths: ['/api/games/dragon-tiger', '/api/games/dragon_tiger'],
  engine: dragonTigerEngine,
  router: dragonTigerRouter,
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

export { DragonTigerEngine, dragonTigerEngine, dragonTigerRouter };
