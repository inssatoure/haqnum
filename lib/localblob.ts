import type { LocalBlob } from './types';

/** Reconstruit le fichier à partir de ce qui est rangé dans IndexedDB. */
export function rowBlob(b: LocalBlob | undefined | null): Blob | null {
  if (!b) return null;
  if (b.data) return new Blob([b.data], { type: b.mime });
  return b.blob ?? null;
}

export const rowSize = (b: LocalBlob): number => b.size ?? b.data?.byteLength ?? b.blob?.size ?? 0;
