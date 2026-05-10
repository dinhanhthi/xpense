import { useEffect, useMemo } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGroupsStore } from '@/store/groupsStore';
import { computeBalances, minimalTransfers } from '@/lib/settle';
import { resolveShares } from '@/lib/splitting';
import { formatMoney } from '@/lib/format';
import { getCurrency } from '@/lib/currencies';
import type { Group } from '@/types/domain';

export function PrintGroupPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const groups = useGroupsStore((s) => s.groups);
  const loaded = useGroupsStore((s) => s.loaded);
  const group = groupId ? groups.find((g) => g.id === groupId) : undefined;

  useEffect(() => {
    if (group) document.title = `${group.name} — Xpense summary`;
    return () => {
      document.title = 'Xpense — Split expenses with friends';
    };
  }, [group]);

  if (!loaded) return null;
  if (!group) return <Navigate to="/" replace />;

  return (
    <div className="print-page mx-auto max-w-3xl bg-white px-8 py-10 text-slate-900">
      <div className="no-print mb-6 flex justify-end gap-2">
        <Button variant="outline" onClick={() => window.history.back()}>
          Back
        </Button>
        <Button onClick={() => window.print()}>
          <Printer /> Print / Save as PDF
        </Button>
      </div>
      <Summary group={group} />
    </div>
  );
}

function Summary({ group }: { group: Group }) {
  const cur = getCurrency(group.currency);

  const totalSpend = useMemo(
    () => group.expenses.reduce((s, e) => s + e.amountMinor, 0),
    [group.expenses],
  );

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
        /* skip */
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
  const transfers = useMemo(() => minimalTransfers(balances), [balances]);

  const sortedExpenses = useMemo(
    () => [...group.expenses].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [group.expenses],
  );

  const dateRange = useMemo(() => {
    if (sortedExpenses.length === 0) return null;
    const dates = sortedExpenses.map((e) => e.date).sort();
    return { from: dates[0], to: dates[dates.length - 1] };
  }, [sortedExpenses]);

  return (
    <article className="space-y-10">
      <header className="border-b border-slate-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Xpense · Group Summary
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{group.name}</h1>
        <p className="mt-2 text-sm text-slate-500">
          {cur.label} ({cur.code}) · generated{' '}
          {new Date().toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })}
        </p>
      </header>

      <section className="grid grid-cols-3 gap-6">
        <Stat label="Total spend" value={formatMoney(totalSpend, group.currency, group.currencyDecimals)} />
        <Stat label="Expenses" value={String(group.expenses.length)} />
        <Stat
          label="Members"
          value={String(group.members.length)}
          sub={dateRange ? `${dateRange.from} → ${dateRange.to}` : '—'}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Members</h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
          {group.members.map((m) => {
            const net = balances.get(m.id) ?? 0;
            const tone = net > 0 ? 'text-emerald-700' : net < 0 ? 'text-red-700' : 'text-slate-500';
            return (
              <div key={m.id} className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 flex-none rounded-full"
                  style={{ backgroundColor: m.color ?? '#94a3b8' }}
                  aria-hidden
                />
                <span className="flex-1 truncate font-medium text-slate-800">{m.name}</span>
                <span className={`font-mono text-xs ${tone}`}>
                  {net > 0 ? '+' : net < 0 ? '−' : ''}
                  {formatMoney(Math.abs(net), group.currency, group.currencyDecimals)}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Per member</h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="py-2 font-medium">Member</th>
              <th className="py-2 text-right font-medium">Paid</th>
              <th className="py-2 text-right font-medium">Share</th>
              <th className="py-2 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody>
            {group.members.map((m) => {
              const net = balances.get(m.id) ?? 0;
              const tone = net > 0 ? 'text-emerald-700' : net < 0 ? 'text-red-700' : 'text-slate-500';
              return (
                <tr key={m.id} className="border-b border-slate-100">
                  <td className="py-2 font-medium text-slate-800">{m.name}</td>
                  <td className="py-2 text-right font-mono text-slate-600">
                    {formatMoney(perMember.paid.get(m.id) ?? 0, group.currency, group.currencyDecimals)}
                  </td>
                  <td className="py-2 text-right font-mono text-slate-600">
                    {formatMoney(perMember.share.get(m.id) ?? 0, group.currency, group.currencyDecimals)}
                  </td>
                  <td className={`py-2 text-right font-mono ${tone}`}>
                    {net > 0 ? '+' : net < 0 ? '−' : ''}
                    {formatMoney(Math.abs(net), group.currency, group.currencyDecimals)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="space-y-3 print-keep-together">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Who pays whom</h2>
        {transfers.length === 0 ? (
          <p className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
            All settled — no transfers needed.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {transfers.map((t, i) => {
              const from = group.members.find((m) => m.id === t.from);
              const to = group.members.find((m) => m.id === t.to);
              return (
                <li
                  key={i}
                  className="flex items-center gap-4 px-4 py-3 print-row"
                >
                  <span
                    className="inline-block h-3 w-3 flex-none rounded-full"
                    style={{ backgroundColor: from?.color ?? '#94a3b8' }}
                    aria-hidden
                  />
                  <span className="font-medium text-slate-800">{from?.name ?? '?'}</span>
                  <span aria-hidden className="text-slate-400">→</span>
                  <span
                    className="inline-block h-3 w-3 flex-none rounded-full"
                    style={{ backgroundColor: to?.color ?? '#94a3b8' }}
                    aria-hidden
                  />
                  <span className="font-medium text-slate-800">{to?.name ?? '?'}</span>
                  <span className="ml-auto font-mono font-semibold text-slate-900">
                    {formatMoney(t.amountMinor, group.currency, group.currencyDecimals)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Expenses</h2>
        {sortedExpenses.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
            No expenses logged.
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="py-2 font-medium">Date</th>
                <th className="py-2 font-medium">Title</th>
                <th className="py-2 font-medium">Paid by</th>
                <th className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {sortedExpenses.map((e) => {
                const payer = group.members.find((m) => m.id === e.payerId);
                return (
                  <tr key={e.id} className="border-b border-slate-100 print-row">
                    <td className="py-2 font-mono text-xs text-slate-500">{e.date}</td>
                    <td className="py-2 text-slate-800">
                      <div className="font-medium">{e.title}</div>
                      {e.note && <div className="text-xs text-slate-500">{e.note}</div>}
                    </td>
                    <td className="py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: payer?.color ?? '#94a3b8' }}
                          aria-hidden
                        />
                        <span className="text-slate-700">{payer?.name ?? '—'}</span>
                      </span>
                    </td>
                    <td className="py-2 text-right font-mono text-slate-900">
                      {formatMoney(e.amountMinor, e.currency, group.currencyDecimals)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="pt-3 text-right text-xs uppercase tracking-wider text-slate-500">
                  Total
                </td>
                <td className="pt-3 text-right font-mono font-semibold text-slate-900">
                  {formatMoney(totalSpend, group.currency, group.currencyDecimals)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      <footer className="border-t border-slate-200 pt-4 text-center text-xs text-slate-400">
        Generated by Xpense · runs entirely in your browser
      </footer>
    </article>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 font-mono text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
