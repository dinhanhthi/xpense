import type { Group, Transfer } from '@/types/domain';
import { resolveShares } from './splitting';

/**
 * Net balance per member in minor units.
 * Positive = group owes them money (they paid more than their share).
 * Negative = they owe the group.
 */
export function computeBalances(group: Group): Map<string, number> {
  const balances = new Map<string, number>();
  group.members.forEach((m) => balances.set(m.id, 0));

  for (const expense of group.expenses) {
    const shares = resolveShares(expense);
    balances.set(
      expense.payerId,
      (balances.get(expense.payerId) ?? 0) + expense.amountMinor,
    );
    for (const [memberId, owed] of shares) {
      balances.set(memberId, (balances.get(memberId) ?? 0) - owed);
    }
  }

  return balances;
}

/**
 * Greedy minimum-transfers solver: at each step pair the largest debtor with
 * the largest creditor. Output is deterministic for stable input ordering.
 */
export function minimalTransfers(balances: Map<string, number>): Transfer[] {
  const debtors: Array<{ id: string; amount: number }> = [];
  const creditors: Array<{ id: string; amount: number }> = [];

  for (const [id, amount] of balances) {
    if (amount > 0) creditors.push({ id, amount });
    else if (amount < 0) debtors.push({ id, amount: -amount });
  }

  debtors.sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));
  creditors.sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));

  const transfers: Transfer[] = [];

  while (debtors.length > 0 && creditors.length > 0) {
    const d = debtors[0];
    const c = creditors[0];
    const pay = Math.min(d.amount, c.amount);
    if (pay > 0) {
      transfers.push({ from: d.id, to: c.id, amountMinor: pay });
    }
    d.amount -= pay;
    c.amount -= pay;
    if (d.amount <= 0) debtors.shift();
    if (c.amount <= 0) creditors.shift();
  }

  return transfers;
}
