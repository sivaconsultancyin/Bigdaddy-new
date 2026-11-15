import { randomUUID } from 'node:crypto';

export type HealthFailure = {
  id: string;
  occurredAt: string;
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  component: string;
  reasonCode: string;
  reason: string;
  recovery: string;
};

const MAX_MEMORY_EVENTS = 250;
const recentEvents: HealthFailure[] = [];

function safeText(value: unknown, max = 240): string {
  const text = typeof value === 'string' ? value : '';
  return text
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s"'<>]+/gi, '[database-url-redacted]')
    .replace(/(password|token|secret|authorization)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, max);
}

function classify(path: string, statusCode: number, reasonCode: string): { component: string; reason: string; recovery: string } {
  if (/wallet|transfer|ledger/i.test(path)) {
    return { component: 'Wallet API', reason: reasonCode || 'Wallet request failed.', recovery: 'Check wallet balances and retry idempotently.' };
  }
  if (/auth|login|register/i.test(path) || statusCode === 401) {
    return { component: 'Authentication', reason: reasonCode || 'Authentication request failed.', recovery: 'Check credentials and session token validity.' };
  }
  if (/games|aviator|bet|cashout|round|settle/i.test(path)) {
    return { component: 'Game / Settlement', reason: reasonCode || 'Game request failed.', recovery: 'Check round state and pool balance before retrying.' };
  }
  if (/ready|health|monitoring/i.test(path)) {
    return { component: 'Backend / Readiness', reason: reasonCode || 'Health/readiness check failed.', recovery: 'Check backend process health.' };
  }
  return { component: 'Backend API', reason: reasonCode || 'Request failed or timed out.', recovery: 'Inspect server logs for the matching request ID.' };
}

export function recordHealthFailure(input: Omit<HealthFailure, 'id' | 'occurredAt' | 'component' | 'reason' | 'recovery'> & { reasonCode?: string; reason?: string }): void {
  const classified = classify(input.path, input.statusCode, safeText(input.reasonCode || input.reason || ''));
  const event: HealthFailure = {
    id: randomUUID(),
    occurredAt: new Date().toISOString(),
    requestId: safeText(input.requestId, 80),
    method: safeText(input.method, 12),
    path: safeText(input.path, 180),
    statusCode: input.statusCode,
    durationMs: Math.max(0, Math.round(input.durationMs)),
    component: classified.component,
    reasonCode: safeText(input.reasonCode || 'REQUEST_FAILED', 80),
    reason: safeText(input.reason || classified.reason),
    recovery: classified.recovery,
  };

  recentEvents.unshift(event);
  if (recentEvents.length > MAX_MEMORY_EVENTS) recentEvents.length = MAX_MEMORY_EVENTS;
  console.error('[health-failure]', JSON.stringify(event));
}

export async function getRecentHealthFailures(limit = 100): Promise<{ events: HealthFailure[]; persistence: 'memory-fallback' }> {
  const boundedLimit = Math.min(250, Math.max(1, Math.floor(limit)));
  return { events: recentEvents.slice(0, boundedLimit), persistence: 'memory-fallback' };
}
