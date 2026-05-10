export type CurrencyCode = string;

export type SplitMode = 'equal' | 'percent' | 'amount' | 'parts';

export interface Member {
  id: string;
  name: string;
  color?: string;
}

export interface SplitShare {
  memberId: string;
  /**
   * Meaning depends on split mode:
   * - equal: ignored (presence in array = participates)
   * - percent: percentage 0-100 (sum should be 100)
   * - amount: explicit amount in minor units (sum must equal expense.amountMinor)
   * - parts: integer or float weight (e.g. 1, 2, 0.5)
   */
  value: number;
}

export interface Expense {
  id: string;
  groupId: string;
  title: string;
  amountMinor: number;
  currency: CurrencyCode;
  payerId: string;
  date: string;
  splitMode: SplitMode;
  shares: SplitShare[];
  imageIds: string[];
  note?: string;
  createdAt: number;
}

export interface Group {
  id: string;
  name: string;
  currency: CurrencyCode;
  currencyDecimals: number;
  members: Member[];
  expenses: Expense[];
  createdAt: number;
  updatedAt: number;
}

export interface Transfer {
  from: string;
  to: string;
  amountMinor: number;
}
