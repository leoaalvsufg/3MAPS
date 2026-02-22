import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { loginUser, registerUser, getCurrentUser } from '@/services/api/authApi';
import type { AuthUser } from '@/services/api/authApi';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
}

interface AuthActions {
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,

      login: async (username, password) => {
        const { token, user } = await loginUser(username, password);
        set({ token, user, isAuthenticated: true });
        // Sync username into settings store
        try {
          const { useSettingsStore } = await import('@/stores/settings-store');
          useSettingsStore.getState().setUsername(user.username);
        } catch {
          // ignore if settings store is unavailable
        }
      },

      register: async (username, password) => {
        const { token, user } = await registerUser(username, password);
        set({ token, user, isAuthenticated: true });
        // Sync username into settings store
        try {
          const { useSettingsStore } = await import('@/stores/settings-store');
          useSettingsStore.getState().setUsername(user.username);
        } catch {
          // ignore if settings store is unavailable
        }
      },

      logout: () => {
        set({ token: null, user: null, isAuthenticated: false });
      },

      checkAuth: async () => {
        const { token } = get();
        if (!token) {
          set({ isAuthenticated: false, user: null });
          return;
        }
        try {
          const { user } = await getCurrentUser(token);
          set({ user, isAuthenticated: true });
        } catch {
          // Token is invalid or expired
          set({ token: null, user: null, isAuthenticated: false });
        }
      },
    }),
    {
      name: 'mindmap-auth',
      // Only persist token and user — isAuthenticated is derived
      partialize: (state) => ({ token: state.token, user: state.user }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Restore isAuthenticated from persisted token/user
          state.isAuthenticated = !!(state.token && state.user);
        }
      },
    }
  )
);
