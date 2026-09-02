import { config } from './config.js';

export function destinationForUser(user, { hasOperator = false, alphaEnabled = config.alphaProductionEnabled } = {}) {
  if (!user) return '/login';
  if (user.role === 'demo') return '/demo';
  if (user.role === 'advisor') return alphaEnabled ? '/demo' : '/login';
  if (user.role === 'admin') return alphaEnabled ? '/demo' : '/admin';
  if (user.role === 'router') return alphaEnabled ? '/demo' : hasOperator ? '/' : '/operator';
  return '/login';
}
