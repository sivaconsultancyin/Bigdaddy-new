import { ApiClient } from '../../api/client';
import { andarBaharEngine } from './andar-bahar.engine';
import { randomId } from '../../utils/rng';

export const AndarBaharApi = {
  async getState() {
    const user = ApiClient.getCurrentSessionUser();
    return {
      status: 'ACTIVE',
      round: andarBaharEngine.getPublicRoundState(),
      history: andarBaharEngine.getHistory(),
      allBets: andarBaharEngine.getCurrentRoundBets(),
      myBets: user ? andarBaharEngine.getUserBets(user.id) : [],
    };
  },

  async placeBet(payload: { bets: Array<{ type: string; amount: string }> }) {
    const user = ApiClient.requireCurrentUser();
    return andarBaharEngine.placeBet({
      userId: user.id,
      username: user.username,
      userRole: user.role,
      bets: payload.bets,
      idempotencyKey: randomId('andar-bahar'),
    });
  },
};
