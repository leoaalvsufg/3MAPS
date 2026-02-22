import { create } from 'zustand';
import type { PlanLimits } from '@/lib/plans';
import { getUsage as apiGetUsage, checkAction as apiCheckAction } from '@/services/api/usageApi';
import type { UsageData, CheckActionResponse } from '@/services/api/usageApi';

// ---------------------------------------------------------------------------
// Usage store — fetched from server, no persistence needed
// ---------------------------------------------------------------------------

interface UsageState {
  usage: UsageData | null;
  limits: PlanLimits | null;
  loading: boolean;
}

interface UsageActions {
  fetchUsage: () => Promise<void>;
  checkAction: (
    action: string,
    opts?: { mapId?: string; format?: string }
  ) => Promise<CheckActionResponse>;
}

type UsageStore = UsageState & UsageActions;

export const useUsageStore = create<UsageStore>()((set) => ({
  usage: null,
  limits: null,
  loading: false,

  fetchUsage: async () => {
    set({ loading: true });
    try {
      // Lazily import auth store to avoid circular deps
      const { useAuthStore } = await import('@/stores/auth-store');
      const token = useAuthStore.getState().token ?? '';
      const { usage, limits } = await apiGetUsage(token);
      set({ usage, limits, loading: false });
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
}));

// Auto-fetch usage when the store is first accessed if authenticated
// We do this lazily to avoid issues during SSR / module init
if (typeof window !== 'undefined') {
  // Defer to next tick so auth store has time to rehydrate from localStorage
  setTimeout(() => {
    import('@/stores/auth-store').then(({ useAuthStore }) => {
      if (useAuthStore.getState().isAuthenticated) {
        useUsageStore.getState().fetchUsage();
      }
    }).catch(() => {});
  }, 0);
}
