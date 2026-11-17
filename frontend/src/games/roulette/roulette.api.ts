import { ApiClient } from '../../api/client';
import { UserRole } from '../../../../shared/src/types';
import { rouletteEngine } from './roulette.engine';
import { randomId } from '../../utils/rng';

export type RouletteBetPayload = {
  bets: Array<{ type: string; numbers: number[]; amount: string }>;
};

export function buildRouletteBetOperation(
  userId: string,
  roundId: string,
  payload: RouletteBetPayload,
): string {
  const user = String(userId ?? '').trim();
  const round = String(roundId ?? '').trim();
  if (!user || !round || !Array.isArray(payload?.bets) || payload.bets.length === 0) {
    throw new Error('ROULETTE_BET_INTENT_REQUIRED');
  }

  const canonicalPayload = {
    bets: payload.bets.map((bet) => ({
      type: String(bet.type ?? '').trim(),
      numbers: Array.isArray(bet.numbers) ? [...bet.numbers] : [],
      amount: String(bet.amount ?? '').trim(),
    })),
  };
  return `roulette-bet:${user}:${round}:${JSON.stringify(canonicalPayload)}`;
}

export const RouletteApi = {
  async getState() {
    const user = ApiClient.getCurrentSessionUser();
    return {
      status: 'ACTIVE',
      round: rouletteEngine.getPublicRoundState(),
      history: rouletteEngine.getHistory(),
      allBets: rouletteEngine.getCurrentRoundBets(),
      myBets: user ? rouletteEngine.getCurrentRoundBets(user.id) : [],
    };
  },

  async spin(payload: RouletteBetPayload) {
    const user = ApiClient.requireCurrentUser();
    return rouletteEngine.placeBet({
      userId: user.id,
      username: user.username,
      userRole: user.role,
      bets: payload.bets,
      idempotencyKey: randomId('roulette-spin'),
    });
  },

  async placeBet(payload: RouletteBetPayload, roundId: string, userId: string) {
    const user = ApiClient.getCurrentSessionUser();
    const effectiveUserId = userId || user?.id;
    if (!effectiveUserId) {
      throw new Error('Authentication required. Please sign in.');
    }
    const operation = buildRouletteBetOperation(effectiveUserId, roundId, payload);
    const idempotencyKey = await ApiClient.pendingKey(operation, 'ROULETTE_BET');
    try {
      return await rouletteEngine.placeBet({
        userId: effectiveUserId,
        username: user?.username || 'Player',
        userRole: user?.role || UserRole.PLAYER,
        bets: payload.bets,
        idempotencyKey,
      });
    } finally {
      ApiClient.clearPendingKey(operation);
    }
  },
};
