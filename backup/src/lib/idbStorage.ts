import type { StateStorage } from 'zustand/middleware';
import { compressString, decompressString } from '@/lib/compression';

const DB_NAME = '3maps';
const STORE_NAME = 'zustand';
const DB_VERSION = 1;

/** Minimum serialized size (bytes) before compression is applied. */
const COMPRESS_THRESHOLD = 50 * 1024; // 50 KB

/** Prefix added to compressed values so we can detect them on read. */
const COMPRESSED_PREFIX = '__gz__:';

let dbPromise: Promise<IDBDatabase> | null = null;

function hasIndexedDB(): boolean {
  return typeof indexedDB !== 'undefined';
}

function getDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function idbGet(key: string): Promise<string | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: string): Promise<void> {
  const db = await getDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbDel(key: string): Promise<void> {
  const db = await getDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbGetAllKeys(): Promise<string[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAllKeys();
    req.onsuccess = () => resolve(req.result as string[]);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Compress value before writing if it exceeds the threshold.
 * Compressed values are prefixed with COMPRESSED_PREFIX so they can be
 * identified and decompressed on read.
 */
async function maybeCompress(value: string): Promise<string> {
  if (value.length < COMPRESS_THRESHOLD) return value;
  const compressed = await compressString(value);
  return `${COMPRESSED_PREFIX}${compressed}`;
}

/**
 * Decompress a value if it was stored compressed.
 * Falls back to returning the raw value for backward compatibility.
 */
async function maybeDecompress(value: string): Promise<string> {
  if (!value.startsWith(COMPRESSED_PREFIX)) return value;
  const payload = value.slice(COMPRESSED_PREFIX.length);
  try {
    return await decompressString(payload);
  } catch {
    // Decompression failed — return the raw stored value for backward compat
    console.warn('[idbStorage] Decompression failed, returning raw value');
    return value;
  }
}

/**
 * Remove maps from IndexedDB that are older than 90 days and haven't been updated.
 * Operates on the raw persisted JSON blobs stored under each Zustand key.
 */
export async function clearOldData(): Promise<void> {
  if (!hasIndexedDB()) return;

  const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - NINETY_DAYS_MS;

  try {
    const keys = await idbGetAllKeys();
    for (const key of keys) {
      const raw = await idbGet(key);
      if (!raw) continue;

      let jsonStr: string;
      try {
        jsonStr = await maybeDecompress(raw);
      } catch {
        continue;
      }

      let parsed: { state?: { maps?: Array<{ id: string; updatedAt?: string }> } };
      try {
        parsed = JSON.parse(jsonStr) as typeof parsed;
      } catch {
        continue;
      }

      const maps = parsed?.state?.maps;
      if (!Array.isArray(maps)) continue;

      const filtered = maps.filter((m) => {
        if (!m.updatedAt) return true; // keep if no date
        const age = Date.now() - new Date(m.updatedAt).getTime();
        return age < cutoff;
      });

      if (filtered.length < maps.length) {
        const removed = maps.length - filtered.length;
        console.log(`[idbStorage] clearOldData: removing ${removed} old map(s) from key "${key}"`);
        parsed.state!.maps = filtered;
        const newJson = JSON.stringify(parsed);
        const newValue = await maybeCompress(newJson);
        await idbSet(key, newValue);
      }
    }
  } catch (err) {
    console.warn('[idbStorage] clearOldData error:', err);
  }
}

/**
 * Zustand persist StateStorage backed by IndexedDB.
 *
 * Notes:
 * - Data is stored on disk by the browser (not as user-visible files/folders).
 * - Includes one-time auto-migration from localStorage when IDB has no value.
 * - Large values (>50 KB) are compressed with gzip before storage.
 * - Compressed values are transparently decompressed on read.
 */
export const idbStateStorage: StateStorage<Promise<void>> = {
  async getItem(name) {
    if (typeof window === 'undefined') return null;

    if (!hasIndexedDB()) {
      return window.localStorage.getItem(name);
    }

    const raw = await idbGet(name);
    if (raw != null) {
      try {
        return await maybeDecompress(raw);
      } catch {
        // Decompression failed — try reading as plain uncompressed (backward compat)
        console.warn('[idbStorage] getItem: falling back to raw value for key', name);
        return raw;
      }
    }

    // Auto-migrate from localStorage (previous versions)
    const legacy = window.localStorage.getItem(name);
    if (legacy != null) {
      const toStore = await maybeCompress(legacy);
      await idbSet(name, toStore);
      return legacy;
    }

    return null;
  },

  async setItem(name, value) {
    if (typeof window === 'undefined') return;

    if (!hasIndexedDB()) {
      window.localStorage.setItem(name, value);
      return;
    }

    const toStore = await maybeCompress(value);
    await idbSet(name, toStore);
  },

  async removeItem(name) {
    if (typeof window === 'undefined') return;

    if (!hasIndexedDB()) {
      window.localStorage.removeItem(name);
      return;
    }

    await idbDel(name);
  },
};
