import { create } from 'zustand';
import type { PlanLimits } from '@/lib/plans';
import { getUsage as apiGetUsage, checkAction as apiCheckAction, consumeMapGenerationCredits as apiConsumeMapGenerationCredits } from '@/services/api/usageApi';
import type { UsageData, CheckActionResponse } from '@/services/api/usageApi';

// ---------------------------------------------------------------------------
// Usage store — fetched from server, no persistence needed
// ---------------------------------------------------------------------------

interface UsageState {
  usage: UsageData | null;
  limits: PlanLimits | null;
  extraCredits: number;
  loading: boolean;
}

interface UsageActions {
  fetchUsage: () => Promise<void>;
  checkAction: (
    action: string,
    opts?: { mapId?: string; format?: string; generationMode?: 'normal' | 'deep' }
  ) => Promise<CheckActionResponse>;
  consumeMapGenerationCredits: (
    generationMode: 'normal' | 'deep',
    requestId?: string
  ) => Promise<{ ok: boolean; consumedExtraCredits: number; remainingExtraCredits: number; ledgerEntryId?: number; idempotent?: boolean }>;
}

type UsageStore = UsageState & UsageActions;

export const useUsageStore = create<UsageStore>()((set) => ({
  usage: null,
  limits: null,
  extraCredits: 0,
  loading: false,

  fetchUsage: async () => {
    set({ loading: true });
    try {
      // Lazily import auth store to avoid circular deps
      const { useAuthStore } = await import('@/stores/auth-store');
      const token = useAuthStore.getState().token ?? '';
      const { usage, limits, extraCredits } = await apiGetUsage(token);
      set({ usage, limits, extraCredits: extraCredits ?? 0, loading: false });
    } catch {
      // Silently fail — usage data is non-critical
      set({ loading: false });
    }
  },

  checkAction: async (action, opts) => {
    try {
      const { useAuthStore } = await import('@/stores/auth-store');
      const token = useAuthStore.getState().token ?? '';
      return await apiCheckAction(token, action, opts);
    } catch {
      // On network error, allow the action (fail open)
      return { allowed: true };
    }
  },

  consumeMapGenerationCredits: async (generationMode, requestId) => {
    const { useAuthStore } = await import('@/stores/auth-store');
    const token = useAuthStore.getState().token ?? '';
    const result = await apiConsumeMapGenerationCredits(token, generationMode, requestId);
    if (typeof result.remainingExtraCredits === 'number') {
      set({ extraCredits: result.remainingExtraCredits });
    }
    return result;
  },
}));

// Auto-fetch usage when the store is first accessed if authenticated
// We do this lazily to avoid issues during SSR / module init
if (typeof window !== 'undefined') {
  const refreshIfAuthenticated = () => {
    import('@/stores/auth-store').then(({ useAuthStore }) => {
      if (useAuthStore.getState().isAuthenticated) {
        void useUsageStore.getState().fetchUsage();
      }
    }).catch(() => {});
  };

  // Defer to next tick so auth store has time to rehydrate from localStorage
  setTimeout(() => {
    refreshIfAuthenticated();
  }, 0);

  // Keep credits/limits updated when user returns to the app.
  window.addEventListener('focus', refreshIfAuthenticated);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshIfAuthenticated();
  });
}
