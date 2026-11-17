import { ApiClient } from '../../api/client';
import { diceEngine } from './dice.engine';
import { randomId } from '../../utils/rng';

export const DiceApi = {
  async getState(userId?: string) {
    const user = ApiClient.getCurrentSessionUser();
    const targetUserId = userId || user?.id;
    const allBets = diceEngine.getCurrentRoundBets();
    return {
      status: 'ACTIVE',
      round: diceEngine.getPublicRoundState(),
      history: diceEngine.getHistory(),
      allBets,
      myBets: targetUserId ? allBets.filter((b) => b.userId === targetUserId) : [],
      serverSeedHash: diceEngine.getServerSeedHash(),
    };
  },

  async roll(payload: {
    mode?: 'numbers' | 'slider';
    bets?: Array<{ type: string; amount: string }>;
    betAmount?: string;
    target?: number;
    condition?: 'over' | 'under';
    customClientSeed?: string;
  }) {
    const user = ApiClient.requireCurrentUser();
    const bets = payload.bets && payload.bets.length > 0 ? payload.bets : [];
    return diceEngine.placeBet({
      userId: user.id,
      username: user.username,
      userRole: user.role,
      bets,
      idempotencyKey: randomId('dice-roll'),
    });
  },

  async placeBet(
    payload: { bets: Array<{ type: string; amount: string }> },
    idempotencyKey = randomId('dice-bet'),
  ) {
    const user = ApiClient.requireCurrentUser();
    return diceEngine.placeBet({
      userId: user.id,
      username: user.username,
      userRole: user.role,
      bets: payload.bets,
      idempotencyKey,
    });
  },

  async verifyRoll(payload: { serverSeed: string }) {
    return diceEngine.verifyRoll(payload.serverSeed);
  },
};
