/**
 * RouteLLM — roteamento de chamadas LLM por tipo de atividade.
 * Otimiza custo/benefício escolhendo provedor e modelo conforme a tarefa
 * (ex.: tarefas leves → modelo mais barato/rápido; geração principal → modelo padrão do usuário).
 */

import type { LLMProvider } from '@/types/settings';
import { useSettingsStore } from '@/stores/settings-store';
import {
  OPENROUTER_MODELS,
  OPENAI_MODELS,
  GEMINI_MODELS,
} from '@/lib/constants';

export type RouteLLMActivity =
  | 'preflight'       // clarificação / fontes (pensamento_profundo)
  | 'analysis'        // análise de conteúdo
  | 'mindmap'         // geração do mapa mental
  | 'article'         // geração do artigo
  | 'chat'            // chat no mapa
  | 'suggestions'     // sugestões de perguntas
  | 'postgen'         // pós-geração (conciso, detalhado, traduzir, regenerar)
  | 'refine_detailed'; // refinamento nó a nó

export interface RouteLLMOptions {
  provider: LLMProvider;
  apiKey: string;
  model: string;
}

/** Atividades consideradas "leves" — prioriza modelo barato/rápido quando há múltiplas chaves. */
const LIGHT_ACTIVITIES: RouteLLMActivity[] = ['preflight', 'suggestions'];

/** Modelos econômicos por provedor (custos menores, respostas rápidas). */
const CHEAP_MODEL: Record<LLMProvider, string> = {
  openrouter: OPENROUTER_MODELS.find((m) => m.id.includes('gemini'))?.id ?? OPENROUTER_MODELS[0]?.id ?? 'google/gemini-2.0-flash-001',
  openai: OPENAI_MODELS.find((m) => m.id.includes('mini'))?.id ?? OPENAI_MODELS[0]?.id ?? 'gpt-4o-mini',
  gemini: GEMINI_MODELS.find((m) => m.id.includes('flash'))?.id ?? GEMINI_MODELS[0]?.id ?? 'gemini-2.0-flash',
};

/**
 * Escolhe provedor e modelo para a atividade.
 * - Atividades leves: prefere Gemini (se tiver chave) ou OpenRouter/OpenAI com modelo barato.
 * - Demais: usa o provedor e modelo padrão do usuário.
 */
function chooseProviderAndModel(activity: RouteLLMActivity): { provider: LLMProvider; model: string } {
  const settings = useSettingsStore.getState();
  const defaultProvider = settings.provider;
  const defaultModel = settings.selectedModel;
  const hasGemini = settings.hasKeyForProvider('gemini');
  const hasOpenRouter = settings.hasKeyForProvider('openrouter');
  const hasOpenAI = settings.hasKeyForProvider('openai');

  if (!LIGHT_ACTIVITIES.includes(activity)) {
    return { provider: defaultProvider, model: defaultModel };
  }

  // Otimização custo/benefício para tarefas leves: preferir provedor com modelo barato
  if (hasGemini) {
    return { provider: 'gemini', model: CHEAP_MODEL.gemini };
  }
  if (hasOpenRouter) {
    return { provider: 'openrouter', model: CHEAP_MODEL.openrouter };
  }
  if (hasOpenAI) {
    return { provider: 'openai', model: CHEAP_MODEL.openai };
  }

  return { provider: defaultProvider, model: defaultModel };
}

/**
 * Retorna { provider, apiKey, model } para a atividade, resolvendo a chave do provedor escolhido.
 * Usar em vez de provider/selectedModel/getActiveApiKey ao chamar callLLM/callLLMStream.
 */
export async function getRouteOptions(activity: RouteLLMActivity): Promise<RouteLLMOptions | null> {
  const settings = useSettingsStore.getState();
  if (!settings.hasApiKey()) return null;

  const { provider, model } = chooseProviderAndModel(activity);
  const apiKey = await settings.getApiKeyForProvider(provider);
  if (!apiKey) {
    // Fallback: provedor escolhido sem chave (não deveria ocorrer) → usar padrão
    const fallbackKey = await settings.getActiveApiKey();
    const def = { provider: settings.provider, model: settings.selectedModel };
    return fallbackKey ? { provider: def.provider, apiKey: fallbackKey, model: def.model } : null;
  }

  return { provider, apiKey, model };
}

/**
 * Versão síncrona que retorna apenas provider e model (útil quando a chave será obtida depois).
 * Para uso com getRouteOptions na maioria dos casos.
 */
export function getRouteProviderAndModel(activity: RouteLLMActivity): { provider: LLMProvider; model: string } {
  const settings = useSettingsStore.getState();
  if (!settings.hasApiKey()) {
    return { provider: settings.provider, model: settings.selectedModel };
  }
  return chooseProviderAndModel(activity);
}
