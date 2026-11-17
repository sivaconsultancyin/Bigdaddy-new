import { Express } from 'express';
import { diceEngine, DiceEngine } from './dice.engine';
import { diceRouter } from './dice.routes';

export const diceModule = {
  code: 'dice' as const,
  name: 'Lucky 10 Dice',
  mode: 'CONTINUOUS_BACKEND_LOOP' as const,
  mountPaths: ['/api/games/dice'],
  engine: diceEngine,
  router: diceRouter,
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

export { DiceEngine, diceEngine, diceRouter };
