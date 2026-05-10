import { useMemo, useState } from 'react';
import { Plus, Trash2, Image as ImageIcon, Users, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ExpenseDialog } from './ExpenseDialog';
import { useGroupsStore } from '@/store/groupsStore';
import { formatMoney } from '@/lib/format';
import type { Expense, Group } from '@/types/domain';

export function ExpensesTab({ group }: { group: Group }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | undefined>(undefined);
  const deleteExpense = useGroupsStore((s) => s.deleteExpense);
  const { t } = useTranslation();

  const sorted = useMemo(
    () => [...group.expenses].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt)),
    [group.expenses],
  );

  const noMembers = group.members.length === 0;

  function openNew() {
    setEditing(undefined);
    setDialogOpen(true);
  }
  function openEdit(e: Expense) {
    setEditing(e);
    setDialogOpen(true);
  }

  async function handleDelete(e: Expense) {
    if (!confirm(t('expenses.confirmDelete', { title: e.title }))) return;
    await deleteExpense(group.id, e.id);
    toast.success(t('expenses.toastDeleted'));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t('expenses.count', { count: group.expenses.length })}
        </p>
        <Button onClick={openNew} disabled={noMembers}>
          <Plus />
          {t('expenses.addButton')}
        </Button>
      </div>

      {noMembers ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t('expenses.noMembers')}
        </p>
      ) : sorted.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t('expenses.empty')}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {sorted.map((e) => {
            const payer = group.members.find((m) => m.id === e.payerId);
            return (
              <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                <button
                  onClick={() => openEdit(e)}
                  className="flex flex-1 items-center gap-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{e.title}</p>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>{e.date}</span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" /> {e.shares.length}
                      </span>
                      {e.imageIds.length > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <ImageIcon className="h-3 w-3" /> {e.imageIds.length}
                        </span>
                      )}
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                        style={{ backgroundColor: payer?.color ?? '#999', color: 'white' }}
                      >
                        {payer?.name ?? t('expenses.unknownPayer')}
                      </span>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-medium">
                    {formatMoney(e.amountMinor, e.currency, group.currencyDecimals)}
                  </span>
                </button>
                <Button size="icon" variant="ghost" onClick={() => openEdit(e)} aria-label={t('expenses.editAria')}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => handleDelete(e)} aria-label={t('expenses.deleteAria')}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <ExpenseDialog group={group} expense={editing} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
