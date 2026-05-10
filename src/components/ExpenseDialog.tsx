import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AmountInput } from './AmountInput';
import { SplitEditor } from './SplitEditor';
import { ImageAttachments } from './ImageAttachments';
import { useGroupsStore } from '@/store/groupsStore';
import { resolveShares, SplitValidationError } from '@/lib/splitting';
import { deleteImage } from '@/lib/images';
import type { Expense, Group, SplitMode, SplitShare } from '@/types/domain';

interface Props {
  group: Group;
  expense?: Expense;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export function ExpenseDialog({ group, expense, open, onOpenChange }: Props) {
  const addExpense = useGroupsStore((s) => s.addExpense);
  const updateExpense = useGroupsStore((s) => s.updateExpense);

  const [title, setTitle] = useState('');
  const [amountMinor, setAmountMinor] = useState(0);
  const [payerId, setPayerId] = useState<string>('');
  const [date, setDate] = useState(todayIso());
  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [shares, setShares] = useState<SplitShare[]>([]);
  const [imageIds, setImageIds] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [initialImageIds, setInitialImageIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    if (expense) {
      setTitle(expense.title);
      setAmountMinor(expense.amountMinor);
      setPayerId(expense.payerId);
      setDate(expense.date);
      setSplitMode(expense.splitMode);
      // Reconcile shares with current member list — drop entries whose member
      // no longer exists, dedupe by memberId.
      const memberIds = new Set(group.members.map((m) => m.id));
      const seen = new Set<string>();
      const reconciled = expense.shares.filter((s) => {
        if (!memberIds.has(s.memberId) || seen.has(s.memberId)) return false;
        seen.add(s.memberId);
        return true;
      });
      setShares(reconciled);
      setImageIds(expense.imageIds);
      setInitialImageIds(expense.imageIds);
      setNote(expense.note ?? '');
    } else {
      setTitle('');
      setAmountMinor(0);
      setPayerId(group.members[0]?.id ?? '');
      setDate(todayIso());
      setSplitMode('equal');
      setShares(group.members.map((m) => ({ memberId: m.id, value: 0 })));
      setImageIds([]);
      setInitialImageIds([]);
      setNote('');
    }
  }, [open, expense, group]);

  function validate(): { ok: true } | { ok: false; reason: string } {
    if (!title.trim()) return { ok: false, reason: 'Add a title.' };
    if (amountMinor <= 0) return { ok: false, reason: 'Amount must be greater than 0.' };
    if (!payerId) return { ok: false, reason: 'Pick who paid.' };
    if (shares.length === 0) return { ok: false, reason: 'Pick at least one participant.' };
    try {
      resolveShares({
        id: 'v',
        groupId: group.id,
        title,
        amountMinor,
        currency: group.currency,
        payerId,
        date,
        splitMode,
        shares,
        imageIds: [],
        createdAt: 0,
      });
      return { ok: true };
    } catch (err) {
      if (err instanceof SplitValidationError) return { ok: false, reason: err.message };
      throw err;
    }
  }

  const validation = validate();

  async function handleSave() {
    if (!validation.ok) return;
    const payload = {
      title: title.trim(),
      amountMinor,
      currency: group.currency,
      payerId,
      date,
      splitMode,
      shares,
      imageIds,
      note: note.trim() || undefined,
    };
    try {
      if (expense) {
        await updateExpense(group.id, { ...expense, ...payload });
        toast.success('Expense updated');
      } else {
        await addExpense(group.id, payload);
        toast.success('Expense added');
      }
      // Now that the expense save succeeded, GC any images the user removed
      // during this editing session.
      const removed = initialImageIds.filter((id) => !imageIds.includes(id));
      await Promise.all(removed.map((id) => deleteImage(id).catch(() => undefined)));
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function handleClose(open: boolean) {
    if (open) {
      onOpenChange(true);
      return;
    }
    // Cancelled — drop any newly uploaded blobs the user added during this session.
    const added = imageIds.filter((id) => !initialImageIds.includes(id));
    await Promise.all(added.map((id) => deleteImage(id).catch(() => undefined)));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{expense ? 'Edit expense' : 'Add expense'}</DialogTitle>
        </DialogHeader>

        <DialogBody>
          <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="exp-title">Title</Label>
            <Input
              id="exp-title"
              autoFocus
              placeholder="e.g. Dinner at La Casa"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="exp-amount">Amount ({group.currency})</Label>
              <AmountInput
                id="exp-amount"
                value={amountMinor}
                decimals={group.currencyDecimals}
                onChange={setAmountMinor}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="exp-date">Date</Label>
              <Input
                id="exp-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="exp-payer">Paid by</Label>
            <Select value={payerId} onValueChange={setPayerId}>
              <SelectTrigger id="exp-payer">
                <SelectValue placeholder="Pick a member" />
              </SelectTrigger>
              <SelectContent>
                {group.members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              For multiple payers on the same activity, add one expense entry per payer.
            </p>
          </div>

          <SplitEditor
            members={group.members}
            payerId={payerId}
            splitMode={splitMode}
            onSplitModeChange={setSplitMode}
            shares={shares}
            onSharesChange={setShares}
            amountMinor={amountMinor}
            currency={group.currency}
            decimals={group.currencyDecimals}
          />

          <div className="grid gap-2">
            <Label>Bill photos (kept on this device only)</Label>
            <ImageAttachments imageIds={imageIds} onChange={setImageIds} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="exp-note">Note (optional)</Label>
            <Input id="exp-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <div className="mr-auto text-xs text-destructive">
            {!validation.ok ? validation.reason : null}
          </div>
          <Button onClick={handleSave} disabled={!validation.ok}>
            {expense ? 'Save changes' : 'Add expense'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
