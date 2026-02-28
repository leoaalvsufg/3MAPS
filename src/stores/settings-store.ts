import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SettingsState, LLMProvider, ThemeMode } from '@/types/settings';
import { DEFAULT_SETTINGS, GEMINI_MODELS, OPENAI_MODELS, OPENROUTER_MODELS } from '@/lib/constants';
import { encryptValue, decryptValue } from '@/lib/crypto';
import { useLlmStatusStore } from '@/stores/llm-status-store';

interface SettingsStore extends SettingsState {
  setUsername: (username: string) => void;
  setOpenrouterApiKey: (key: string) => Promise<void>;
  setOpenaiApiKey: (key: string) => Promise<void>;
  setGeminiApiKey: (key: string) => Promise<void>;
  setReplicateApiKey: (key: string) => Promise<void>;
  setProvider: (provider: LLMProvider) => void;
  setSelectedModel: (model: string) => void;
  setTheme: (theme: ThemeMode) => void;
  setGenerateImages: (value: boolean) => void;
  setProviderModels: (provider: LLMProvider, models: string[]) => void;
  setProviderModelsFromServer?: (providerModels: Partial<Record<LLMProvider, string[]>>) => void;
  addProviderModel: (provider: LLMProvider, model: string) => void;
  removeProviderModel: (provider: LLMProvider, model: string) => void;
  getActiveApiKey: () => Promise<string>;
  /** Returns decrypted API key for a specific provider (for RouteLLM). */
  getApiKeyForProvider: (provider: LLMProvider) => Promise<string>;
  hasApiKey: () => boolean;
  /** True se ao menos um provedor LLM (OpenRouter, OpenAI ou Gemini) tiver chave configurada. */
  hasAnyApiKey: () => boolean;
  /** Whether the given provider has a key configured. */
  hasKeyForProvider: (provider: LLMProvider) => boolean;
}

function defaultProviderModels() {
  return {
    openrouter: OPENROUTER_MODELS.map((m) => m.id),
    openai: OPENAI_MODELS.map((m) => m.id),
    gemini: GEMINI_MODELS.map((m) => m.id),
  } as const;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      username: DEFAULT_SETTINGS.username,
      openrouterApiKey: '',
      openaiApiKey: '',
      geminiApiKey: '',
      replicateApiKey: '',
      provider: DEFAULT_SETTINGS.provider,
      selectedModel: DEFAULT_SETTINGS.selectedModel,
      providerModels: defaultProviderModels(),
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

      setGeminiApiKey: async (key) => {
        const encrypted = await encryptValue(key);
        set({ geminiApiKey: encrypted });
      },

      setReplicateApiKey: async (key) => {
        const encrypted = await encryptValue(key);
        set({ replicateApiKey: encrypted });
      },

      setProvider: (provider) => {
        const state = get();
        if (provider === 'gemini' && !GEMINI_MODELS.some((m) => m.id === state.selectedModel)) {
          set({ provider, selectedModel: GEMINI_MODELS[0]?.id ?? 'gemini-2.0-flash' });
        } else {
          set({ provider });
        }
      },
      setSelectedModel: (model) => set({ selectedModel: model }),
      setTheme: (theme) => set({ theme }),
      setGenerateImages: (value) => set({ generateImages: value }),

      setProviderModels: (provider, models) =>
        set((state) => ({
          providerModels: {
            ...state.providerModels,
            [provider]: Array.from(new Set(models.map((m) => m.trim()).filter(Boolean))),
          },
        })),

      setProviderModelsFromServer: (providerModels) =>
        set((state) => ({
          providerModels: {
            ...state.providerModels,
            ...providerModels,
          },
        })),

      addProviderModel: (provider, model) => {
        const trimmed = model.trim();
        if (!trimmed) return;
        set((state) => {
          const current = state.providerModels?.[provider] ?? [];
          if (current.includes(trimmed)) return state;
          return {
            providerModels: {
              ...state.providerModels,
              [provider]: [...current, trimmed],
            },
          };
        });
      },

      removeProviderModel: (provider, model) => {
        set((state) => ({
          providerModels: {
            ...state.providerModels,
            [provider]: (state.providerModels?.[provider] ?? []).filter((m) => m !== model),
          },
        }));
      },

      getActiveApiKey: async () => {
        const { provider, openrouterApiKey, openaiApiKey, geminiApiKey } = get();
        const raw = provider === 'openrouter' ? openrouterApiKey : provider === 'gemini' ? geminiApiKey : openaiApiKey;
        return decryptValue(raw);
      },

      getApiKeyForProvider: async (provider) => {
        const { openrouterApiKey, openaiApiKey, geminiApiKey } = get();
        const raw = provider === 'openrouter' ? openrouterApiKey : provider === 'gemini' ? geminiApiKey : openaiApiKey;
        return raw ? decryptValue(raw) : '';
      },

      hasApiKey: () => {
        const { provider, openrouterApiKey, openaiApiKey, geminiApiKey } = get();
        if (provider === 'openrouter') return openrouterApiKey.trim().length > 0;
        if (provider === 'gemini') return geminiApiKey.trim().length > 0;
        return openaiApiKey.trim().length > 0;
      },

      /** Chaves ficam no servidor; verifica via llm-status-store. */
      hasAnyApiKey: () => useLlmStatusStore.getState().configured === true,

      hasKeyForProvider: (provider) => {
        const { openrouterApiKey, openaiApiKey, geminiApiKey } = get();
        if (provider === 'openrouter') return openrouterApiKey.trim().length > 0;
        if (provider === 'gemini') return geminiApiKey.trim().length > 0;
        return openaiApiKey.trim().length > 0;
      },
    }),
    {
      name: 'mindmap-settings',
      migrate: (persisted: unknown) => {
        if (!persisted || typeof persisted !== 'object') return persisted as SettingsStore;
        const state = persisted as Partial<SettingsStore>;
        if (state.providerModels) return persisted as SettingsStore;
        return {
          ...state,
          providerModels: defaultProviderModels(),
        } as SettingsStore;
      },
    }
  )
);
