import { callLLM, callLLMStream, callGeminiMultimodal, type MultimodalPart } from '@/services/llm/client';
import { callServerLlm, callServerLlmStream, callServerLlmMultimodal } from '@/services/llm/llmProxyClient';
import type { RouteLLMActivity } from '@/services/llm/routeLLM';
import { getRouteCandidateOptions, type RouteLLMOptions } from '@/services/llm/routeLLM';
import { GEMINI_MULTIMODAL_MODEL } from '@/lib/constants';

type Message = { role: 'system' | 'user' | 'assistant'; content: string };

type CallOptions = {
  temperature?: number;
  maxTokens?: number;
  skipCache?: boolean;
};

function useServerProxy(candidate: RouteLLMOptions): boolean {
  return candidate.apiKey === undefined;
}

function shouldFallback(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err).toLowerCase();
  return (
    msg.includes('429')
    || msg.includes('401')
    || msg.includes('unauthorized')
    || msg.includes('missing authentication')
    || msg.includes('invalid api key')
    || msg.includes('incorrect api key')
    || msg.includes(' 404')
    || msg.includes('not_found')
    || msg.includes('model is not found')
    || msg.includes('is not supported for generatecontent')
    || msg.includes('resource_exhausted')
    || msg.includes('quota')
    || msg.includes('rate limit')
    || msg.includes('too many requests')
    || msg.includes('temporarily unavailable')
    || msg.includes('timeout')
    || msg.includes(' 502')
    || msg.includes(' 503')
    || msg.includes(' 504')
  );
}

export async function callRoutedLLM(
  activity: RouteLLMActivity,
  messages: Message[],
  options: CallOptions = {}
): Promise<string> {
  const candidates = await getRouteCandidateOptions(activity);
  if (candidates.length === 0) {
    throw new Error('Nenhum provedor LLM configurado.');
  }

  let lastError: unknown = null;
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    try {
      if (useServerProxy(candidate)) {
        return await callServerLlm(messages, {
          provider: candidate.provider,
          model: candidate.model,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
        });
      }
      if (!candidate.apiKey) throw new Error('API key required for client-side LLM');
      return await callLLM(messages, { ...candidate, ...options } as Parameters<typeof callLLM>[1]);
    } catch (err) {
      lastError = err;
      const hasNext = i < candidates.length - 1;
      if (!hasNext || !shouldFallback(err)) break;
    }
  }

  throw (lastError instanceof Error ? lastError : new Error(String(lastError ?? 'Falha desconhecida da LLM')));
}

export async function callRoutedLLMStream(
  activity: RouteLLMActivity,
  messages: Message[],
  onChunk: (chunk: string) => void,
  options: CallOptions = {}
): Promise<string> {
  const candidates = await getRouteCandidateOptions(activity);
  if (candidates.length === 0) {
    throw new Error('Nenhum provedor LLM configurado.');
  }

  let lastError: unknown = null;
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    try {
      if (useServerProxy(candidate)) {
        return await callServerLlmStream(messages, {
          provider: candidate.provider,
          model: candidate.model,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
        }, onChunk);
      }
      if (!candidate.apiKey) throw new Error('API key required for client-side LLM');
      return await callLLMStream(messages, { ...candidate, ...options } as Parameters<typeof callLLMStream>[1], onChunk);
    } catch (err) {
      lastError = err;
      const hasNext = i < candidates.length - 1;
      if (!hasNext || !shouldFallback(err)) break;
    }
  }

  throw (lastError instanceof Error ? lastError : new Error(String(lastError ?? 'Falha desconhecida da LLM')));
}

/** Chama o modelo multimodal (YouTube/imagem). Usa sempre Gemini 2.5 Flash via proxy ou chave local. */
export async function callRoutedMultimodal(
  parts: MultimodalPart[],
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  const { fetchLlmStatus, fetchLlmOptions } = await import('@/services/llm/llmProxyClient');
  const useSettingsStore = (await import('@/stores/settings-store')).useSettingsStore;
  const model = GEMINI_MULTIMODAL_MODEL;

  try {
    const status = await fetchLlmStatus();
    if (status.configured) {
      const opts = await fetchLlmOptions();
      const hasGemini = opts.options.some((o: { provider: string }) => o.provider === 'gemini');
      if (hasGemini) {
        return await callServerLlmMultimodal(parts, {
          model,
          temperature: options.temperature ?? 0.3,
          maxTokens: options.maxTokens ?? 4096,
        });
      }
    }
  } catch {
    // fallback to local
  }

  const apiKey = await useSettingsStore.getState().getApiKeyForProvider('gemini');
  if (apiKey) {
    return await callGeminiMultimodal(parts, {
      apiKey,
      model,
      temperature: options.temperature ?? 0.3,
      maxTokens: options.maxTokens ?? 4096,
    });
  }

  throw new Error(
    'Para usar YouTube ou imagem, configure a chave Gemini nas Configurações ou use o servidor com Gemini configurado.'
  );
}
