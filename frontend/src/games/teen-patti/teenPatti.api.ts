import { ApiClient } from '../../api/client';
import { teenPattiEngine } from './teen-patti.engine';
import { randomId } from '../../utils/rng';

export const TeenPattiApi = {
  async getState() {
    const user = ApiClient.getCurrentSessionUser();
    return teenPattiEngine.getPublicState(user?.id);
  },

  async startBoot(payload: { bootAmount: number }) {
    const user = ApiClient.requireCurrentUser();
    return teenPattiEngine.startBoot({
      userId: user.id,
      username: user.username,
      userRole: user.role,
      bootAmount: payload.bootAmount,
      idempotencyKey: randomId('tp-boot'),
    });
  },

  async performAction(payload: { action: 'see' | 'chaal' | 'blind' | 'pack' | 'showdown'; amount?: number }) {
    const user = ApiClient.requireCurrentUser();
    return teenPattiEngine.performAction({
      userId: user.id,
      userRole: user.role,
      action: payload.action,
      amount: payload.amount,
      idempotencyKey: randomId('tp-action'),
    });
  },
};
