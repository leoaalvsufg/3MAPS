/**
 * server/llmProxy.js
 *
 * Proxy LLM (OpenRouter, OpenAI, Gemini) e Replicate via servidor.
 * As chaves são lidas de admin_settings — apenas o admin as configura.
 * Usuários acessam de qualquer dispositivo sem configurar nada.
 */

import { getAdminSetting } from './activity.js';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const OPENAI_BASE = 'https://api.openai.com/v1';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const REPLICATE_BASE = 'https://api.replicate.com';

function buildGeminiBody(messages, temperature, maxTokens) {
  const systemParts = [];
  const contents = [];
  for (const m of messages) {
    if (m.role === 'system') {
      systemParts.push(m.content);
    } else {
      const role = m.role === 'assistant' ? 'model' : 'user';
      contents.push({ role, parts: [{ text: m.content }] });
    }
  }
  const body = {
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

const DEFAULT_MODELS = {
  openrouter: 'google/gemini-2.0-flash-lite-001',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
};

const GEMINI_MULTIMODAL_MODEL = 'gemini-2.5-flash';

function getKey(provider) {
  const keys = {
    openrouter: 'openrouter_api_key',
    openai: 'openai_api_key',
    gemini: 'gemini_api_key',
  };
  const key = getAdminSetting(keys[provider]);
  return key && typeof key === 'string' && key.trim().length > 0 ? key.trim() : null;
}

function isProviderEnabled(provider) {
  const key = `provider_enabled_${provider}`;
  const raw = getAdminSetting(key, true);
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') {
    const v = raw.trim().toLowerCase();
    if (v === 'false' || v === '0' || v === 'off' || v === 'no') return false;
    if (v === 'true' || v === '1' || v === 'on' || v === 'yes') return true;
  }
  return true;
}

const DEFAULT_MODEL_IDS = {
  openrouter: ['google/gemini-2.0-flash-001', 'google/gemini-2.0-flash-lite-001', 'anthropic/claude-3-haiku'],
  openai: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4o'],
  gemini: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'],
};

function getProviderEnabledModels(provider) {
  const key = `${provider}_enabled_models`;
  const raw = getAdminSetting(key);
  if (Array.isArray(raw) && raw.length > 0) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch { /* ignore */ }
  }
  return DEFAULT_MODEL_IDS[provider] ?? [DEFAULT_MODELS[provider]];
}

/**
 * Retorna lista de { provider, model } com chaves configuradas (para fallback).
 * Inclui todos os modelos habilitados por provedor.
 */
export function getAvailableLlmOptions() {
  const options = [];
  const order = ['openrouter', 'openai', 'gemini'];
  for (const provider of order) {
    if (isProviderEnabled(provider) && getKey(provider)) {
      const models = getProviderEnabledModels(provider);
      for (const model of models) {
        if (model && typeof model === 'string') options.push({ provider, model });
      }
    }
  }
  return options;
}

/**
 * Retorna { options, providerModels } para o frontend.
 */
export function getLlmOptionsWithModels() {
  const options = getAvailableLlmOptions();
  const providerModels = {
    openrouter: getProviderEnabledModels('openrouter'),
    openai: getProviderEnabledModels('openai'),
    gemini: getProviderEnabledModels('gemini'),
  };
  return { options, providerModels };
}

/**
 * Verifica se há ao menos uma chave LLM configurada.
 */
export function hasAnyLlmKey() {
  return getAvailableLlmOptions().length > 0;
}

/**
 * Retorna o texto da resposta da LLM (completion não-streaming).
 */
export async function proxyLlmComplete({ provider, model, messages, temperature = 0.7, maxTokens = 4096 }) {
  let apiKey;
  if (provider === 'openrouter') {
    apiKey = getAdminSetting('openrouter_api_key');
  } else if (provider === 'openai') {
    apiKey = getAdminSetting('openai_api_key');
  } else if (provider === 'gemini') {
    apiKey = getAdminSetting('gemini_api_key');
  }
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new Error(`Chave de API do provedor ${provider} não configurada. Configure no painel administrativo.`);
  }

  if (provider === 'gemini') {
    const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const body = buildGeminiBody(messages, temperature, maxTokens);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${err}`);
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text == null) throw new Error('Resposta vazia da API Gemini');
    return text;
  }

  const baseUrl = provider === 'openrouter' ? OPENROUTER_BASE : OPENAI_BASE;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://3maps.app';
    headers['X-Title'] = '3Maps';
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Resposta vazia da API LLM');
  return content;
}

/**
 * Proxy LLM multimodal (Gemini only). Aceita parts: text, inlineData, fileData.
 */
export async function proxyLlmMultimodal({ model, parts, temperature = 0.3, maxTokens = 4096 }) {
  const apiKey = getKey('gemini');
  if (!apiKey) {
    throw new Error('Chave da API Gemini não configurada. Configure no painel administrativo.');
  }

  const effectiveModel = model || GEMINI_MULTIMODAL_MODEL;
  const url = `${GEMINI_BASE}/models/${effectiveModel}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (text == null) throw new Error('Resposta vazia da API Gemini');
  return text;
}

/**
 * Proxy LLM streaming. Retorna um async iterável de chunks de texto.
 */
export async function* proxyLlmStream({ provider, model, messages, temperature = 0.7, maxTokens = 4096 }) {
  let apiKey;
  if (provider === 'openrouter') {
    apiKey = getAdminSetting('openrouter_api_key');
  } else if (provider === 'openai') {
    apiKey = getAdminSetting('openai_api_key');
  } else if (provider === 'gemini') {
    apiKey = getAdminSetting('gemini_api_key');
  }
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new Error(`Chave de API do provedor ${provider} não configurada. Configure no painel administrativo.`);
  }

  if (provider === 'gemini') {
    const url = `${GEMINI_BASE}/models/${model}:streamGenerateContent?key=${encodeURIComponent(apiKey)}&alt=json`;
    const body = buildGeminiBody(messages, temperature, maxTokens);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${err}`);
    }
    const reader = res.body;
    if (!reader) throw new Error('No response body');
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of reader) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
          if (text) yield text;
        } catch {
          // ignore
        }
      }
    }
    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer.trim());
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        if (text) yield text;
      } catch {
        // ignore
      }
    }
    return;
  }

  const baseUrl = provider === 'openrouter' ? OPENROUTER_BASE : OPENAI_BASE;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://3maps.app';
    headers['X-Title'] = '3Maps';
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
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

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM API error ${res.status}: ${err}`);
  }

  const reader = res.body;
  if (!reader) throw new Error('No response body');
  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of reader) {
    buffer += decoder.decode(chunk, { stream: true });
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
        if (delta) yield delta;
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
        if (delta) yield delta;
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Consulta créditos/saldo dos provedores LLM configurados.
 * - OpenRouter: GET /api/v1/credits (retorna total_credits e total_usage)
 * - OpenAI: não disponibiliza endpoint direto de saldo
 * - Gemini: API gratuita (free tier) não tem endpoint de saldo
 */
export async function getLlmCredits() {
  const result = {
    openrouter: null,
    openai: null,
    gemini: null,
  };

  const orKey = getKey('openrouter');
  if (orKey) {
    try {
      const res = await fetch(`${OPENROUTER_BASE}/credits`, {
        headers: { Authorization: `Bearer ${orKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        result.openrouter = {
          totalCredits: data.data?.total_credits ?? 0,
          totalUsage: data.data?.total_usage ?? 0,
          remaining: (data.data?.total_credits ?? 0) - (data.data?.total_usage ?? 0),
        };
      }
    } catch {
      // ignore
    }
  }

  const oaiKey = getKey('openai');
  if (oaiKey) {
    result.openai = { status: 'configured', note: 'OpenAI não fornece endpoint de saldo via API. Consulte platform.openai.com/account/billing.' };
  }

  const gemKey = getKey('gemini');
  if (gemKey) {
    result.gemini = { status: 'configured', note: 'Gemini free tier sem endpoint de saldo. Consulte ai.google.dev/rate-limit.' };
  }

  return result;
}

/**
 * Prompt para pré-análise de vídeo (usado no servidor; espelha getVideoPreAnalysisPrompt do frontend).
 */
function getVideoPreAnalysisPromptText(userPrompt) {
  const extra = (userPrompt ?? '').trim();
  return `Você é um especialista em análise de conteúdo de vídeo.

TAREFA: Analise o vídeo e extraia:
1) Tema central do vídeo
2) Tópicos e subtópicos apresentados (em ordem)
3) Argumentos e evidências utilizados
4) Conclusões ou pontos-chave
5) Contexto (quem apresenta, estilo, público-alvo)

${extra ? `INSTRUÇÕES DO USUÁRIO:\n${extra}\n` : ''}

Retorne APENAS JSON válido:
{
  "central_theme": "string",
  "topics": [{ "title": "string", "arguments": ["string"], "timestamp_hint": "string" }],
  "key_points": ["string"],
  "context": "string",
  "suggested_query": "string"
}`;
}

/**
 * Upload de vídeo para Gemini File API + pré-análise.
 * 1) Upload para Gemini File API (POST files.upload)
 * 2) Polling até file.state === 'ACTIVE'
 * 3) Chamada generateContent com fileData + prompt de pré-análise
 * 4) Retorna { fileUri, mimeType, preAnalysis }
 * @param {Buffer} fileBuffer - conteúdo binário do vídeo
 * @param {string} mimeType - ex: video/mp4, video/webm
 * @param {string} [userPrompt] - prompt opcional do usuário
 * @returns {Promise<{ fileUri: string; mimeType: string; preAnalysis: string }>}
 */
export async function proxyVideoUploadAndAnalyze(fileBuffer, mimeType, userPrompt = '') {
  const apiKey = getKey('gemini');
  if (!apiKey) {
    throw new Error('Chave da API Gemini não configurada. Configure no painel administrativo.');
  }

  const displayName = `video-${Date.now()}.${mimeType.includes('webm') ? 'webm' : 'mp4'}`;
  const boundary = `----FormBoundary${Date.now()}${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({
    file: { display_name: displayName },
  });

  const bodyParts = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    fileBuffer,
    `\r\n--${boundary}--\r\n`,
  ];

  const preamble = Buffer.from(bodyParts[0] + bodyParts[1], 'utf8');
  const suffix = Buffer.from(bodyParts[3], 'utf8');
  const body = Buffer.concat([preamble, bodyParts[2], suffix]);

  const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=multipart&key=${encodeURIComponent(apiKey)}`;
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': String(body.length),
    },
    body,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Gemini File API upload error ${uploadRes.status}: ${errText}`);
  }

  const uploadData = await uploadRes.json();
  const fileName = uploadData.name;
  if (!fileName) {
    throw new Error('Resposta da Gemini File API sem nome do arquivo');
  }

  // Polling até state === 'ACTIVE'
  const filesUrl = `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${encodeURIComponent(apiKey)}`;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const pollRes = await fetch(filesUrl);
    if (!pollRes.ok) {
      const errText = await pollRes.text();
      throw new Error(`Gemini File API poll error ${pollRes.status}: ${errText}`);
    }
    const pollData = await pollRes.json();
    const state = pollData.state;
    if (state === 'ACTIVE') {
      const fileUri = `https://generativelanguage.googleapis.com/v1beta/${fileName}`;
      const prompt = getVideoPreAnalysisPromptText(userPrompt);

      const genUrl = `${GEMINI_BASE}/models/${GEMINI_MULTIMODAL_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const genBody = {
        contents: [
          {
            role: 'user',
            parts: [
              { fileData: { fileUri, mimeType: pollData.mimeType || mimeType } },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096,
        },
      };

      const genRes = await fetch(genUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(genBody),
      });

      if (!genRes.ok) {
        const errText = await genRes.text();
        throw new Error(`Gemini generateContent error ${genRes.status}: ${errText}`);
      }

      const genData = await genRes.json();
      const preAnalysis = genData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (preAnalysis == null) {
        throw new Error('Resposta vazia da API Gemini na análise do vídeo');
      }

      return {
        fileUri,
        mimeType: pollData.mimeType || mimeType,
        preAnalysis: String(preAnalysis).trim(),
      };
    }
    if (state === 'FAILED') {
      throw new Error('Processamento do vídeo falhou na Gemini');
    }
  }

  throw new Error('Timeout aguardando processamento do vídeo na Gemini');
}

/**
 * Gera imagem via Replicate. Retorna a URL da imagem.
 */
export async function proxyReplicateImage(theme) {
  const apiKey = getAdminSetting('replicate_api_key');
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new Error('Chave da API Replicate não configurada. Configure no painel administrativo.');
  }

  const prompt = `A beautiful, detailed illustration representing the concept of "${theme}". Digital art, vibrant colors, professional quality.`;

  const res = await fetch(`${REPLICATE_BASE}/v1/models/black-forest-labs/flux-schnell/predictions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token ${apiKey}`,
    },
    body: JSON.stringify({
      input: { prompt, width: 1024, height: 576, num_outputs: 1 },
    }),
  });

  if (!res.ok) throw new Error('Replicate API error');

  const prediction = await res.json();
  const predictionId = prediction.id;

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await fetch(`${REPLICATE_BASE}/v1/predictions/${predictionId}`, {
      headers: { Authorization: `Token ${apiKey}` },
    });
    const result = await poll.json();
    if (result.status === 'succeeded') return result.output?.[0] ?? '';
    if (result.status === 'failed') throw new Error('Image generation failed');
  }

  throw new Error('Image generation timed out');
}
