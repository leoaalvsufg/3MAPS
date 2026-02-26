import { callLLM, callLLMStream } from '@/services/llm/client';
import { callServerLlm, callServerLlmStream } from '@/services/llm/llmProxyClient';
import type { RouteLLMActivity } from '@/services/llm/routeLLM';
import { getRouteCandidateOptions, type RouteLLMOptions } from '@/services/llm/routeLLM';

type Message = { role: 'system' | 'user' | 'assistant'; content: string };

type CallOptions = {
  temperature?: number;
  maxTokens?: number;
  skipCache?: boolean;
  deepMode?: boolean;
};

function useServerProxy(candidate: RouteLLMOptions): boolean {
  return candidate.apiKey === undefined;
}

function shouldFallback(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err).toLowerCase();
  return (
    msg.includes('429')
    || msg.includes('401')
    || msg.includes('missing authentication')
    || msg.includes('invalid api key')
    || msg.includes('401')
    || msg.includes('missing authentication')
    || msg.includes('invalid api key')
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

function sanitizeAuthError(err: unknown): string {
  const msg = String(err instanceof Error ? err.message : String(err));
  if (msg.includes('401') && (msg.toLowerCase().includes('missing authentication') || msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('authentication'))) {
    return 'Chave de API inválida ou não configurada. Verifique as chaves LLM no painel administrativo (Admin > Configurações > LLM) e confirme que a chave está correta e ativa.';
  }
  return msg;
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
          deepMode: options.deepMode,
        });
      }
      return await callLLM(messages, { ...candidate, ...options });
    } catch (err) {
      lastError = err;
      const hasNext = i < candidates.length - 1;
      if (!hasNext || !shouldFallback(err)) break;
    }
  }

  const finalMsg = sanitizeAuthError(lastError);
  throw new Error(finalMsg);
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
      return await callLLMStream(messages, { ...candidate, ...options }, onChunk);
    } catch (err) {
      lastError = err;
      const hasNext = i < candidates.length - 1;
      if (!hasNext || !shouldFallback(err)) break;
    }
  }

  const finalMsg = sanitizeAuthError(lastError);
  throw new Error(finalMsg);
}
