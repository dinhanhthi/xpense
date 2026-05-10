import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  computeBalances,
  debtorOnePayeeTransfers,
  minimalTransfers,
} from '@/lib/settle';
import { resolveShares } from '@/lib/splitting';
import { formatMoney } from '@/lib/format';
import type { Group, Transfer } from '@/types/domain';

type SettlementMode = 'min' | 'debtor-one';

const MODE_LABEL: Record<SettlementMode, string> = {
  min: 'Fewest transfers',
  'debtor-one': 'Each debtor pays one',
};

export function BalancesTab({ group }: { group: Group }) {
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

  const transfersByMode = useMemo(() => {
    const make = (fn: (b: Map<string, number>) => Transfer[]) => {
      try {
        return fn(balances);
      } catch {
        return [];
      }
    };
    return {
      min: make(minimalTransfers),
      'debtor-one': make(debtorOnePayeeTransfers),
    } satisfies Record<SettlementMode, Transfer[]>;
  }, [balances]);

  const [mode, setMode] = useState<SettlementMode>('min');
  const transfers = transfersByMode[mode];

  function copySummary() {
    const lines: string[] = [];
    lines.push(`${group.name} — settlement summary`);
    lines.push(`Total spend: ${formatMoney(stats.totalSpend, group.currency, group.currencyDecimals)}`);
    lines.push('');
    lines.push('Balances:');
    for (const m of group.members) {
      const v = balances.get(m.id) ?? 0;
      const sign = v > 0 ? '+' : v < 0 ? '−' : '';
      lines.push(`  ${m.name}: ${sign}${formatMoney(Math.abs(v), group.currency, group.currencyDecimals)}`);
    }
    for (const m of ['min', 'debtor-one'] as const) {
      lines.push('');
      lines.push(`${MODE_LABEL[m]}:`);
      const ts = transfersByMode[m];
      if (ts.length === 0) {
        lines.push('  All settled — no transfers needed.');
        continue;
      }
      for (const t of ts) {
        const from = group.members.find((mm) => mm.id === t.from)?.name ?? '?';
        const to = group.members.find((mm) => mm.id === t.to)?.name ?? '?';
        lines.push(`  ${from} → ${to}: ${formatMoney(t.amountMinor, group.currency, group.currencyDecimals)}`);
      }
    }
    navigator.clipboard.writeText(lines.join('\n')).then(
      () => toast.success('Summary copied to clipboard'),
      () => toast.error('Could not copy to clipboard'),
    );
  }

  if (group.members.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Add members and expenses to see balances.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3">
        <Stat label="Total spend" value={formatMoney(stats.totalSpend, group.currency, group.currencyDecimals)} />
        <Stat label="Expenses" value={String(stats.count)} />
        <Stat label="Days span" value={stats.span > 0 ? `${stats.span} day${stats.span === 1 ? '' : 's'}` : '—'} />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Per member</h2>
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
                    paid {formatMoney(perMember.paid.get(m.id) ?? 0, group.currency, group.currencyDecimals)} · share{' '}
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
          <h2 className="text-lg font-semibold">Who pays whom</h2>
          <Button variant="outline" size="sm" onClick={copySummary}>
            Copy summary
          </Button>
        </div>
        <Tabs value={mode} onValueChange={(v) => setMode(v as SettlementMode)}>
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 p-1 sm:inline-flex sm:w-auto">
            <TabsTrigger value="min" className="text-xs sm:text-sm">
              Fewest transfers
            </TabsTrigger>
            <TabsTrigger value="debtor-one" className="text-xs sm:text-sm">
              Each pays one
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {transfers.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            All settled — no transfers needed.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {transfers.map((t, i) => {
              const from = group.members.find((m) => m.id === t.from);
              const to = group.members.find((m) => m.id === t.to);
              return (
                <li key={i} className="flex items-center gap-3 px-4 py-3">
                  <span className="font-medium">{from?.name ?? '?'}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{to?.name ?? '?'}</span>
                  <span className="ml-auto font-mono font-semibold">
                    {formatMoney(t.amountMinor, group.currency, group.currencyDecimals)}
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
