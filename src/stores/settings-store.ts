import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SettingsState, LLMProvider, ThemeMode } from '@/types/settings';
import { DEFAULT_SETTINGS } from '@/lib/constants';
import { encryptValue, decryptValue } from '@/lib/crypto';

interface SettingsStore extends SettingsState {
  setUsername: (username: string) => void;
  setOpenrouterApiKey: (key: string) => Promise<void>;
  setOpenaiApiKey: (key: string) => Promise<void>;
  setReplicateApiKey: (key: string) => Promise<void>;
  setProvider: (provider: LLMProvider) => void;
  setSelectedModel: (model: string) => void;
  setTheme: (theme: ThemeMode) => void;
  setGenerateImages: (value: boolean) => void;
  getActiveApiKey: () => Promise<string>;
  hasApiKey: () => boolean;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      username: DEFAULT_SETTINGS.username,
      openrouterApiKey: '',
      openaiApiKey: '',
      replicateApiKey: '',
      provider: DEFAULT_SETTINGS.provider,
      selectedModel: DEFAULT_SETTINGS.selectedModel,
      theme: DEFAULT_SETTINGS.theme,
      generateImages: DEFAULT_SETTINGS.generateImages,
      language: DEFAULT_SETTINGS.language,

      setUsername: (username) => set({ username }),

      setOpenrouterApiKey: async (key) => {
        const encrypted = await encryptValue(key);
        set({ openrouterApiKey: encrypted });
      },

      setOpenaiApiKey: async (key) => {
        const encrypted = await encryptValue(key);
        set({ openaiApiKey: encrypted });
      },

      setReplicateApiKey: async (key) => {
        const encrypted = await encryptValue(key);
        set({ replicateApiKey: encrypted });
      },

      setProvider: (provider) => set({ provider }),
      setSelectedModel: (model) => set({ selectedModel: model }),
      setTheme: (theme) => set({ theme }),
      setGenerateImages: (value) => set({ generateImages: value }),

      getActiveApiKey: async () => {
        const { provider, openrouterApiKey, openaiApiKey } = get();
        const raw = provider === 'openrouter' ? openrouterApiKey : openaiApiKey;
        return decryptValue(raw);
      },

      hasApiKey: () => {
        const { provider, openrouterApiKey, openaiApiKey } = get();
        return provider === 'openrouter'
          ? openrouterApiKey.trim().length > 0
          : openaiApiKey.trim().length > 0;
      },
    }),
    { name: 'mindmap-settings' }
  )
);
