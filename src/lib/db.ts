import Dexie, { type Table } from 'dexie';
import type { Group } from '@/types/domain';

export interface StoredImage {
  id: string;
  blob: Blob;
  mime: string;
  createdAt: number;
}

class XpenseDB extends Dexie {
  groups!: Table<Group, string>;
  images!: Table<StoredImage, string>;

  constructor() {
    super('xpense');
    this.version(1).stores({
      groups: 'id, updatedAt',
      images: 'id, createdAt',
    });
  }
}

export const db = new XpenseDB();

export async function listGroups(): Promise<Group[]> {
  return db.groups.orderBy('updatedAt').reverse().toArray();
}

export async function getGroup(id: string): Promise<Group | undefined> {
  return db.groups.get(id);
}

export async function saveGroup(group: Group): Promise<void> {
  await db.groups.put(group);
}

export async function deleteGroup(id: string): Promise<void> {
  await db.groups.delete(id);
}
