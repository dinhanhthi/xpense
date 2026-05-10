import { Wallet } from 'lucide-react';
import { useGroupsStore } from '@/store/groupsStore';
import { GroupCard } from '@/components/GroupCard';
import { CreateGroupDialog } from '@/components/CreateGroupDialog';

export function HomePage() {
  const groups = useGroupsStore((s) => s.groups);
  const loaded = useGroupsStore((s) => s.loaded);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your groups</h1>
          <p className="text-sm text-muted-foreground">
            One group per trip, household, or shared expense pool.
          </p>
        </div>
        <CreateGroupDialog />
      </div>

      {!loaded ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl border bg-muted/40" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <Wallet className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="font-medium">No groups yet</p>
            <p className="text-sm text-muted-foreground">
              Create your first group to start tracking shared expenses.
            </p>
          </div>
          <CreateGroupDialog />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <GroupCard key={g.id} group={g} />
          ))}
        </div>
      )}
    </div>
  );
}
