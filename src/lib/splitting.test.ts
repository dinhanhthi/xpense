import { describe, it, expect } from 'vitest';
import { resolveShares, SplitValidationError } from './splitting';
import type { Expense } from '@/types/domain';

function mkExpense(partial: Partial<Expense>): Expense {
  return {
    id: 'e1',
    groupId: 'g1',
    title: 't',
    amountMinor: 0,
    currency: 'EUR',
    payerId: 'a',
    date: '2026-01-01',
    splitMode: 'equal',
    shares: [],
    imageIds: [],
    createdAt: 0,
    ...partial,
  };
}

describe('resolveShares', () => {
  describe('equal mode', () => {
    it('splits evenly when divisible', () => {
      const e = mkExpense({
        amountMinor: 1000,
        payerId: 'a',
        splitMode: 'equal',
        shares: [
          { memberId: 'a', value: 0 },
          { memberId: 'b', value: 0 },
        ],
      });
      const r = resolveShares(e);
      expect(r.get('a')).toBe(500);
      expect(r.get('b')).toBe(500);
    });

    it('routes residual cents to the payer', () => {
      const e = mkExpense({
        amountMinor: 100,
        payerId: 'b',
        splitMode: 'equal',
        shares: [
          { memberId: 'a', value: 0 },
          { memberId: 'b', value: 0 },
          { memberId: 'c', value: 0 },
        ],
      });
      const r = resolveShares(e);
      const sum = (r.get('a') ?? 0) + (r.get('b') ?? 0) + (r.get('c') ?? 0);
      expect(sum).toBe(100);
      expect(r.get('a')).toBe(33);
      expect(r.get('b')).toBe(34);
      expect(r.get('c')).toBe(33);
    });

    it('falls back to first sorted member when payer is not a participant', () => {
      const e = mkExpense({
        amountMinor: 100,
        payerId: 'z',
        splitMode: 'equal',
        shares: [
          { memberId: 'a', value: 0 },
          { memberId: 'b', value: 0 },
          { memberId: 'c', value: 0 },
        ],
      });
      const r = resolveShares(e);
      const sum = (r.get('a') ?? 0) + (r.get('b') ?? 0) + (r.get('c') ?? 0);
      expect(sum).toBe(100);
      expect(r.get('a')).toBe(34);
    });

    it('handles single participant', () => {
      const e = mkExpense({
        amountMinor: 999,
        payerId: 'a',
        splitMode: 'equal',
        shares: [{ memberId: 'a', value: 0 }],
      });
      expect(resolveShares(e).get('a')).toBe(999);
    });

    it('throws when there are no participants', () => {
      const e = mkExpense({ amountMinor: 100, splitMode: 'equal', shares: [] });
      expect(() => resolveShares(e)).toThrow(SplitValidationError);
    });
  });

  describe('percent mode', () => {
    it('splits by percentage with payer absorbing residual', () => {
      const e = mkExpense({
        amountMinor: 10000,
        payerId: 'b',
        splitMode: 'percent',
        shares: [
          { memberId: 'a', value: 33.33 },
          { memberId: 'b', value: 33.33 },
          { memberId: 'c', value: 33.34 },
        ],
      });
      const r = resolveShares(e);
      const sum = [...r.values()].reduce((acc, x) => acc + x, 0);
      expect(sum).toBe(10000);
    });

    it('rejects when percentages do not sum to 100', () => {
      const e = mkExpense({
        amountMinor: 1000,
        splitMode: 'percent',
        shares: [
          { memberId: 'a', value: 50 },
          { memberId: 'b', value: 30 },
        ],
      });
      expect(() => resolveShares(e)).toThrow(SplitValidationError);
    });

    it('allows ±0.01 slack', () => {
      const e = mkExpense({
        amountMinor: 1000,
        splitMode: 'percent',
        shares: [
          { memberId: 'a', value: 50 },
          { memberId: 'b', value: 49.999 },
        ],
      });
      expect(() => resolveShares(e)).not.toThrow();
    });
  });

  describe('amount mode', () => {
    it('uses explicit amounts when sum matches', () => {
      const e = mkExpense({
        amountMinor: 1000,
        splitMode: 'amount',
        shares: [
          { memberId: 'a', value: 600 },
          { memberId: 'b', value: 400 },
        ],
      });
      const r = resolveShares(e);
      expect(r.get('a')).toBe(600);
      expect(r.get('b')).toBe(400);
    });

    it('rejects when amounts do not sum to total', () => {
      const e = mkExpense({
        amountMinor: 1000,
        splitMode: 'amount',
        shares: [
          { memberId: 'a', value: 600 },
          { memberId: 'b', value: 300 },
        ],
      });
      expect(() => resolveShares(e)).toThrow(SplitValidationError);
    });
  });

  describe('parts mode', () => {
    it('splits 1:2 correctly', () => {
      const e = mkExpense({
        amountMinor: 900,
        payerId: 'a',
        splitMode: 'parts',
        shares: [
          { memberId: 'a', value: 1 },
          { memberId: 'b', value: 2 },
        ],
      });
      const r = resolveShares(e);
      expect(r.get('a')).toBe(300);
      expect(r.get('b')).toBe(600);
    });

    it('residual lands on payer in parts mode', () => {
      const e = mkExpense({
        amountMinor: 100,
        payerId: 'c',
        splitMode: 'parts',
        shares: [
          { memberId: 'a', value: 1 },
          { memberId: 'b', value: 1 },
          { memberId: 'c', value: 1 },
        ],
      });
      const r = resolveShares(e);
      const sum = [...r.values()].reduce((acc, x) => acc + x, 0);
      expect(sum).toBe(100);
      expect(r.get('c')).toBe(34);
    });

    it('rejects zero total parts', () => {
      const e = mkExpense({
        amountMinor: 100,
        splitMode: 'parts',
        shares: [{ memberId: 'a', value: 0 }],
      });
      expect(() => resolveShares(e)).toThrow(SplitValidationError);
    });

    it('rejects non-finite parts (e.g. Infinity, NaN)', () => {
      for (const v of [Infinity, -Infinity, NaN]) {
        const e = mkExpense({
          amountMinor: 100,
          splitMode: 'parts',
          shares: [
            { memberId: 'a', value: v },
            { memberId: 'b', value: 1 },
          ],
        });
        expect(() => resolveShares(e)).toThrow(SplitValidationError);
      }
    });
  });

  describe('unknown split mode', () => {
    it('throws SplitValidationError instead of returning undefined', () => {
      const e = mkExpense({
        amountMinor: 100,
        splitMode: 'foo' as unknown as 'equal',
        shares: [{ memberId: 'a', value: 0 }],
      });
      expect(() => resolveShares(e)).toThrow(SplitValidationError);
    });
  });
});
