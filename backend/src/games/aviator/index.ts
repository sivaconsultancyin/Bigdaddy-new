import { Express } from 'express';
import { aviatorEngine, AviatorEngine } from './aviator.engine';
import { aviatorRouter } from './aviator.routes';

export const aviatorModule = {
  code: 'aviator' as const,
  name: 'Aviator / Crash',
  mode: 'CONTINUOUS_BACKEND_LOOP' as const,
  mountPaths: ['/api/games/aviator'],
  engine: aviatorEngine,
  router: aviatorRouter,
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

export { AviatorEngine, aviatorEngine, aviatorRouter };
