import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { CURRENCIES } from '@/lib/currencies';
import { useGroupsStore } from '@/store/groupsStore';

export function CreateGroupDialog({ trigger }: { trigger?: React.ReactNode }) {
  const navigate = useNavigate();
  const createGroup = useGroupsStore((s) => s.createGroup);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const g = await createGroup(name, currency);
      setOpen(false);
      setName('');
      setCurrency('EUR');
      navigate(`/g/${g.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus />
            New group
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="contents">
          <DialogHeader>
            <DialogTitle>Create a new group</DialogTitle>
            <DialogDescription>
              Pick a name and currency. You can change them later.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="group-name">Group name</Label>
                <Input
                  id="group-name"
                  autoFocus
                  placeholder="Trip to Lisbon"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="group-currency">Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger id="group-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.symbol} — {c.code} · {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="submit" disabled={!name.trim() || submitting}>
              Create group
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
