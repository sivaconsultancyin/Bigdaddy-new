import { Express } from 'express';
import { andarBaharEngine, AndarBaharEngine } from './andar-bahar.engine';
import { andarBaharRouter } from './andar-bahar.routes';

export const andarBaharModule = {
  code: 'andar-bahar' as const,
  name: 'Andar Bahar',
  mode: 'CONTINUOUS_BACKEND_LOOP' as const,
  mountPaths: ['/api/games/andar-bahar', '/api/games/andar_bahar'],
  engine: andarBaharEngine,
  router: andarBaharRouter,
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

export { AndarBaharEngine, andarBaharEngine, andarBaharRouter };
