/**
 * API para extração de conteúdo web (colar URL).
 * Chama /api/web/extract no servidor.
 */

import { useAuthStore } from '@/stores/auth-store';

export interface WebExtractResult {
  url: string;
  finalUrl: string;
  title: string;
  siteName: string;
  byline?: string;
  excerpt?: string;
  text: string;
  contentType: string;
  truncated: boolean;
}

export interface WebExtractOptions {
  url: string;
  mode?: 'readability';
  maxChars?: number;
}

export async function extractWebContent(opts: WebExtractOptions): Promise<WebExtractResult> {
  const token = useAuthStore.getState().token;
  if (!token) {
    throw new Error('Login obrigatório para extrair conteúdo de links.');
  }

  const res = await fetch('/api/web/extract', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      url: opts.url.trim(),
      mode: opts.mode ?? 'readability',
      maxChars: opts.maxChars ?? 25000,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof data?.error === 'string' ? data.error : `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }

  return data as WebExtractResult;
}
