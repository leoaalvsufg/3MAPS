import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { SavedMap, GenerationState } from '@/types/mindmap';
import { idbStateStorage } from '@/lib/idbStorage';
import { useSettingsStore } from '@/stores/settings-store';
import { deleteUserMap, getUserMap, putUserMap } from '@/services/api/mapsApi';

type ServerSyncStatus = 'idle' | 'loading' | 'ready' | 'error';

type ServerSyncState = {
	status: ServerSyncStatus;
	error?: string;
	lastSyncAt?: string;
};

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Tracks which fields have local changes not yet synced to the server.
 * Key: map id, Value: set of changed field names.
 */
const pendingChanges = new Map<string, Set<keyof SavedMap>>();

function getActiveUsername() {
  const u = useSettingsStore.getState().username;
  return (u && u.trim()) ? u.trim() : 'local';
}

interface MapsStore {
  maps: SavedMap[];
  generation: GenerationState;

	// Server sync (per-map, on-demand)
	serverSyncById: Record<string, ServerSyncState>;
	loadMapFromServer: (id: string) => Promise<void>;
	clearServerSyncError: (id: string) => void;

  // Map CRUD
  addMap: (map: SavedMap) => void;
  updateMap: (id: string, updates: Partial<SavedMap>) => void;
  deleteMap: (id: string) => void;
  getMap: (id: string) => SavedMap | undefined;

  // Tags
  addTag: (mapId: string, tag: string) => void;
  removeTag: (mapId: string, tag: string) => void;
  getAllTags: () => string[];

  // Generation state
  setGenerationStatus: (status: GenerationState['status']) => void;
  setGenerationProgress: (progress: number, step: string) => void;
  setGenerationError: (error: string) => void;
  setCurrentMapId: (id: string | undefined) => void;
  resetGeneration: () => void;

  /** Sync all maps that have pending local changes not yet persisted to server. */
  syncAllPending: () => Promise<void>;
}

const initialGeneration: GenerationState = {
  status: 'idle',
  progress: 0,
  currentStep: '',
  error: undefined,
  currentMapId: undefined,
};

function normalizeSavedMap(m: SavedMap): SavedMap {
	return {
		...m,
		graphType: m.graphType ?? 'mindmap',
		tags: Array.isArray(m.tags) ? m.tags : [],
			detailsEnabled: m.detailsEnabled ?? true,
	};
}

export const useMapsStore = create<MapsStore>()(
  persist(
    (set, get) => ({
      maps: [],
      generation: initialGeneration,

		serverSyncById: {},

		clearServerSyncError: (id) =>
			set((s) => ({
				serverSyncById: {
					...s.serverSyncById,
					[id]: { ...(s.serverSyncById[id] ?? { status: 'idle' }), error: undefined },
				},
			})),

		loadMapFromServer: async (id) => {
			const username = getActiveUsername();
			set((s) => ({
				serverSyncById: {
					...s.serverSyncById,
					[id]: { status: 'loading', error: undefined },
				},
			}));
			try {
				const fromServer = normalizeSavedMap(await getUserMap(username, id));
				const local = get().getMap(id);
				// Offline-first merge: only overwrite local if server is newer.
				const shouldUseServer = !local || new Date(fromServer.updatedAt).getTime() > new Date(local.updatedAt).getTime();
				if (shouldUseServer) {
					set((state) => {
						const exists = state.maps.some((m) => m.id === id);
						const nextMaps = exists
							? state.maps.map((m) => (m.id === id ? fromServer : m))
							: [fromServer, ...state.maps];
						return { maps: nextMaps };
					});
				}
				set((s) => ({
					serverSyncById: {
						...s.serverSyncById,
						[id]: { status: 'ready', lastSyncAt: new Date().toISOString() },
					},
				}));
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				set((s) => ({
					serverSyncById: {
						...s.serverSyncById,
						[id]: { status: 'error', error: message },
					},
				}));
			}
		},

      addMap: (map) => {
			const normalized = normalizeSavedMap(map);
        set((state) => ({ maps: [normalized, ...state.maps] }));
        const username = getActiveUsername();
			set((s) => ({
				serverSyncById: { ...s.serverSyncById, [normalized.id]: { status: 'loading', error: undefined } },
			}));
			void putUserMap(username, normalized.id, normalized)
				.then(() => {
					// Mark as synced — clear pending changes and record lastSyncedAt
					pendingChanges.delete(normalized.id);
					const syncedAt = new Date().toISOString();
					set((s) => ({
						maps: s.maps.map((m) => m.id === normalized.id ? { ...m, lastSyncedAt: syncedAt } : m),
						serverSyncById: { ...s.serverSyncById, [normalized.id]: { status: 'ready', lastSyncAt: syncedAt } },
					}));
				})
				.catch((err) => {
					console.error('[3Maps] Failed to persist map (add)', err);
					set((s) => ({
						serverSyncById: {
							...s.serverSyncById,
							[normalized.id]: { status: 'error', error: String(err?.message ?? err) },
						},
					}));
				});
      },

      updateMap: (id, updates) => {
        set((state) => ({
          maps: state.maps.map((m) =>
            m.id === id
              ? {
                  ...m,
                  ...updates,
                  graphType: updates.graphType ?? m.graphType ?? 'mindmap',
                  updatedAt: new Date().toISOString(),
                }
              : m
          ),
        }));

        // Track which fields changed for delta sync
        const changed = pendingChanges.get(id) ?? new Set<keyof SavedMap>();
        for (const key of Object.keys(updates) as Array<keyof SavedMap>) {
          changed.add(key);
        }
        pendingChanges.set(id, changed);

        // Debounced server persistence — increased to 1000ms to reduce server calls.
        const username = getActiveUsername();
        const existing = saveTimers.get(id);
        if (existing) clearTimeout(existing);
        saveTimers.set(
          id,
          setTimeout(() => {
            const map = get().getMap(id);
            if (!map) return;

            // Build delta: only send changed fields plus required identity fields
            const changedFields = pendingChanges.get(id);
            let payload: SavedMap;
            if (changedFields && changedFields.size > 0) {
              // Always include identity + timestamp fields
              const delta: Partial<SavedMap> = {
                id: map.id,
                updatedAt: map.updatedAt,
              };
              for (const field of changedFields) {
                (delta as unknown as Record<string, unknown>)[field] =
                  (map as unknown as Record<string, unknown>)[field];
              }
              // Merge delta onto the full map so server always has complete data
              payload = normalizeSavedMap({ ...map, ...delta });
            } else {
              payload = normalizeSavedMap(map);
            }

					set((s) => ({
						serverSyncById: { ...s.serverSyncById, [id]: { status: 'loading', error: undefined } },
					}));
					void putUserMap(username, id, payload)
						.then(() => {
							// Clear pending changes on successful sync and record lastSyncedAt
							pendingChanges.delete(id);
							const syncedAt = new Date().toISOString();
							set((s) => ({
								maps: s.maps.map((m) => m.id === id ? { ...m, lastSyncedAt: syncedAt } : m),
								serverSyncById: { ...s.serverSyncById, [id]: { status: 'ready', lastSyncAt: syncedAt } },
							}));
						})
						.catch((err) => {
							console.error('[3Maps] Failed to persist map (update)', err);
							set((s) => ({
								serverSyncById: { ...s.serverSyncById, [id]: { status: 'error', error: String(err?.message ?? err) } },
							}));
						});
          }, 1000)
        );
      },

      deleteMap: (id) => {
        set((state) => ({ maps: state.maps.filter((m) => m.id !== id) }));
			const existing = saveTimers.get(id);
			if (existing) {
				clearTimeout(existing);
				saveTimers.delete(id);
			}
			pendingChanges.delete(id);
        const username = getActiveUsername();
			set((s) => ({
				serverSyncById: { ...s.serverSyncById, [id]: { status: 'loading', error: undefined } },
			}));
			void deleteUserMap(username, id)
				.then(() => {
					set((s) => {
						const { [id]: _removed, ...rest } = s.serverSyncById;
						return { serverSyncById: rest };
					});
				})
				.catch((err) => {
					console.error('[3Maps] Failed to delete map on server', err);
					set((s) => ({
						serverSyncById: { ...s.serverSyncById, [id]: { status: 'error', error: String(err?.message ?? err) } },
					}));
				});
      },

      getMap: (id) => get().maps.find((m) => m.id === id),

      addTag: (mapId, tag) => {
        const map = get().getMap(mapId);
        if (!map) return;
        const normalizedTag = tag.trim().toLowerCase();
        if (!normalizedTag || map.tags.includes(normalizedTag)) return;
        get().updateMap(mapId, { tags: [...map.tags, normalizedTag] });
      },

      removeTag: (mapId, tag) => {
        const map = get().getMap(mapId);
        if (!map) return;
        get().updateMap(mapId, { tags: map.tags.filter((t) => t !== tag) });
      },

      getAllTags: () => {
        const allTags = get().maps.flatMap((m) => m.tags);
        return [...new Set(allTags)].sort();
      },

      setGenerationStatus: (status) =>
        set((state) => ({ generation: { ...state.generation, status } })),

      setGenerationProgress: (progress, currentStep) =>
        set((state) => ({ generation: { ...state.generation, progress, currentStep } })),

      setGenerationError: (error) =>
        set((state) => ({
          generation: { ...state.generation, status: 'error', error },
        })),

      setCurrentMapId: (id) =>
        set((state) => ({
          generation: { ...state.generation, currentMapId: id },
        })),

      resetGeneration: () => set({ generation: initialGeneration }),

      syncAllPending: async () => {
        if (pendingChanges.size === 0) return;
        const username = getActiveUsername();
        const ids = Array.from(pendingChanges.keys());
        for (const id of ids) {
          const map = get().getMap(id);
          if (!map) {
            pendingChanges.delete(id);
            continue;
          }
          // Cancel any pending debounce timer for this map
          const timer = saveTimers.get(id);
          if (timer) {
            clearTimeout(timer);
            saveTimers.delete(id);
          }
          set((s) => ({
            serverSyncById: { ...s.serverSyncById, [id]: { status: 'loading', error: undefined } },
          }));
          try {
            await putUserMap(username, id, normalizeSavedMap(map));
            pendingChanges.delete(id);
            const syncedAt = new Date().toISOString();
            set((s) => ({
              maps: s.maps.map((m) => m.id === id ? { ...m, lastSyncedAt: syncedAt } : m),
              serverSyncById: { ...s.serverSyncById, [id]: { status: 'ready', lastSyncAt: syncedAt } },
            }));
          } catch (err) {
            console.error('[3Maps] syncAllPending: failed to sync map', id, err);
            set((s) => ({
              serverSyncById: { ...s.serverSyncById, [id]: { status: 'error', error: String((err as Error)?.message ?? err) } },
            }));
          }
        }
      },
    }),
    {
      name: 'mindmap-maps',
      storage: createJSONStorage(() => idbStateStorage),
      partialize: (state) => ({ maps: state.maps }),
    }
  )
);
