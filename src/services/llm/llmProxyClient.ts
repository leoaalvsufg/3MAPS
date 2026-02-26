/**
 * Client para chamadas LLM via servidor (proxy).
 * As chaves ficam no servidor; o usuário não configura nada.
 */

import type { LLMProvider } from '@/types/settings';

interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmProxyOptions {
  provider: LLMProvider;
  model: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  deepMode?: boolean;
}

function getAuthToken(): string {
  try {
    const raw = localStorage.getItem('mindmap-auth');
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed?.state?.token ?? '';
    }
  } catch {
    // ignore
  }
  return '';
}

/**
 * Verifica se o servidor tem chaves LLM configuradas.
 */
export async function fetchLlmStatus(): Promise<{ configured: boolean }> {
  const res = await fetch('/api/llm/status');
  if (!res.ok) return { configured: false };
  const data = await res.json();
  return { configured: data.configured === true };
}

/**
 * Retorna as opções de provedor/modelo disponíveis no servidor.
 */
export async function fetchLlmOptions(): Promise<Array<{ provider: LLMProvider; model: string }>> {
  const res = await fetch('/api/llm/options');
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.options) ? data.options : [];
}

/**
 * Chama o proxy LLM do servidor (non-streaming).
 */
export async function callServerLlm(
  messages: LLMMessage[],
  options: LlmProxyOptions
): Promise<string> {
  const token = getAuthToken();
  if (!token) throw new Error('Login obrigatório para gerar mapas.');

  const res = await fetch('/api/llm/complete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      provider: options.provider,
      model: options.model,
      messages,
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens ?? 4096,
      stream: false,
      deepMode: options.deepMode ?? false,
    }),
  });

  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      !res.ok
        ? `Erro do servidor ${res.status}: ${text.slice(0, 200)}`
        : 'Resposta inválida do servidor (JSON malformado)'
    );
  }
  if (!res.ok) {
    throw new Error((data.error as string) ?? `Erro do servidor ${res.status}`);
  }
  return (data.content as string) ?? '';
}

/**
 * Chama o proxy LLM do servidor (streaming).
 */
export async function callServerLlmStream(
  messages: LLMMessage[],
  options: LlmProxyOptions,
  onChunk: (chunk: string) => void
): Promise<string> {
  const token = getAuthToken();
  if (!token) throw new Error('Login obrigatório para gerar mapas.');

  const res = await fetch('/api/llm/complete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      provider: options.provider,
      model: options.model,
      messages,
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens ?? 4096,
      stream: true,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Erro do servidor ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        const chunk = parsed.content ?? '';
        if (chunk) {
          fullContent += chunk;
          onChunk(chunk);
        }
      } catch {
        // ignore
      }
    }
  }

  return fullContent;
}
