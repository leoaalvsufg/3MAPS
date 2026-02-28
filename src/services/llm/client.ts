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

export type MultimodalPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { fileData: { fileUri: string; mimeType: string } };

export interface CallGeminiMultimodalOptions {
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

/** Chama Gemini com parts multimodais (texto, imagem base64, fileUri para YouTube). */
export async function callGeminiMultimodal(
  parts: MultimodalPart[],
  options: CallGeminiMultimodalOptions
): Promise<string> {
  const { apiKey, model, temperature = 0.3, maxTokens = 4096 } = options;
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  };

  const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
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
  return text;
}

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
  const cleaned = text.trim();

  function tryParse(input: string): T | null {
    try {
      return JSON.parse(input) as T;
    } catch {
      return null;
    }
  }

  function extractBalancedJson(input: string): string | null {
    const startObj = input.indexOf('{');
    const startArr = input.indexOf('[');
    let start = -1;
    if (startObj >= 0 && (startArr < 0 || startObj < startArr)) start = startObj;
    else if (startArr >= 0) start = startArr;
    if (start < 0) return null;

    const stack: string[] = [];
    let inString = false;
    let escaped = false;

    for (let i = start; i < input.length; i += 1) {
      const ch = input[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === '{') stack.push('}');
      else if (ch === '[') stack.push(']');
      else if ((ch === '}' || ch === ']') && stack.length > 0) {
        const expected = stack[stack.length - 1];
        if (ch === expected) {
          stack.pop();
          if (stack.length === 0) return input.slice(start, i + 1);
        }
      }
    }

    // JSON incompleto (ex.: resposta truncada): tenta fechar estrutura automaticamente.
    if (stack.length > 0) {
      return input.slice(start) + stack.reverse().join('');
    }
    return null;
  }

  function repairTruncatedJson(input: string): string | null {
    const startObj = input.indexOf('{');
    const startArr = input.indexOf('[');
    let start = -1;
    if (startObj >= 0 && (startArr < 0 || startObj < startArr)) start = startObj;
    else if (startArr >= 0) start = startArr;
    if (start < 0) return null;

    let fragment = input.slice(start);

    // Remove trailing incomplete key-value that ends with just a key or partial value
    fragment = fragment.replace(/,\s*"[^"]*"\s*:\s*"?[^"{}[\]]*$/s, '');

    // If we're inside an open string, close it
    let inStr = false;
    let esc = false;
    for (let i = 0; i < fragment.length; i += 1) {
      const ch = fragment[i];
      if (inStr) {
        if (esc) { esc = false; }
        else if (ch === '\\') { esc = true; }
        else if (ch === '"') { inStr = false; }
      } else if (ch === '"') {
        inStr = true;
      }
    }
    if (inStr) {
      fragment += '"';
    }

    // Remove trailing comma if present (after closing the string)
    fragment = fragment.replace(/,\s*$/, '');

    // Now close remaining brackets/braces
    const stack2: string[] = [];
    let inStr2 = false;
    let esc2 = false;
    for (let i = 0; i < fragment.length; i += 1) {
      const ch = fragment[i];
      if (inStr2) {
        if (esc2) { esc2 = false; }
        else if (ch === '\\') { esc2 = true; }
        else if (ch === '"') { inStr2 = false; }
        continue;
      }
      if (ch === '"') { inStr2 = true; continue; }
      if (ch === '{') stack2.push('}');
      else if (ch === '[') stack2.push(']');
      else if ((ch === '}' || ch === ']') && stack2.length > 0) {
        if (ch === stack2[stack2.length - 1]) stack2.pop();
      }
    }
    if (stack2.length > 0) {
      fragment += stack2.reverse().join('');
    }

    return fragment;
  }

  // 1) Parse direto
  const direct = tryParse(cleaned);
  if (direct !== null) return direct;

  // 2) Code block fechado
  const codeBlockMatch = cleaned.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch?.[1]) {
    const fromCodeBlock = tryParse(codeBlockMatch[1].trim());
    if (fromCodeBlock !== null) return fromCodeBlock;
  }

  // 3) Code block sem fechamento (comum em truncamento)
  const openCodeFence = cleaned.match(/```(?:json|JSON)?\s*\n?([\s\S]*)$/);
  if (openCodeFence?.[1]) {
    const candidate = openCodeFence[1].trim();
    const parsed = tryParse(candidate);
    if (parsed !== null) return parsed;
    const balanced = extractBalancedJson(candidate);
    if (balanced) {
      const parsedBalanced = tryParse(balanced);
      if (parsedBalanced !== null) return parsedBalanced;
    }
  }

  // 4) Extrai JSON balanceado do texto livre
  const balanced = extractBalancedJson(cleaned);
  if (balanced) {
    const parsedBalanced = tryParse(balanced);
    if (parsedBalanced !== null) return parsedBalanced;
  }

  // 5) Limpeza de artefatos comuns
  const withoutComments = cleaned
    .replace(/\/\/[^\n]*/g, '')
    .replace(/,\s*([}\]])/g, '$1');
  const parsedCleaned = tryParse(withoutComments);
  if (parsedCleaned !== null) return parsedCleaned;

  // 6) Reparo agressivo de JSON truncado (fecha strings abertas + estrutura)
  const repaired = repairTruncatedJson(cleaned);
  if (repaired) {
    const parsedRepaired = tryParse(repaired);
    if (parsedRepaired !== null) return parsedRepaired;

    // Tenta também limpar trailing commas no reparado
    const repairedClean = repaired
      .replace(/,\s*([}\]])/g, '$1');
    const parsedRepairedClean = tryParse(repairedClean);
    if (parsedRepairedClean !== null) return parsedRepairedClean;
  }

  throw new Error(`Não foi possível extrair JSON válido da resposta da LLM. Resposta: ${cleaned.slice(0, 300)}...`);
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

