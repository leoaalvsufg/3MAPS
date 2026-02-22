/**
 * server/academicSearch.js
 *
 * Proxy para a API do Semantic Scholar.
 * Busca papers acadêmicos reais com título, autores, ano, citações, DOI e abstract.
 * API gratuita — sem necessidade de chave.
 * Docs: https://api.semanticscholar.org/
 */

const S2_BASE = 'https://api.semanticscholar.org/graph/v1';
const FIELDS = 'title,authors,year,citationCount,abstract,externalIds,url,publicationTypes,journal';
const MAX_RESULTS = 20;

/**
 * Busca papers no Semantic Scholar por query textual.
 * @param {string} query
 * @param {{ limit?: number, yearFrom?: number }} opts
 * @returns {Promise<Array<{
 *   title: string,
 *   authors: string[],
 *   year: number|null,
 *   citationCount: number,
 *   abstract: string|null,
 *   doi: string|null,
 *   url: string|null,
 *   journal: string|null,
 *   type: string
 * }>>}
 */
export async function searchAcademicPapers(query, opts = {}) {
  const limit = Math.min(opts.limit ?? MAX_RESULTS, 100);
  const params = new URLSearchParams({
    query,
    limit: String(limit),
    fields: FIELDS,
  });
  if (opts.yearFrom) {
    params.set('year', `${opts.yearFrom}-`);
  }

  const url = `${S2_BASE}/paper/search?${params}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': '3Maps/1.0 (academic-search)' },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Semantic Scholar API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const papers = Array.isArray(data.data) ? data.data : [];

  return papers.map((p) => ({
    title: p.title ?? '',
    authors: (p.authors ?? []).map((a) => a.name).filter(Boolean),
    year: p.year ?? null,
    citationCount: p.citationCount ?? 0,
    abstract: p.abstract ?? null,
    doi: p.externalIds?.DOI ?? null,
    url: p.url ?? (p.externalIds?.DOI ? `https://doi.org/${p.externalIds.DOI}` : null),
    journal: p.journal?.name ?? null,
    type: mapPublicationType(p.publicationTypes),
  }));
}

function mapPublicationType(types) {
  if (!Array.isArray(types) || types.length === 0) return 'paper';
  const t = types[0].toLowerCase();
  if (t.includes('review')) return 'paper';
  if (t.includes('journal')) return 'article';
  if (t.includes('conference')) return 'paper';
  if (t.includes('book')) return 'book';
  return 'paper';
}

/**
 * Formata papers para inserção como contexto no prompt da LLM.
 * @param {Awaited<ReturnType<typeof searchAcademicPapers>>} papers
 * @returns {string}
 */
export function formatPapersForPrompt(papers) {
  if (!papers || papers.length === 0) return '';
  return papers
    .slice(0, 15)
    .map((p, i) => {
      const authors = p.authors.slice(0, 3).join(', ') + (p.authors.length > 3 ? ' et al.' : '');
      const cite = `[${i + 1}] ${authors} (${p.year ?? 's.d.'}). "${p.title}".`;
      const journal = p.journal ? ` ${p.journal}.` : '';
      const doi = p.doi ? ` DOI: ${p.doi}` : '';
      const citations = p.citationCount > 0 ? ` [${p.citationCount} citações]` : '';
      const abs = p.abstract ? `\n    Resumo: ${p.abstract.slice(0, 300)}${p.abstract.length > 300 ? '…' : ''}` : '';
      return `${cite}${journal}${doi}${citations}${abs}`;
    })
    .join('\n\n');
}

/**
 * Converte papers para o formato DeepThoughtSource do frontend.
 * @param {Awaited<ReturnType<typeof searchAcademicPapers>>} papers
 * @returns {Array<{title: string, author: string, year: string, type: string, url: string, why: string}>}
 */
export function papersToSources(papers) {
  return papers.map((p) => ({
    title: p.title,
    author: p.authors.slice(0, 3).join(', ') + (p.authors.length > 3 ? ' et al.' : ''),
    year: String(p.year ?? ''),
    type: p.type,
    url: p.url ?? '',
    why: p.citationCount > 0 ? `${p.citationCount} citações` : '',
  }));
}
