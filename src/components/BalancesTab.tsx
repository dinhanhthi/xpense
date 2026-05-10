import { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { computeBalances, debtorOnePayeeTransfers } from '@/lib/settle';
import { resolveShares } from '@/lib/splitting';
import { formatMoney } from '@/lib/format';
import type { Group } from '@/types/domain';

export function BalancesTab({ group }: { group: Group }) {
  const { t } = useTranslation();
  const stats = useMemo(() => {
    const totalSpend = group.expenses.reduce((sum, e) => sum + e.amountMinor, 0);
    const dates = group.expenses.map((e) => e.date).sort();
    const span = dates.length > 1 ? daysBetween(dates[0], dates[dates.length - 1]) : 0;
    return { totalSpend, span, count: group.expenses.length };
  }, [group.expenses]);

  const perMember = useMemo(() => {
    const paid = new Map<string, number>();
    const share = new Map<string, number>();
    group.members.forEach((m) => {
      paid.set(m.id, 0);
      share.set(m.id, 0);
    });
    for (const e of group.expenses) {
      paid.set(e.payerId, (paid.get(e.payerId) ?? 0) + e.amountMinor);
      try {
        const r = resolveShares(e);
        for (const [id, owed] of r) share.set(id, (share.get(id) ?? 0) + owed);
      } catch {
        // skip invalid expense
      }
    }
    return { paid, share };
  }, [group]);

  const balances = useMemo(() => {
    try {
      return computeBalances(group);
    } catch {
      return new Map<string, number>();
    }
  }, [group]);

  const transfers = useMemo(() => {
    try {
      return debtorOnePayeeTransfers(balances);
    } catch {
      return [];
    }
  }, [balances]);

  function copySummary() {
    const lines: string[] = [];
    lines.push(t('balances.summaryHeader', { name: group.name }));
    lines.push(
      t('balances.summaryTotal', {
        amount: formatMoney(stats.totalSpend, group.currency, group.currencyDecimals),
      }),
    );
    lines.push('');
    lines.push(t('balances.summaryBalances'));
    for (const m of group.members) {
      const v = balances.get(m.id) ?? 0;
      const sign = v > 0 ? '+' : v < 0 ? '−' : '';
      lines.push(`  ${m.name}: ${sign}${formatMoney(Math.abs(v), group.currency, group.currencyDecimals)}`);
    }
    lines.push('');
    lines.push(t('balances.summaryWho'));
    if (transfers.length === 0) {
      lines.push(t('balances.summaryAllSettled'));
    } else {
      for (const tr of transfers) {
        const from = group.members.find((mm) => mm.id === tr.from)?.name ?? '?';
        const to = group.members.find((mm) => mm.id === tr.to)?.name ?? '?';
        lines.push(`  ${from} → ${to}: ${formatMoney(tr.amountMinor, group.currency, group.currencyDecimals)}`);
      }
    }
    navigator.clipboard.writeText(lines.join('\n')).then(
      () => toast.success(t('balances.toastCopied')),
      () => toast.error(t('balances.toastCopyFailed')),
    );
  }

  if (group.members.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        {t('balances.addHint')}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3">
        <Stat label={t('balances.totalSpend')} value={formatMoney(stats.totalSpend, group.currency, group.currencyDecimals)} />
        <Stat label={t('balances.expenses')} value={String(stats.count)} />
        <Stat
          label={t('balances.daysSpan')}
          value={stats.span > 0 ? t('balances.days', { count: stats.span }) : '—'}
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('balances.perMember')}</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {group.members.map((m) => {
            const net = balances.get(m.id) ?? 0;
            const tone =
              net > 0 ? 'text-emerald-600 dark:text-emerald-400'
              : net < 0 ? 'text-red-600 dark:text-red-400'
              : 'text-muted-foreground';
            return (
              <li key={m.id} className="flex items-center gap-3 rounded-lg border p-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback style={{ backgroundColor: m.color, color: 'white' }}>
                    {m.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('balances.paid')}{' '}
                    {formatMoney(perMember.paid.get(m.id) ?? 0, group.currency, group.currencyDecimals)} ·{' '}
                    {t('balances.share')}{' '}
                    {formatMoney(perMember.share.get(m.id) ?? 0, group.currency, group.currencyDecimals)}
                  </p>
                </div>
                <span className={`font-mono text-sm font-semibold ${tone}`}>
                  {net > 0 ? '+' : net < 0 ? '−' : ''}
                  {formatMoney(Math.abs(net), group.currency, group.currencyDecimals)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t('balances.whoPaysWhom')}</h2>
          <Button variant="outline" size="sm" onClick={copySummary}>
            {t('balances.copySummary')}
          </Button>
        </div>
        {transfers.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t('balances.allSettled')}
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {transfers.map((tr, i) => {
              const from = group.members.find((m) => m.id === tr.from);
              const to = group.members.find((m) => m.id === tr.to);
              return (
                <li key={i} className="flex items-center gap-3 px-4 py-3">
                  <span className="font-medium">{from?.name ?? '?'}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{to?.name ?? '?'}</span>
                  <span className="ml-auto font-mono font-semibold">
                    {formatMoney(tr.amountMinor, group.currency, group.currencyDecimals)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="font-mono text-lg font-semibold">{value}</p>
    </div>
  );
}

function daysBetween(a: string, b: string): number {
  const da = parseIsoDateUtc(a);
  const db = parseIsoDateUtc(b);
  if (da === null || db === null) return 0;
  return Math.round(Math.abs(db - da) / (1000 * 60 * 60 * 24));
}

function parseIsoDateUtc(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.test(s) ? s.split('-') : null;
  if (!m) return null;
  return Date.UTC(Number(m[0]), Number(m[1]) - 1, Number(m[2]));
}
