import { nanoid } from 'nanoid';
import { db } from './db';

const MAX_CACHED_URLS = 50;

const urlCache = new Map<string, string>();

function touch(id: string, url: string) {
  if (urlCache.has(id)) urlCache.delete(id);
  urlCache.set(id, url);
  while (urlCache.size > MAX_CACHED_URLS) {
    const oldest = urlCache.keys().next().value;
    if (oldest === undefined) break;
    const oldestUrl = urlCache.get(oldest);
    urlCache.delete(oldest);
    if (oldestUrl) URL.revokeObjectURL(oldestUrl);
  }
}

export async function saveImage(file: File | Blob): Promise<string> {
  const id = nanoid();
  const mime = (file as File).type || 'image/png';
  await db.images.put({ id, blob: file, mime, createdAt: Date.now() });
  return id;
}

export async function getImageUrl(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) {
    touch(id, cached);
    return cached;
  }
  const rec = await db.images.get(id);
  if (!rec) return null;
  const url = URL.createObjectURL(rec.blob);
  touch(id, url);
  return url;
}

export async function deleteImage(id: string): Promise<void> {
  const url = urlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(id);
  }
  await db.images.delete(id);
}

export function revokeAllImageUrls(): void {
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', revokeAllImageUrls);
}
