import type { TradeAction } from './types.js';

/** Infrastructure creation stays in the operator CLI; controller/user calls keep wallet consent. */
export type BrowserTradeAction = Exclude<TradeAction, 'deploy' | 'deploy-valuation-guard'>;
const actions: readonly BrowserTradeAction[] = ['propose','apply','unpause','pause','checkpoint-valuation','update-mon-price','update-prices','approve-deposit','deposit','approve-redeem','redeem','buy','sell'];
export function requireBrowserTradeAction(action: unknown): asserts action is BrowserTradeAction {
  if (!actions.includes(action as BrowserTradeAction)) throw new Error('Infrastructure deployment uses the operator CLI.');
}
