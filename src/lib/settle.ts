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

type Party = { id: string; amount: number };

function splitParties(balances: Map<string, number>): {
  debtors: Party[];
  creditors: Party[];
} {
  const debtors: Party[] = [];
  const creditors: Party[] = [];
  for (const [id, amount] of balances) {
    if (amount > 0) creditors.push({ id, amount });
    else if (amount < 0) debtors.push({ id, amount: -amount });
  }
  const byAmountDesc = (a: Party, b: Party) =>
    b.amount - a.amount || a.id.localeCompare(b.id);
  debtors.sort(byAmountDesc);
  creditors.sort(byAmountDesc);
  return { debtors, creditors };
}

/**
 * Greedy minimum-transfers solver: at each step pair the largest debtor with
 * the largest creditor. Output is deterministic for stable input ordering.
 */
export function minimalTransfers(balances: Map<string, number>): Transfer[] {
  const { debtors, creditors } = splitParties(balances);
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

/**
 * Hub strategy — every debtor sends a single payment to one chosen creditor
 * (the hub), who then forwards the surplus to the remaining creditors. This
 * guarantees each debtor makes exactly one outgoing transfer regardless of
 * whether any creditor is large enough to absorb a debtor directly.
 *
 * Hub = creditor with the largest balance (deterministic tiebreak by id).
 * Total transfers = numDebtors + (numCreditors - 1).
 */
export function debtorOnePayeeTransfers(
  balances: Map<string, number>,
): Transfer[] {
  const { debtors, creditors } = splitParties(balances);
  if (debtors.length === 0 || creditors.length === 0) return [];

  const hub = creditors[0];
  const otherCreditors = creditors.slice(1);
  const transfers: Transfer[] = [];

  for (const d of debtors) {
    if (d.amount <= 0) continue;
    transfers.push({ from: d.id, to: hub.id, amountMinor: d.amount });
  }

  for (const c of otherCreditors) {
    if (c.amount <= 0) continue;
    transfers.push({ from: hub.id, to: c.id, amountMinor: c.amount });
  }

  return transfers;
}

/**
 * Hub strategy — every creditor receives a single payment from one chosen
 * debtor (the hub), who collects from the remaining debtors first. This
 * guarantees each creditor has exactly one incoming transfer.
 *
 * Hub = debtor with the largest balance (deterministic tiebreak by id).
 * Total transfers = (numDebtors - 1) + numCreditors.
 */
export function creditorOnePayerTransfers(
  balances: Map<string, number>,
): Transfer[] {
  const { debtors, creditors } = splitParties(balances);
  if (debtors.length === 0 || creditors.length === 0) return [];

  const hub = debtors[0];
  const otherDebtors = debtors.slice(1);
  const transfers: Transfer[] = [];

  for (const d of otherDebtors) {
    if (d.amount <= 0) continue;
    transfers.push({ from: d.id, to: hub.id, amountMinor: d.amount });
  }

  for (const c of creditors) {
    if (c.amount <= 0) continue;
    transfers.push({ from: hub.id, to: c.id, amountMinor: c.amount });
  }

  return transfers;
}
