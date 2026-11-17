import { Express } from 'express';
import { teenPattiEngine, TeenPattiEngine } from './teen-patti.engine';
import { teenPattiRouter } from './teen-patti.routes';

export const teenPattiModule = {
  code: 'teen-patti' as const,
  name: 'Teen Patti Royal',
  mode: 'AUTHORITATIVE_TURN_BASED_ENGINE' as const,
  mountPaths: ['/api/games/teen-patti', '/api/games/teen_patti'],
  engine: teenPattiEngine,
  router: teenPattiRouter,
  mount(app: Express) {
    app.use(this.mountPaths, this.router);
  },
  getEngineStatus(poolBalance: string) {
    return {
      code: this.code,
      mode: this.mode,
      state: this.engine.getPublicState(),
      poolBalance,
    };
  },
};

export { TeenPattiEngine, teenPattiEngine, teenPattiRouter };
