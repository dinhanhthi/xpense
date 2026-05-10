export interface CurrencyInfo {
  code: string;
  label: string;
  symbol: string;
  decimals: number;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'EUR', label: 'Euro', symbol: '€', decimals: 2 },
  { code: 'USD', label: 'US Dollar', symbol: '$', decimals: 2 },
  { code: 'VND', label: 'Vietnamese Đồng', symbol: '₫', decimals: 0 },
  { code: 'GBP', label: 'British Pound', symbol: '£', decimals: 2 },
  { code: 'JPY', label: 'Japanese Yen', symbol: '¥', decimals: 0 },
  { code: 'AUD', label: 'Australian Dollar', symbol: 'A$', decimals: 2 },
  { code: 'CAD', label: 'Canadian Dollar', symbol: 'C$', decimals: 2 },
  { code: 'CHF', label: 'Swiss Franc', symbol: 'CHF', decimals: 2 },
  { code: 'SGD', label: 'Singapore Dollar', symbol: 'S$', decimals: 2 },
  { code: 'THB', label: 'Thai Baht', symbol: '฿', decimals: 2 },
  { code: 'KRW', label: 'Korean Won', symbol: '₩', decimals: 0 },
  { code: 'CNY', label: 'Chinese Yuan', symbol: '¥', decimals: 2 },
];

export function getCurrency(code: string): CurrencyInfo {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
}
