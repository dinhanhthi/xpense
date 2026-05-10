import { describe, it, expect } from 'vitest';
import {
  computeBalances,
  debtorOnePayeeTransfers,
  creditorOnePayerTransfers,
} from './settle';
import type { Group, Expense, Transfer } from '@/types/domain';

function mkGroup(members: string[], expenses: Partial<Expense>[]): Group {
  return {
    id: 'g',
    name: 'g',
    currency: 'EUR',
    currencyDecimals: 2,
    members: members.map((id) => ({ id, name: id })),
    expenses: expenses.map((e, i) => ({
      id: `e${i}`,
      groupId: 'g',
      title: 't',
      amountMinor: 0,
      currency: 'EUR',
      payerId: members[0],
      date: '2026-01-01',
      splitMode: 'equal' as const,
      shares: [],
      imageIds: [],
      createdAt: 0,
      ...e,
    })),
    createdAt: 0,
    updatedAt: 0,
  };
}

function sumValues(m: Map<string, number>): number {
  return [...m.values()].reduce((a, b) => a + b, 0);
}

describe('computeBalances', () => {
  it('zero balance for empty group', () => {
    const g = mkGroup(['a', 'b'], []);
    const b = computeBalances(g);
    expect(b.get('a')).toBe(0);
    expect(b.get('b')).toBe(0);
  });

  it('two-person equal split', () => {
    const g = mkGroup(
      ['a', 'b'],
      [
        {
          amountMinor: 1000,
          payerId: 'a',
          splitMode: 'equal',
          shares: [
            { memberId: 'a', value: 0 },
            { memberId: 'b', value: 0 },
          ],
        },
      ],
    );
    const b = computeBalances(g);
    expect(b.get('a')).toBe(500);
    expect(b.get('b')).toBe(-500);
  });

  it('balances always sum to zero', () => {
    const g = mkGroup(
      ['a', 'b', 'c'],
      [
        {
          amountMinor: 1000,
          payerId: 'a',
          splitMode: 'equal',
          shares: [
            { memberId: 'a', value: 0 },
            { memberId: 'b', value: 0 },
            { memberId: 'c', value: 0 },
          ],
        },
        {
          amountMinor: 600,
          payerId: 'b',
          splitMode: 'equal',
          shares: [
            { memberId: 'b', value: 0 },
            { memberId: 'c', value: 0 },
          ],
        },
      ],
    );
    const b = computeBalances(g);
    expect(sumValues(b)).toBe(0);
  });
});

describe('split-mode invariants', () => {
  it('balance-sum-zero invariant holds across all split modes', () => {
    const cases: Partial<Expense>[] = [
      {
        amountMinor: 1000,
        payerId: 'a',
        splitMode: 'equal',
        shares: [
          { memberId: 'a', value: 0 },
          { memberId: 'b', value: 0 },
          { memberId: 'c', value: 0 },
        ],
      },
      {
        amountMinor: 10000,
        payerId: 'b',
        splitMode: 'percent',
        shares: [
          { memberId: 'a', value: 33.33 },
          { memberId: 'b', value: 33.33 },
          { memberId: 'c', value: 33.34 },
        ],
      },
      {
        amountMinor: 1234,
        payerId: 'c',
        splitMode: 'amount',
        shares: [
          { memberId: 'a', value: 500 },
          { memberId: 'b', value: 234 },
          { memberId: 'c', value: 500 },
        ],
      },
      {
        amountMinor: 999,
        payerId: 'a',
        splitMode: 'parts',
        shares: [
          { memberId: 'a', value: 1 },
          { memberId: 'b', value: 2 },
          { memberId: 'c', value: 3 },
        ],
      },
    ];
    for (const c of cases) {
      const g = mkGroup(['a', 'b', 'c'], [c]);
      const balances = computeBalances(g);
      expect(sumValues(balances)).toBe(0);
    }
  });

  it('exposes Transfer-shaped output', () => {
    const t: Transfer = { from: 'a', to: 'b', amountMinor: 100 };
    expect(t.from).toBe('a');
  });
});

function applyTransfers(
  balances: Map<string, number>,
  transfers: Transfer[],
): Map<string, number> {
  const after = new Map(balances);
  for (const t of transfers) {
    after.set(t.from, (after.get(t.from) ?? 0) + t.amountMinor);
    after.set(t.to, (after.get(t.to) ?? 0) - t.amountMinor);
  }
  return after;
}

function countOutgoingPerDebtor(
  transfers: Transfer[],
  balances: Map<string, number>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [id, v] of balances) if (v < 0) counts.set(id, 0);
  for (const t of transfers) {
    if ((balances.get(t.from) ?? 0) < 0) {
      counts.set(t.from, (counts.get(t.from) ?? 0) + 1);
    }
  }
  return counts;
}

function countIncomingPerCreditor(
  transfers: Transfer[],
  balances: Map<string, number>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [id, v] of balances) if (v > 0) counts.set(id, 0);
  for (const t of transfers) {
    if ((balances.get(t.to) ?? 0) > 0) {
      counts.set(t.to, (counts.get(t.to) ?? 0) + 1);
    }
  }
  return counts;
}

describe('debtorOnePayeeTransfers', () => {
  it('returns no transfers when settled', () => {
    expect(debtorOnePayeeTransfers(new Map([['a', 0]]))).toEqual([]);
  });

  it('each debtor pays exactly one person when feasible', () => {
    // Creditors: a=+300. Debtors: b=-100, c=-200. Both can pay a fully.
    const b = new Map([
      ['a', 300],
      ['b', -100],
      ['c', -200],
    ]);
    const t = debtorOnePayeeTransfers(b);
    const counts = countOutgoingPerDebtor(t, b);
    expect(counts.get('b')).toBe(1);
    expect(counts.get('c')).toBe(1);
  });

  it('zeroes balances after applying transfers', () => {
    const b = new Map([
      ['thi', 3902],
      ['thao', 3186],
      ['thuy', -2814],
      ['hieu', -2210],
      ['hung', -2064],
    ]);
    const t = debtorOnePayeeTransfers(b);
    const after = applyTransfers(b, t);
    for (const v of after.values()) expect(Math.abs(v)).toBeLessThanOrEqual(1);
  });

  it('every debtor pays exactly one person (hub strategy) in screenshot scenario', () => {
    // Even when no creditor is large enough to absorb a debtor directly, the
    // hub strategy routes all debtors through one creditor so each debtor
    // makes exactly one outgoing transfer.
    const b = new Map([
      ['thi', 3902],
      ['thao', 3186],
      ['thuy', -2814],
      ['hieu', -2210],
      ['hung', -2064],
    ]);
    const t = debtorOnePayeeTransfers(b);
    const counts = countOutgoingPerDebtor(t, b);
    for (const [, c] of counts) expect(c).toBe(1);
  });
});

describe('creditorOnePayerTransfers', () => {
  it('returns no transfers when settled', () => {
    expect(creditorOnePayerTransfers(new Map([['a', 0]]))).toEqual([]);
  });

  it('each creditor receives from exactly one person when feasible', () => {
    // Debtors: a=-300. Creditors: b=+100, c=+200. a can pay each fully.
    const b = new Map([
      ['a', -300],
      ['b', 100],
      ['c', 200],
    ]);
    const t = creditorOnePayerTransfers(b);
    const counts = countIncomingPerCreditor(t, b);
    expect(counts.get('b')).toBe(1);
    expect(counts.get('c')).toBe(1);
  });

  it('zeroes balances after applying transfers', () => {
    const b = new Map([
      ['thi', 3902],
      ['thao', 3186],
      ['thuy', -2814],
      ['hieu', -2210],
      ['hung', -2064],
    ]);
    const t = creditorOnePayerTransfers(b);
    const after = applyTransfers(b, t);
    for (const v of after.values()) expect(Math.abs(v)).toBeLessThanOrEqual(1);
  });

  it('every creditor receives from exactly one person (hub strategy) in screenshot scenario', () => {
    const b = new Map([
      ['thi', 3902],
      ['thao', 3186],
      ['thuy', -2814],
      ['hieu', -2210],
      ['hung', -2064],
    ]);
    const t = creditorOnePayerTransfers(b);
    const counts = countIncomingPerCreditor(t, b);
    for (const [, c] of counts) expect(c).toBe(1);
  });
});
