/**
 * Store para status das chaves LLM no servidor.
 * Apenas o admin configura; usuários usam as chaves do servidor.
 */

import { create } from 'zustand';
import { fetchLlmStatus, fetchLlmOptions } from '@/services/llm/llmProxyClient';
import type { LLMProvider } from '@/types/settings';

interface LlmStatusState {
  /** null = não buscado ainda, true/false = resultado */
  configured: boolean | null;
  /** Opções { provider, model } disponíveis no servidor */
  options: Array<{ provider: LLMProvider; model: string }>;
  /** Modelos habilitados por provedor (do admin) */
  providerModels: Partial<Record<LLMProvider, string[]>>;
  fetchStatus: () => Promise<void>;
  fetchOptions: () => Promise<void>;
}

export const useLlmStatusStore = create<LlmStatusState>((set) => ({
  configured: null,
  options: [],
  providerModels: {},

  fetchStatus: async () => {
    try {
      const { configured } = await fetchLlmStatus();
      set({ configured });
    } catch {
      set({ configured: false });
    }
  },

  fetchOptions: async () => {
    try {
      const { options, providerModels } = await fetchLlmOptions();
      set({ options, providerModels: providerModels ?? {} });
      if (providerModels) {
        const { useSettingsStore } = await import('@/stores/settings-store');
        useSettingsStore.getState().setProviderModelsFromServer?.(providerModels);
      }
    } catch {
      set({ options: [], providerModels: {} });
    }
  },
}));
