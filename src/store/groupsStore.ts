import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { Expense, Group, Member } from '@/types/domain';
import { deleteGroup as dbDeleteGroup, listGroups, saveGroup } from '@/lib/db';
import { getCurrency } from '@/lib/currencies';
import { deleteImage } from '@/lib/images';

interface GroupsState {
  groups: Group[];
  loaded: boolean;
  loadGroups: () => Promise<void>;
  getGroup: (id: string) => Group | undefined;
  createGroup: (name: string, currencyCode: string) => Promise<Group>;
  updateGroup: (id: string, patch: Partial<Group>) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
  addMember: (groupId: string, name: string) => Promise<Member>;
  renameMember: (groupId: string, memberId: string, name: string) => Promise<void>;
  removeMember: (groupId: string, memberId: string, options?: { detach?: boolean }) => Promise<void>;
  addExpense: (groupId: string, expense: Omit<Expense, 'id' | 'groupId' | 'createdAt'>) => Promise<Expense>;
  updateExpense: (groupId: string, expense: Expense) => Promise<void>;
  deleteExpense: (groupId: string, expenseId: string) => Promise<void>;
  importGroup: (group: Group) => Promise<Group>;
}

const MEMBER_COLORS = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#eab308',
  '#84cc16',
  '#22c55e',
  '#10b981',
  '#06b6d4',
  '#0ea5e9',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#d946ef',
  '#ec4899',
];

function pickColor(existing: Member[]): string {
  return MEMBER_COLORS[existing.length % MEMBER_COLORS.length];
}

function replaceOrInsert(groups: Group[], group: Group): Group[] {
  const idx = groups.findIndex((g) => g.id === group.id);
  const next = idx === -1 ? [group, ...groups] : groups.map((g) => (g.id === group.id ? group : g));
  return next.sort((a, b) => b.updatedAt - a.updatedAt);
}

let writeQueue: Promise<unknown> = Promise.resolve();

/**
 * Serialize all writes to avoid lost-update races between concurrent mutators.
 * Each mutator reads the latest store state inside the queued task, applies its
 * patch, persists to IndexedDB, then commits to the store.
 */
async function enqueueMutation(task: () => Promise<void>): Promise<void> {
  const next = writeQueue.then(task, task);
  writeQueue = next.catch(() => undefined);
  return next;
}

export const useGroupsStore = create<GroupsState>((set, get) => {
  async function mutateGroup<T>(
    groupId: string,
    apply: (group: Group) => { next: Group; result: T },
  ): Promise<T> {
    let result!: T;
    await enqueueMutation(async () => {
      const current = get().groups.find((g) => g.id === groupId);
      if (!current) throw new Error('Group not found');
      const { next, result: r } = apply(current);
      const persisted: Group = { ...next, updatedAt: Date.now() };
      await saveGroup(persisted);
      set((s) => ({ groups: replaceOrInsert(s.groups, persisted) }));
      result = r;
    });
    return result;
  }

  return {
    groups: [],
    loaded: false,

    loadGroups: async () => {
      const groups = await listGroups();
      set({ groups, loaded: true });
    },

    getGroup: (id) => get().groups.find((g) => g.id === id),

    createGroup: async (name, currencyCode) => {
      const info = getCurrency(currencyCode);
      const now = Date.now();
      const group: Group = {
        id: nanoid(),
        name: name.trim() || 'Untitled group',
        currency: info.code,
        currencyDecimals: info.decimals,
        members: [],
        expenses: [],
        createdAt: now,
        updatedAt: now,
      };
      await enqueueMutation(async () => {
        await saveGroup(group);
        set((s) => ({ groups: replaceOrInsert(s.groups, group) }));
      });
      return group;
    },

    updateGroup: async (id, patch) => {
      await mutateGroup(id, (current) => ({ next: { ...current, ...patch }, result: undefined }));
    },

    deleteGroup: async (id) => {
      await enqueueMutation(async () => {
        const group = get().groups.find((g) => g.id === id);
        if (group) {
          const allImageIds = group.expenses.flatMap((e) => e.imageIds);
          await Promise.all(allImageIds.map((imgId) => deleteImage(imgId).catch(() => undefined)));
        }
        await dbDeleteGroup(id);
        set((s) => ({ groups: s.groups.filter((g) => g.id !== id) }));
      });
    },

    addMember: async (groupId, name) => {
      return mutateGroup(groupId, (current) => {
        const member: Member = {
          id: nanoid(),
          name: name.trim() || 'Member',
          color: pickColor(current.members),
        };
        return { next: { ...current, members: [...current.members, member] }, result: member };
      });
    },

    renameMember: async (groupId, memberId, name) => {
      await mutateGroup(groupId, (current) => {
        const members = current.members.map((m) =>
          m.id === memberId ? { ...m, name: name.trim() || m.name } : m,
        );
        return { next: { ...current, members }, result: undefined };
      });
    },

    removeMember: async (groupId, memberId, options) => {
      await mutateGroup(groupId, (current) => {
        const involvedAsPayer = current.expenses.some((e) => e.payerId === memberId);
        const involvedAsParticipant = current.expenses.some((e) =>
          e.shares.some((s) => s.memberId === memberId),
        );

        if (involvedAsPayer) {
          throw new Error(
            'This member paid for at least one expense. Reassign or delete those expenses before removing them.',
          );
        }
        if (involvedAsParticipant && !options?.detach) {
          throw new Error('member-is-participant');
        }

        const members = current.members.filter((m) => m.id !== memberId);
        const expenses = options?.detach
          ? current.expenses.map((e) => ({
              ...e,
              shares: e.shares.filter((s) => s.memberId !== memberId),
            }))
          : current.expenses;
        return { next: { ...current, members, expenses }, result: undefined };
      });
    },

    addExpense: async (groupId, draft) => {
      return mutateGroup(groupId, (current) => {
        const expense: Expense = {
          ...draft,
          id: nanoid(),
          groupId,
          createdAt: Date.now(),
        };
        return { next: { ...current, expenses: [expense, ...current.expenses] }, result: expense };
      });
    },

    updateExpense: async (groupId, expense) => {
      await mutateGroup(groupId, (current) => {
        const expenses = current.expenses.map((e) => (e.id === expense.id ? expense : e));
        return { next: { ...current, expenses }, result: undefined };
      });
    },

    deleteExpense: async (groupId, expenseId) => {
      const target = get().getGroup(groupId)?.expenses.find((e) => e.id === expenseId);
      if (target) {
        await Promise.all(target.imageIds.map((id) => deleteImage(id).catch(() => undefined)));
      }
      await mutateGroup(groupId, (current) => ({
        next: { ...current, expenses: current.expenses.filter((e) => e.id !== expenseId) },
        result: undefined,
      }));
    },

    importGroup: async (incoming) => {
      const now = Date.now();
      const newGroupId = nanoid();
      const group: Group = {
        ...incoming,
        id: newGroupId,
        // Re-anchor every nested expense to the new group id so persistence is consistent.
        expenses: incoming.expenses.map((e) => ({ ...e, groupId: newGroupId })),
        createdAt: now,
        updatedAt: now,
      };
      await enqueueMutation(async () => {
        await saveGroup(group);
        set((s) => ({ groups: replaceOrInsert(s.groups, group) }));
      });
      return group;
    },
  };
});
