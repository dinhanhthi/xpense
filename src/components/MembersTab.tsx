import { useState } from 'react';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useGroupsStore } from '@/store/groupsStore';
import type { Group, Member } from '@/types/domain';

export function MembersTab({ group }: { group: Group }) {
  const addMember = useGroupsStore((s) => s.addMember);
  const renameMember = useGroupsStore((s) => s.renameMember);
  const removeMember = useGroupsStore((s) => s.removeMember);
  const [newName, setNewName] = useState('');

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    await addMember(group.id, newName);
    setNewName('');
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="flex gap-2">
        <Input
          placeholder="Add a member (e.g. Alice)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <Button type="submit" disabled={!newName.trim()}>
          <Plus />
          Add
        </Button>
      </form>

      {group.members.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Add at least one member to start logging expenses.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {group.members.map((m) => (
            <MemberRow
              key={m.id}
              group={group}
              member={m}
              onRename={(name) => renameMember(group.id, m.id, name)}
              onRemove={async () => {
                try {
                  await removeMember(group.id, m.id);
                  toast.success(`Removed ${m.name}`);
                } catch (err) {
                  const msg = (err as Error).message;
                  if (msg === 'member-is-participant') {
                    const ok = confirm(
                      `${m.name} is split into existing expenses. Remove them and detach their share from those expenses? (Existing splits will be recomputed without them.)`,
                    );
                    if (!ok) return;
                    try {
                      await removeMember(group.id, m.id, { detach: true });
                      toast.success(`Removed ${m.name} and detached from past expenses`);
                    } catch (err2) {
                      toast.error((err2 as Error).message);
                    }
                  } else {
                    toast.error(msg);
                  }
                }
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function MemberRow({
  member,
  onRename,
  onRemove,
}: {
  group: Group;
  member: Member;
  onRename: (name: string) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(member.name);
  const initial = member.name.charAt(0).toUpperCase() || '?';

  async function commit() {
    if (draft.trim() && draft !== member.name) {
      await onRename(draft);
    }
    setEditing(false);
  }

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Avatar className="h-8 w-8">
        <AvatarFallback style={{ backgroundColor: member.color, color: 'white' }}>
          {initial}
        </AvatarFallback>
      </Avatar>
      {editing ? (
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setDraft(member.name);
              setEditing(false);
            }
          }}
          className="h-8"
        />
      ) : (
        <span className="flex-1 font-medium">{member.name}</span>
      )}
      {editing ? (
        <>
          <Button size="icon" variant="ghost" onClick={commit} aria-label="Save">
            <Check className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              setDraft(member.name);
              setEditing(false);
            }}
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </Button>
        </>
      ) : (
        <>
          <Button size="icon" variant="ghost" onClick={() => setEditing(true)} aria-label="Rename">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onRemove} aria-label="Remove">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </>
      )}
    </li>
  );
}
