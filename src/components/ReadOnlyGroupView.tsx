import { useMemo } from 'react';
import { ArrowRight, Receipt } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { computeBalances, debtorOnePayeeTransfers } from '@/lib/settle';
import { resolveShares } from '@/lib/splitting';
import { formatMoney } from '@/lib/format';
import type { Group } from '@/types/domain';

export function ReadOnlyGroupView({ group }: { group: Group }) {
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
  const sortedExpenses = useMemo(
    () => [...group.expenses].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [group.expenses],
  );

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Members</h2>
        <ul className="flex flex-wrap gap-2">
          {group.members.map((m) => (
            <li
              key={m.id}
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm"
            >
              <Avatar className="h-5 w-5">
                <AvatarFallback style={{ backgroundColor: m.color, color: 'white', fontSize: 10 }}>
                  {m.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {m.name}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Expenses</h2>
        {sortedExpenses.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No expenses.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {sortedExpenses.map((e) => {
              const payer = group.members.find((m) => m.id === e.payerId);
              let perMember = new Map<string, number>();
              try {
                perMember = resolveShares(e);
              } catch {
                /* ignore */
              }
              return (
                <li key={e.id} className="space-y-1 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{e.title}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{e.date}</span>
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                          style={{ backgroundColor: payer?.color ?? '#999', color: 'white' }}
                        >
                          paid by {payer?.name ?? 'unknown'}
                        </span>
                        {e.imageIds.length > 0 && (
                          <span className="inline-flex items-center gap-1" title="Images not shared">
                            <Receipt className="h-3 w-3" /> {e.imageIds.length} photo{e.imageIds.length === 1 ? '' : 's'} (not shared)
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="font-mono text-sm font-semibold">
                      {formatMoney(e.amountMinor, e.currency, group.currencyDecimals)}
                    </span>
                  </div>
                  {perMember.size > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {[...perMember.entries()]
                        .map(([id, owed]) => {
                          const m = group.members.find((mm) => mm.id === id);
                          return `${m?.name ?? '?'}: ${formatMoney(owed, e.currency, group.currencyDecimals)}`;
                        })
                        .join(' · ')}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Balances</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {group.members.map((m) => {
            const net = balances.get(m.id) ?? 0;
            const tone =
              net > 0 ? 'text-emerald-600 dark:text-emerald-400'
              : net < 0 ? 'text-red-600 dark:text-red-400'
              : 'text-muted-foreground';
            return (
              <li key={m.id} className="flex items-center gap-3 rounded-lg border p-3">
                <span className="flex-1 font-medium">{m.name}</span>
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
        <h2 className="text-lg font-semibold">Who pays whom</h2>
        {transfers.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
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
