/**
 * Storage cleanup utilities for 3Maps.
 *
 * Provides:
 * - performStorageCleanup(): removes old/orphaned data from IndexedDB
 * - getStorageStats(): diagnostic info about stored data
 */

import { useMapsStore } from '@/stores/maps-store';
import { useChatStore } from '@/stores/chat-store';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Perform a cleanup pass:
 * 1. Remove maps older than 90 days (based on `updatedAt`) that have no tags.
 * 2. Remove orphaned chat sessions (sessions for maps that no longer exist).
 *
 * Logs all cleanup actions to the console.
 */
export async function performStorageCleanup(): Promise<void> {
  try {
    const mapsStore = useMapsStore.getState();
    const chatStore = useChatStore.getState();

    const now = Date.now();
    const cutoff = now - NINETY_DAYS_MS;

    // --- 1. Remove old maps with no tags ---
    const allMaps = mapsStore.maps;
    const mapsToDelete = allMaps.filter((m) => {
      if (!m.updatedAt) return false;
      const age = now - new Date(m.updatedAt).getTime();
      const isOld = age > cutoff;
      const hasNoTags = !Array.isArray(m.tags) || m.tags.length === 0;
      return isOld && hasNoTags;
    });

    for (const map of mapsToDelete) {
      console.log(`[storageCleanup] Removing old map (no tags, >90 days): "${map.title}" (${map.id})`);
      mapsStore.deleteMap(map.id);
    }

    // --- 2. Remove orphaned chat sessions ---
    const remainingMapIds = new Set(
      useMapsStore.getState().maps.map((m) => m.id)
    );
    const sessions = chatStore.sessions;
    const orphanedSessionIds = Object.keys(sessions).filter(
      (mapId) => !remainingMapIds.has(mapId)
    );

    for (const mapId of orphanedSessionIds) {
      console.log(`[storageCleanup] Removing orphaned chat session for map: ${mapId}`);
      chatStore.clearSession(mapId);
    }

    if (mapsToDelete.length === 0 && orphanedSessionIds.length === 0) {
      console.log('[storageCleanup] No cleanup needed.');
    } else {
      console.log(
        `[storageCleanup] Done. Removed ${mapsToDelete.length} old map(s) and ${orphanedSessionIds.length} orphaned chat session(s).`
      );
    }
  } catch (err) {
    console.warn('[storageCleanup] performStorageCleanup error:', err);
  }
}

/**
 * Return diagnostic statistics about the current stored data.
 */
export async function getStorageStats(): Promise<{
  mapCount: number;
  totalSizeKB: number;
  oldMapCount: number;
}> {
  try {
    const maps = useMapsStore.getState().maps;
    const now = Date.now();
    const cutoff = now - NINETY_DAYS_MS;

    const totalSizeBytes = new TextEncoder().encode(JSON.stringify(maps)).length;
    const oldMapCount = maps.filter((m) => {
      if (!m.updatedAt) return false;
      return now - new Date(m.updatedAt).getTime() > cutoff;
    }).length;

    return {
      mapCount: maps.length,
      totalSizeKB: Math.round(totalSizeBytes / 1024),
      oldMapCount,
    };
  } catch {
    return { mapCount: 0, totalSizeKB: 0, oldMapCount: 0 };
  }
}
