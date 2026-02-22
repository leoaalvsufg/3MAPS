import type { LLMProvider } from '@/types/settings';
import { generateCacheKey, getCachedResponse, setCachedResponse } from '@/lib/llmCache';

interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LLMOptions {
  provider: LLMProvider;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  /** When true, bypasses the LLM response cache. */
  skipCache?: boolean;
}

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const OPENAI_BASE = 'https://api.openai.com/v1';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function buildGeminiRequest(messages: LLMMessage[], temperature: number, maxTokens: number) {
  const systemParts: string[] = [];
  const contents: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];
  for (const m of messages) {
    if (m.role === 'system') {
      systemParts.push(m.content);
    } else {
      const role = m.role === 'assistant' ? 'model' : 'user';
      contents.push({ role, parts: [{ text: m.content }] });
    }
  }
  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  };
  if (systemParts.length > 0) {
    body.systemInstruction = { parts: [{ text: systemParts.join('\n\n') }] };
  }
  return body;
}

export async function callLLM(
  messages: LLMMessage[],
  options: LLMOptions
): Promise<string> {
  const { provider, apiKey, model, temperature = 0.7, maxTokens = 4096, skipCache = false } = options;

  const cacheKey = skipCache ? null : generateCacheKey(provider, model, messages);
  if (cacheKey !== null) {
    const cached = getCachedResponse(cacheKey);
    if (cached !== null) return cached;
  }

  if (provider === 'gemini') {
    const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const body = buildGeminiRequest(messages, temperature, maxTokens);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${error}`);
    }
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text == null) throw new Error('Resposta vazia da API Gemini');
    if (cacheKey !== null) setCachedResponse(cacheKey, text);
    return text;
  }

  const baseUrl = provider === 'openrouter' ? OPENROUTER_BASE : OPENAI_BASE;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = window.location.origin;
    headers['X-Title'] = '3Maps';
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LLM API error ${response.status}: ${error}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Resposta vazia da API LLM');
  if (cacheKey !== null) setCachedResponse(cacheKey, content);
  return content;
}

export function parseJSON<T>(text: string): T {
  let cleaned = text.trim();

  // Strategy 1: Try direct parse first (fastest path)
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // continue to other strategies
  }

  // Strategy 2: Extract from markdown code blocks (```json ... ``` or ``` ... ```)
  // Handles ```json, ```JSON, ```Json, etc.
  const codeBlockMatch = cleaned.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch?.[1]) {
    try {
      return JSON.parse(codeBlockMatch[1].trim()) as T;
    } catch {
      // continue
    }
  }

  // Strategy 3: Find the first { or [ and match to the last } or ]
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  let startIdx = -1;
  let endChar = '';

  if (firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    endChar = '}';
  } else if (firstBracket >= 0) {
    startIdx = firstBracket;
    endChar = ']';
  }

  if (startIdx >= 0) {
    const lastIdx = cleaned.lastIndexOf(endChar);
    if (lastIdx > startIdx) {
      const extracted = cleaned.slice(startIdx, lastIdx + 1);
      try {
        return JSON.parse(extracted) as T;
      } catch {
        // continue
      }
    }
  }

  // Strategy 4: Try removing common LLM artifacts (trailing commas, comments)
  const withoutComments = cleaned
    .replace(/\/\/[^\n]*/g, '')  // remove single-line comments
    .replace(/,\s*([}\]])/g, '$1');  // remove trailing commas
  try {
    return JSON.parse(withoutComments) as T;
  } catch {
    // final fallback
  }

  throw new Error(`Não foi possível extrair JSON válido da resposta da LLM. Resposta: ${cleaned.slice(0, 200)}...`);
}

export async function callLLMStream(
  messages: LLMMessage[],
  options: LLMOptions,
  onChunk: (chunk: string) => void
): Promise<string> {
  const { provider, apiKey, model, temperature = 0.7, maxTokens = 4096 } = options;

  if (provider === 'gemini') {
    const url = `${GEMINI_BASE}/models/${model}:streamGenerateContent?key=${encodeURIComponent(apiKey)}&alt=json`;
    const body = buildGeminiRequest(messages, temperature, maxTokens);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${error}`);
    }
    const reader = response.body?.getReader();
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
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
          if (text) {
            fullContent += text;
            onChunk(text);
          }
        } catch {
          // ignore non-JSON or partial lines
        }
      }
    }
    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer.trim());
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        if (text) {
          fullContent += text;
          onChunk(text);
        }
      } catch {
        // ignore
      }
    }
    return fullContent;
  }

  const baseUrl = provider === 'openrouter' ? OPENROUTER_BASE : OPENAI_BASE;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = window.location.origin;
    headers['X-Title'] = '3Maps';
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LLM API error ${response.status}: ${error}`);
  }

  const reader = response.body?.getReader();
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
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content ?? '';
        if (delta) {
          fullContent += delta;
          onChunk(delta);
        }
      } catch {
        // ignore
      }
    }
  }

  if (buffer.trim().startsWith('data: ')) {
    const data = buffer.trim().slice(6).trim();
    if (data && data !== '[DONE]') {
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content ?? '';
        if (delta) {
          fullContent += delta;
          onChunk(delta);
        }
      } catch {
        // ignore
      }
    }
  }

  return fullContent;
}

