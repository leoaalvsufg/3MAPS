/**
 * RouteLLM — roteamento de chamadas LLM por tipo de atividade.
 * Otimiza custo/benefício escolhendo provedor e modelo conforme a tarefa
 * (ex.: tarefas leves → modelo mais barato/rápido; geração principal → modelo padrão do usuário).
 */

import type { LLMProvider } from '@/types/settings';
import { useSettingsStore } from '@/stores/settings-store';
import { useLlmStatusStore } from '@/stores/llm-status-store';
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
  apiKey?: string;  // undefined quando usa proxy do servidor
  model: string;
}

const PROVIDER_FALLBACK_ORDER: LLMProvider[] = ['openrouter', 'openai', 'gemini'];
const MAX_ROUTE_CANDIDATES = 8;

/** Atividades consideradas "leves" — prioriza modelo barato/rápido quando há múltiplas chaves. */
const LIGHT_ACTIVITIES: RouteLLMActivity[] = ['preflight', 'suggestions'];

/** Modelos econômicos por provedor (custos menores, respostas rápidas). */
const CHEAP_MODEL: Record<LLMProvider, string> = {
  openrouter: OPENROUTER_MODELS.find((m) => m.id.includes('gemini'))?.id ?? OPENROUTER_MODELS[0]?.id ?? 'google/gemini-2.0-flash-001',
  openai: OPENAI_MODELS.find((m) => m.id.includes('mini'))?.id ?? OPENAI_MODELS[0]?.id ?? 'gpt-4o-mini',
  gemini: GEMINI_MODELS.find((m) => m.id.includes('flash'))?.id ?? GEMINI_MODELS[0]?.id ?? 'gemini-2.0-flash',
};

function listProviderModels(provider: LLMProvider): string[] {
  const settings = useSettingsStore.getState();
  const configured = settings.providerModels?.[provider] ?? [];
  if (configured.length > 0) return configured;
  if (provider === 'openrouter') return OPENROUTER_MODELS.map((m) => m.id);
  if (provider === 'openai') return OPENAI_MODELS.map((m) => m.id);
  return GEMINI_MODELS.map((m) => m.id);
}

function orderedModelsForProvider(
  provider: LLMProvider,
  primaryModel: string,
  isLight: boolean
): string[] {
  const all = listProviderModels(provider);
  const cheap = CHEAP_MODEL[provider];
  const priority = isLight ? [cheap, primaryModel] : [primaryModel, cheap];
  const ordered = [...priority, ...all];
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const model of ordered) {
    if (!model || seen.has(model)) continue;
    seen.add(model);
    deduped.push(model);
  }
  return deduped;
}

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
  if (!settings.hasAnyApiKey()) return null;

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
 * Retorna candidatos ordenados para fallback em tempo de execução.
 * O primeiro item é o candidato principal para a atividade; os demais
 * são opções alternativas configuradas pelo usuário.
 */
export async function getRouteCandidateOptions(activity: RouteLLMActivity): Promise<RouteLLMOptions[]> {
  // Modo servidor: chaves configuradas pelo admin
  let llmStatus = useLlmStatusStore.getState();
  if (llmStatus.configured === null || (llmStatus.configured && llmStatus.options.length === 0)) {
    await useLlmStatusStore.getState().fetchStatus();
    await useLlmStatusStore.getState().fetchOptions();
    llmStatus = useLlmStatusStore.getState();
  }
  if (llmStatus.configured === true && llmStatus.options.length > 0) {
    return llmStatus.options.map(({ provider, model }) => ({ provider, model }));
  }

  const settings = useSettingsStore.getState();
  if (!settings.hasAnyApiKey()) return [];

  const primary = chooseProviderAndModel(activity);
  const providers = [
    primary.provider,
    ...PROVIDER_FALLBACK_ORDER.filter((p) => p !== primary.provider),
  ];

  const isLight = LIGHT_ACTIVITIES.includes(activity);
  const candidates: RouteLLMOptions[] = [];
  const seen = new Set<string>();

  for (const provider of providers) {
    if (!settings.hasKeyForProvider(provider)) continue;

    const apiKey = await settings.getApiKeyForProvider(provider);
    if (!apiKey) continue;

    const models = orderedModelsForProvider(provider, primary.model, isLight);
    for (const model of models) {
      const dedupeKey = `${provider}::${model}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      candidates.push({ provider, apiKey, model });
      if (candidates.length >= MAX_ROUTE_CANDIDATES) break;
    }
    if (candidates.length >= MAX_ROUTE_CANDIDATES) break;
  }

  if (candidates.length === 0) {
    const fallback = await getRouteOptions(activity);
    if (fallback) candidates.push(fallback);
  }

  return candidates;
}

/**
 * Versão síncrona que retorna apenas provider e model (útil quando a chave será obtida depois).
 * Para uso com getRouteOptions na maioria dos casos.
 */
export function getRouteProviderAndModel(activity: RouteLLMActivity): { provider: LLMProvider; model: string } {
  const settings = useSettingsStore.getState();
  if (!settings.hasAnyApiKey()) {
    return { provider: settings.provider, model: settings.selectedModel };
  }
  return chooseProviderAndModel(activity);
}
