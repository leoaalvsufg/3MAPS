/**
 * server/webExtract.js
 *
 * Extrai texto limpo de páginas web usando Mozilla Readability.
 * Usado pelo fluxo "colar URL" no campo de busca.
 * Inclui proteções SSRF, limites de tamanho e timeout.
 */

import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import dns from 'node:dns/promises';

const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2MB
const DEFAULT_MAX_CHARS = 25_000;
const USER_AGENT = '3maps-bot/1.0';

// Hostnames bloqueados (SSRF)
const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
]);

// Verifica se hostname deve ser bloqueado
function isBlockedHostname(hostname) {
  if (!hostname || typeof hostname !== 'string') return true;
  const lower = hostname.toLowerCase().trim();
  if (BLOCKED_HOSTS.has(lower)) return true;
  if (lower.endsWith('.local')) return true;
  // IP literal
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(lower)) {
    const parts = lower.split('.').map(Number);
    if (parts[0] === 10) return true; // 10.0.0.0/8
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
    if (parts[0] === 192 && parts[1] === 168) return true; // 192.168.0.0/16
    if (parts[0] === 127) return true; // loopback
    if (parts[0] === 169 && parts[1] === 254) return true; // link-local
  }
  return false;
}

// Verifica se IP (string) está em range privado/loopback/link-local
function isPrivateOrLoopbackIp(ipStr) {
  if (!ipStr || typeof ipStr !== 'string') return true;
  if (ipStr === '::1') return true;
  if (ipStr.startsWith('fe80:')) return true; // IPv6 link-local
  if (ipStr.startsWith('fc') || ipStr.startsWith('fd')) return true; // IPv6 ULA
  const parts = ipStr.split('.').map(Number);
  if (parts.length !== 4) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  return false;
}

/**
 * Resolve hostname e rejeita se IP cair em range privado/loopback.
 */
async function validateHostDns(hostname) {
  try {
    const { address } = await dns.lookup(hostname, { family: 4 });
    if (isPrivateOrLoopbackIp(address)) {
      throw new Error('Host resolvido para IP privado ou loopback');
    }
  } catch (err) {
    if (err.code === 'ENOTFOUND') throw new Error('Host não encontrado');
    throw err;
  }
}

/**
 * Normaliza URL: adiciona https:// se faltar esquema.
 */
function normalizeUrl(input) {
  const s = (input ?? '').trim();
  if (!s) return null;
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  return `https://${s}`;
}

/**
 * Fetch com timeout, limite de bytes e redirect control.
 */
async function fetchWithLimits(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout ?? FETCH_TIMEOUT_MS);

  let redirectCount = 0;
  let currentUrl = url;
  let finalResponse = null;

  while (redirectCount <= (options.maxRedirects ?? MAX_REDIRECTS)) {
    const res = await fetch(currentUrl, {
      signal: controller.signal,
      redirect: 'manual',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        ...options.headers,
      },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) break;
      const nextUrl = new URL(location, currentUrl).href;
      redirectCount++;
      if (redirectCount > MAX_REDIRECTS) {
        throw new Error('Excesso de redirecionamentos');
      }
      try {
        const nextParsed = new URL(nextUrl);
        if (isBlockedHostname(nextParsed.hostname)) {
          throw new Error('Redirecionamento para host bloqueado');
        }
        await validateHostDns(nextParsed.hostname);
      } catch (e) {
        throw new Error('Redirecionamento inválido: ' + (e.message ?? 'host bloqueado'));
      }
      currentUrl = nextUrl;
      continue;
    }

    finalResponse = res;
    break;
  }

  clearTimeout(timeoutId);
  if (!finalResponse) throw new Error('Não foi possível obter resposta');

  const contentType = finalResponse.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
    throw new Error('O conteúdo não é HTML nem texto simples. Tipo: ' + contentType.slice(0, 50));
  }

  const reader = finalResponse.body.getReader();
  const chunks = [];
  let total = 0;
  const maxBytes = options.maxBytes ?? MAX_BODY_BYTES;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      reader.cancel();
      throw new Error('Página excede tamanho máximo permitido (2MB)');
    }
    chunks.push(value);
  }

  const buffer = Buffer.concat(chunks);
  return {
    html: buffer.toString('utf8'),
    finalUrl: finalResponse.url ?? currentUrl,
    contentType,
  };
}

/**
 * Extrai texto principal da página usando Readability.
 * @param {{ url: string, mode?: string, maxChars?: number }} opts
 * @returns {{ url, finalUrl, title, siteName, byline, excerpt, text, contentType, truncated }}
 */
export async function extractWebContent(opts) {
  const urlRaw = opts?.url;
  if (!urlRaw || typeof urlRaw !== 'string') {
    throw new Error('url é obrigatório');
  }

  const urlStr = normalizeUrl(urlRaw);
  if (!urlStr) throw new Error('URL inválida');

  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error('URL malformada');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Somente http e https são permitidos');
  }

  if (isBlockedHostname(parsed.hostname)) {
    throw new Error('Host bloqueado por segurança (localhost, IP privado, etc.)');
  }

  await validateHostDns(parsed.hostname);

  const maxChars = Math.min(
    Math.max(1000, Number(opts?.maxChars) || DEFAULT_MAX_CHARS),
    100_000
  );

  const { html, finalUrl, contentType } = await fetchWithLimits(urlStr, {
    timeout: FETCH_TIMEOUT_MS,
    maxBytes: MAX_BODY_BYTES,
  });

  let title = '';
  let siteName = '';
  let byline = '';
  let excerpt = '';
  let text = '';

  if (contentType.includes('text/plain')) {
    text = html.replace(/\r\n/g, '\n').trim();
    title = parsed.hostname;
  } else {
    const dom = new JSDOM(html, { url: finalUrl });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (article) {
      title = (article.title ?? '').trim() || parsed.hostname;
      siteName = (article.siteName ?? '').trim();
      byline = (article.byline ?? '').trim();
      excerpt = (article.excerpt ?? '').trim();
      text = (article.textContent ?? '').replace(/\r\n/g, '\n').trim();
    }

    if (!text) {
      const body = dom.window.document.body;
      text = body ? body.textContent.replace(/\s+/g, ' ').trim() : '';
    }
  }

  if (!text || text.length < 50) {
    throw new Error('Não foi possível extrair conteúdo significativo da página');
  }

  let truncated = false;
  if (text.length > maxChars) {
    text = text.slice(0, maxChars);
    truncated = true;
  }

  return {
    url: urlStr,
    finalUrl,
    title: title || parsed.hostname,
    siteName: siteName || parsed.hostname,
    byline,
    excerpt,
    text,
    contentType,
    truncated,
  };
}
