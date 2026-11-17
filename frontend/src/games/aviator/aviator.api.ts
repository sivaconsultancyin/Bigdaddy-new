import { ApiClient } from '../../api/client';
import { aviatorEngine } from './aviator.engine';
import { randomId } from '../../utils/rng';

export const AviatorApi = {
  async getState() {
    return {
      round: aviatorEngine.getPublicRoundState(),
      bets: aviatorEngine.getCurrentRoundBets(),
      history: aviatorEngine.getHistory(),
    };
  },

  async placeBet(
    payload: { amount: string; autoCashoutMultiplier?: number | null },
    idempotencyKey?: string,
  ) {
    const user = ApiClient.requireCurrentUser();
    const key = idempotencyKey ?? randomId('aviator-bet');
    return aviatorEngine.placeBet({
      userId: user.id,
      username: user.username,
      userRole: user.role,
      amount: String(payload.amount),
      autoCashoutMultiplier: payload.autoCashoutMultiplier ?? null,
      idempotencyKey: key,
    });
  },

  async cashoutBet(payload: { betId: string }) {
    const user = ApiClient.requireCurrentUser();
    return aviatorEngine.cashoutBet({
      betId: payload.betId,
      userId: user.id,
    });
  },
};
