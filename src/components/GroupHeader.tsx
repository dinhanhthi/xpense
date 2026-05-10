import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreVertical, Trash2, Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useGroupsStore } from '@/store/groupsStore';
import { getCurrency } from '@/lib/currencies';
import type { Group } from '@/types/domain';

export function GroupHeader({ group }: { group: Group }) {
  const navigate = useNavigate();
  const updateGroup = useGroupsStore((s) => s.updateGroup);
  const deleteGroup = useGroupsStore((s) => s.deleteGroup);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(group.name);
  const cur = getCurrency(group.currency);
  const { t } = useTranslation();

  async function commit() {
    if (draft.trim() && draft !== group.name) {
      await updateGroup(group.id, { name: draft.trim() });
    }
    setEditing(false);
  }

  async function handleDelete() {
    if (!confirm(t('groupHeader.confirmDelete', { name: group.name }))) {
      return;
    }
    await deleteGroup(group.id);
    toast.success(t('groupHeader.toastDeleted'));
    navigate('/');
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {editing ? (
        <div className="flex items-center gap-1">
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') {
                setDraft(group.name);
                setEditing(false);
              }
            }}
            className="h-8 w-64"
          />
          <Button size="icon" variant="ghost" onClick={commit} aria-label={t('groupHeader.saveAria')}>
            <Check className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              setDraft(group.name);
              setEditing(false);
            }}
            aria-label={t('groupHeader.cancelAria')}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{group.name}</h1>
          <Button size="icon" variant="ghost" onClick={() => setEditing(true)} aria-label={t('groupHeader.renameAria')}>
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      )}
      <span className="rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground">
        {cur.symbol} {cur.code}
      </span>
      <div className="ml-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label={t('groupHeader.actionsAria')}>
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" /> {t('groupHeader.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
