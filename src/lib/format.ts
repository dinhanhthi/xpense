import { getCurrency } from './currencies';

export function formatMoney(amountMinor: number, currency: string, decimals?: number): string {
  const info = getCurrency(currency);
  const dec = decimals ?? info.decimals;
  const major = amountMinor / 10 ** dec;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: info.code,
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    }).format(major);
  } catch {
    return `${info.symbol}${major.toFixed(dec)}`;
  }
}

export function parseAmountToMinor(input: string, decimals: number): number | null {
  let s = input.trim().replace(/\s/g, '');
  if (s === '') return null;

  // Find the last comma or dot — that is the decimal separator.
  // Earlier commas/dots are treated as thousands separators and stripped.
  const lastSep = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  if (lastSep === -1) {
    if (!/^\d+$/.test(s)) return null;
  } else {
    const intPart = s.slice(0, lastSep).replace(/[.,]/g, '');
    const fracPart = s.slice(lastSep + 1);
    if (!/^\d*$/.test(intPart) || !/^\d+$/.test(fracPart)) return null;
    s = `${intPart || '0'}.${fracPart}`;
  }

  const num = Number(s);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 10 ** decimals);
}

export function minorToMajorString(amountMinor: number, decimals: number): string {
  return (amountMinor / 10 ** decimals).toFixed(decimals);
}
