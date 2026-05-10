import { describe, it, expect } from 'vitest';
import { computeBalances, minimalTransfers } from './settle';
import type { Group, Expense } from '@/types/domain';

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

describe('minimalTransfers', () => {
  it('no transfers when all settled', () => {
    const b = new Map([
      ['a', 0],
      ['b', 0],
    ]);
    expect(minimalTransfers(b)).toEqual([]);
  });

  it('two-person settle', () => {
    const b = new Map([
      ['a', 500],
      ['b', -500],
    ]);
    const t = minimalTransfers(b);
    expect(t).toHaveLength(1);
    expect(t[0]).toEqual({ from: 'b', to: 'a', amountMinor: 500 });
  });

  it('settles three-person uneven case with minimal hops', () => {
    // a paid 1000 split 3 ways → balance: a +667, b -333, c -334 (or similar)
    const b = new Map([
      ['a', 666],
      ['b', -333],
      ['c', -333],
    ]);
    const t = minimalTransfers(b);
    expect(t.length).toBeLessThanOrEqual(2);
    const totalIn = t.reduce((s, x) => s + x.amountMinor, 0);
    expect(totalIn).toBe(666);
  });

  it('is deterministic with tied debtors and creditors', () => {
    const b = new Map([
      ['a', 100],
      ['b', 100],
      ['c', -100],
      ['d', -100],
    ]);
    const t1 = minimalTransfers(new Map(b));
    const t2 = minimalTransfers(new Map(b));
    expect(t1).toEqual(t2);
  });

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

  it('end-to-end: applying transfers zeroes balances', () => {
    const g = mkGroup(
      ['a', 'b', 'c', 'd'],
      [
        {
          amountMinor: 4000,
          payerId: 'a',
          splitMode: 'equal',
          shares: [
            { memberId: 'a', value: 0 },
            { memberId: 'b', value: 0 },
            { memberId: 'c', value: 0 },
            { memberId: 'd', value: 0 },
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
    const balances = computeBalances(g);
    const transfers = minimalTransfers(balances);
    const after = new Map(balances);
    for (const t of transfers) {
      after.set(t.from, (after.get(t.from) ?? 0) + t.amountMinor);
      after.set(t.to, (after.get(t.to) ?? 0) - t.amountMinor);
    }
    for (const v of after.values()) expect(Math.abs(v)).toBeLessThanOrEqual(1);
  });
});
