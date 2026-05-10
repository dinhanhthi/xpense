import type { Expense } from '@/types/domain';

export class SplitValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SplitValidationError';
  }
}

/**
 * Resolve per-member owed amounts (in minor units) for an expense.
 *
 * Returned map sums exactly to expense.amountMinor. Any rounding residual
 * lands on expense.payerId — when the payer is also a participant — so the
 * residual stays with the person who actually fronted the money. If the
 * payer is not a participant, the residual goes to the first sorted member.
 */
export function resolveShares(expense: Expense): Map<string, number> {
  const result = new Map<string, number>();
  const total = expense.amountMinor;
  const ids = expense.shares.map((s) => s.memberId);
  if (ids.length === 0) {
    throw new SplitValidationError('At least one participant is required.');
  }
  if (total <= 0) {
    expense.shares.forEach((s) => result.set(s.memberId, 0));
    return result;
  }

  const residualHolder = ids.includes(expense.payerId)
    ? expense.payerId
    : [...ids].sort()[0];

  switch (expense.splitMode) {
    case 'equal': {
      const base = Math.floor(total / ids.length);
      let assigned = 0;
      for (const id of ids) {
        if (id !== residualHolder) {
          result.set(id, base);
          assigned += base;
        }
      }
      result.set(residualHolder, total - assigned);
      return result;
    }

    case 'percent': {
      const sum = expense.shares.reduce((acc, s) => acc + s.value, 0);
      if (Math.abs(sum - 100) > 0.01) {
        throw new SplitValidationError(`Percentages must sum to 100 (got ${sum.toFixed(2)}).`);
      }
      let assigned = 0;
      for (const s of expense.shares) {
        if (s.memberId !== residualHolder) {
          const owed = Math.round((total * s.value) / 100);
          result.set(s.memberId, owed);
          assigned += owed;
        }
      }
      result.set(residualHolder, total - assigned);
      return result;
    }

    case 'amount': {
      const sum = expense.shares.reduce((acc, s) => acc + s.value, 0);
      if (sum !== total) {
        throw new SplitValidationError(
          `Explicit amounts must sum to ${total} minor units (got ${sum}).`,
        );
      }
      expense.shares.forEach((s) => {
        result.set(s.memberId, s.value);
      });
      return result;
    }

    case 'parts': {
      const totalParts = expense.shares.reduce((acc, s) => acc + s.value, 0);
      if (!Number.isFinite(totalParts) || totalParts <= 0) {
        throw new SplitValidationError('Total parts must be > 0.');
      }
      let assigned = 0;
      for (const s of expense.shares) {
        if (s.memberId !== residualHolder) {
          const owed = Math.round((total * s.value) / totalParts);
          result.set(s.memberId, owed);
          assigned += owed;
        }
      }
      result.set(residualHolder, total - assigned);
      return result;
    }

    default: {
      throw new SplitValidationError(`Unknown split mode: ${String(expense.splitMode)}`);
    }
  }
}
