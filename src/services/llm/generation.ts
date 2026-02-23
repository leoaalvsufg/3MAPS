import { v4 as uuidv4 } from 'uuid';
import type {
	AnalysisResult,
	DeepThoughtSource,
	GraphType,
	MermaidDiagram,
	MindElixirData,
	SavedMap,
} from '@/types/mindmap';
import type { TemplateId } from '@/types/templates';
import { parseJSON } from './client';
import { callRoutedLLM } from './routedClient';
import {
  getAnalysisPrompt,
	getDeepThoughtPreflightPrompt,
  getQueryRefinementPrompt,
  getMindMapPrompt,
  getArticlePrompt,
  getAcademicSearchTermsPrompt,
  getAcademicPreflightPrompt,
  getAcademicAnalysisPrompt,
  getAcademicMindMapPrompt,
  getAcademicArticlePrompt,
} from './prompts';
import { normalizeMindElixirData } from '@/lib/normalizeMindElixirData';
import { useMapsStore } from '@/stores/maps-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUsageStore } from '@/stores/usage-store';

export type ClarificationRequest = {
	questions: string[];
	assumptions?: string[];
	sources?: DeepThoughtSource[];
	recommended?: {
		mode: 'mindmap' | 'orgchart' | 'tree' | 'timeline' | 'fishbone' | 'mermaid';
		graphType?: GraphType;
		mermaid?: MermaidDiagram;
		reason?: string;
	};
};

export type ClarificationResponse = {
	answers: string[];
};

type DeepThoughtPreflightResult = {
	needs_clarification?: boolean;
	clarifying_questions?: string[];
	assumptions_if_no_answer?: string[];
	sources?: DeepThoughtSource[];
	recommended_presentation?: {
		mode?: NonNullable<ClarificationRequest['recommended']>['mode'];
		graphType?: GraphType;
		mermaid?: MermaidDiagram;
		reason?: string;
	};
};

export interface GenerationCallbacks {
  onProgress: (progress: number, step: string) => void;
  onError: (error: string) => void;
  onComplete: (mapId: string) => void;
	onRequestClarification?: (req: ClarificationRequest) => Promise<ClarificationResponse | null>;
}

/** Opcional: fonte URL quando o mapa foi gerado a partir de colar link. */
export interface UrlSource {
  url: string;
  title: string;
  siteName?: string;
}

export async function generateMindMap(
  query: string,
  templateId: TemplateId,
  generateImage: boolean,
  callbacks: GenerationCallbacks,
  urlSource?: UrlSource
): Promise<void> {
  const { onProgress, onError, onComplete } = callbacks;
  const settings = useSettingsStore.getState();
  const mapsStore = useMapsStore.getState();

  if (!settings.hasAnyApiKey()) {
    onError('Configure sua chave de API nas Configurações antes de gerar um mapa.');
    return;
  }

  // Check if the user is allowed to create a new map
  try {
    const usageStore = useUsageStore.getState();
    const check = await usageStore.checkAction('create_map');
    if (!check.allowed) {
      onError(check.reason ?? 'Limite do plano gratuito atingido. Faça upgrade para continuar.');
      return;
    }
  } catch {
    // Fail open — don't block generation if usage check fails
  }

  try {
		let effectiveQuery = query;
		let graphType: GraphType = 'mindmap';
		let sources: DeepThoughtSource[] | undefined;
		let mermaid: MermaidDiagram | undefined;
		let extraContext = '';

		// Stage 0 (optional): pensamento_profundo preflight
		if (templateId === 'pensamento_profundo') {
			onProgress(5, 'Pensamento profundo: levantando fontes e contexto...');
			mapsStore.setGenerationStatus('analyzing');

			const preflightText = await callRoutedLLM(
				'preflight',
				[{ role: 'user', content: getDeepThoughtPreflightPrompt(query) }],
				{ temperature: 0.2, maxTokens: 4096 }
			);

			const preflight = parseJSON<DeepThoughtPreflightResult>(preflightText);
			sources = Array.isArray(preflight.sources) ? preflight.sources : undefined;
			mermaid = preflight.recommended_presentation?.mermaid;
				// NOTE: As per product decision, mindmap remains the primary visualization.
				// We keep any Mermaid suggestion as metadata (saved in `mermaid`) and do not auto-switch `graphType`.

			const questions = (preflight.clarifying_questions ?? []).filter(Boolean).slice(0, 5);
			if (preflight.needs_clarification && questions.length > 0) {
				if (!callbacks.onRequestClarification) {
					onError(
						'Este template precisa de clarificação antes de gerar. Responda as perguntas e tente novamente.'
					);
					return;
				}

				const resp = await callbacks.onRequestClarification({
					questions,
					assumptions: preflight.assumptions_if_no_answer ?? [],
					sources,
					recommended: {
						mode: (preflight.recommended_presentation?.mode ?? 'mindmap') as NonNullable<ClarificationRequest['recommended']>['mode'],
						graphType: preflight.recommended_presentation?.graphType,
						mermaid,
						reason: preflight.recommended_presentation?.reason,
					},
				});

				if (!resp) {
					onError('Geração cancelada.');
					return;
				}

				const answers = resp.answers ?? [];
				effectiveQuery = `${query}\n\nRespostas de clarificação:\n${questions
					.map((q, i) => `- ${q}\n  R: ${(answers[i] ?? '').trim()}`)
					.join('\n')}`;
			}

			extraContext = JSON.stringify(
				{
					sources,
					recommended_presentation: preflight.recommended_presentation,
				},
				null,
				2
			);

			// Reanálise: refinar a pergunta antes da análise para melhor qualidade
			onProgress(8, 'Refinando pergunta para análise...');
			try {
				const refinedText = await callRoutedLLM(
					'preflight',
					[{ role: 'user', content: getQueryRefinementPrompt(effectiveQuery, extraContext) }],
					{ temperature: 0.2, maxTokens: 500 }
				);
				const trimmed = refinedText.trim();
				if (trimmed.length > 0) effectiveQuery = trimmed;
			} catch {
				// Se falhar o refinamento, segue com effectiveQuery atual
			}
		}

		// Stage 0-B (pesquisador_senior): busca acadêmica real + preflight acadêmico
		let papersContext = '';
		if (templateId === 'pesquisador_senior') {
			onProgress(3, 'Pesquisador Sênior: extraindo termos de busca acadêmica...');
			mapsStore.setGenerationStatus('analyzing');

			// Step 1: Extract academic search terms via LLM
			const searchTermsText = await callRoutedLLM(
				'preflight',
				[{ role: 'user', content: getAcademicSearchTermsPrompt(query) }],
				{ temperature: 0.1, maxTokens: 500 }
			);
			const searchTerms = parseJSON<{ search_queries?: string[]; suggested_year_from?: number }>(searchTermsText);
			const queries = (searchTerms.search_queries ?? [query]).filter(Boolean).slice(0, 5);
			const yearFrom = searchTerms.suggested_year_from ?? 2018;

			// Step 2: Search Semantic Scholar for real papers
			onProgress(8, 'Buscando papers acadêmicos no Semantic Scholar...');
			const allPapers: Array<{ title: string; authors: string[]; year: number | null; citationCount: number; abstract: string | null; doi: string | null; url: string | null; journal: string | null; type: string }> = [];
			const seenTitles = new Set<string>();

			for (const q of queries) {
				try {
					const token = getAuthToken();
					const res = await fetch(`/api/academic/search?query=${encodeURIComponent(q)}&limit=10&yearFrom=${yearFrom}`, {
						headers: token ? { Authorization: `Bearer ${token}` } : {},
					});
					if (res.ok) {
						const data = await res.json();
						for (const p of (data.papers ?? [])) {
							const key = p.title.toLowerCase().trim();
							if (!seenTitles.has(key)) {
								seenTitles.add(key);
								allPapers.push(p);
							}
						}
					}
				} catch {
					// Continue with other queries
				}
			}

			// Sort by citation count (most cited first)
			allPapers.sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0));
			const topPapers = allPapers.slice(0, 15);

			// Format papers as context for prompts
			papersContext = topPapers
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

			// Convert papers to sources
			sources = topPapers.map((p) => ({
				title: p.title,
				author: p.authors.slice(0, 3).join(', ') + (p.authors.length > 3 ? ' et al.' : ''),
				year: String(p.year ?? ''),
				type: (p.type ?? 'paper') as DeepThoughtSource['type'],
				url: p.url ?? '',
				why: p.citationCount > 0 ? `${p.citationCount} citações` : 'Relevante para o tema',
			}));

			// Step 3: Academic preflight (with real papers as context)
			onProgress(12, 'Analisando literatura acadêmica...');
			const preflightText = await callRoutedLLM(
				'preflight',
				[{ role: 'user', content: getAcademicPreflightPrompt(query, papersContext) }],
				{ temperature: 0.2, maxTokens: 4096 }
			);
			const preflight = parseJSON<DeepThoughtPreflightResult>(preflightText);

			// Merge LLM-suggested sources (if new ones)
			if (Array.isArray(preflight.sources)) {
				for (const s of preflight.sources) {
					if (s.title && !sources.some((ex) => ex.title.toLowerCase() === s.title.toLowerCase())) {
						sources.push(s);
					}
				}
			}

			const questions = (preflight.clarifying_questions ?? []).filter(Boolean).slice(0, 4);
			if (preflight.needs_clarification && questions.length > 0 && callbacks.onRequestClarification) {
				const resp = await callbacks.onRequestClarification({
					questions,
					assumptions: preflight.assumptions_if_no_answer ?? [],
					sources,
					recommended: {
						mode: 'mindmap',
						graphType: 'mindmap',
						reason: preflight.recommended_presentation?.reason ?? 'Mapa mental para revisão de literatura',
					},
				});

				if (!resp) {
					onError('Geração cancelada.');
					return;
				}

				const answers = resp.answers ?? [];
				effectiveQuery = `${query}\n\nDelimitação do escopo:\n${questions
					.map((q, i) => `- ${q}\n  R: ${(answers[i] ?? '').trim()}`)
					.join('\n')}`;
			}

			extraContext = JSON.stringify({
				academic_papers_count: topPapers.length,
				field: preflight.field_of_study ?? searchTerms.search_queries?.[0] ?? '',
				theoretical_frameworks: (preflight as Record<string, unknown>).theoretical_frameworks ?? [],
				research_gaps: (preflight as Record<string, unknown>).research_gaps ?? [],
			}, null, 2);

			// Refine query
			onProgress(15, 'Refinando pergunta de pesquisa...');
			try {
				const refinedText = await callRoutedLLM(
					'preflight',
					[{ role: 'user', content: getQueryRefinementPrompt(effectiveQuery, extraContext) }],
					{ temperature: 0.2, maxTokens: 500 }
				);
				const trimmed = refinedText.trim();
				if (trimmed.length > 0) effectiveQuery = trimmed;
			} catch { /* keep current */ }
		}

    // Stage 1: Analysis
    onProgress(templateId === 'pesquisador_senior' ? 20 : 10, 'Analisando conteúdo...');
    mapsStore.setGenerationStatus('analyzing');

    const analysisText = templateId === 'pesquisador_senior'
      ? await callRoutedLLM(
          'analysis',
          [{ role: 'user', content: getAcademicAnalysisPrompt(effectiveQuery, papersContext, extraContext) }],
          { temperature: 0.3, maxTokens: 4096 }
        )
      : await callRoutedLLM(
          'analysis',
          [{ role: 'user', content: getAnalysisPrompt(effectiveQuery, templateId, extraContext) }],
          { temperature: 0.3, maxTokens: 4096 }
        );

    const analysis = parseJSON<AnalysisResult>(analysisText);
    onProgress(30, 'Análise concluída. Gerando mapa mental...');

    // Stage 2 & 3: Mind map + Article (parallel)
    mapsStore.setGenerationStatus('generating');

    const [mindMapText, articleText] = templateId === 'pesquisador_senior'
      ? await Promise.all([
          callRoutedLLM(
            'mindmap',
            [{ role: 'user', content: getAcademicMindMapPrompt(analysis, papersContext) }],
            { temperature: 0.3, maxTokens: 10000 }
          ),
          callRoutedLLM(
            'article',
            [{ role: 'user', content: getAcademicArticlePrompt(analysis, papersContext) }],
            { temperature: 0.5, maxTokens: 6000 }
          ),
        ])
      : await Promise.all([
          callRoutedLLM(
            'mindmap',
            [{ role: 'user', content: getMindMapPrompt(analysis) }],
            { temperature: 0.4, maxTokens: 8000 }
          ),
          callRoutedLLM(
            'article',
            [{ role: 'user', content: getArticlePrompt(analysis) }],
            { temperature: 0.7, maxTokens: 4000 }
          ),
        ]);

    onProgress(70, 'Mapa e artigo gerados. Finalizando...');

    let mindElixirData: MindElixirData;
    try {
      mindElixirData = normalizeMindElixirData(parseJSON<MindElixirData>(mindMapText));
    } catch (parseErr) {
      console.error('Failed to parse mind map JSON:', mindMapText.slice(0, 500));
      throw new Error(`Erro ao interpretar o mapa mental gerado pela IA. Tente novamente. Detalhe: ${parseErr instanceof Error ? parseErr.message : 'JSON inválido'}`);
    }

    // Validate the parsed data has the expected structure
    if (!mindElixirData.nodeData || !mindElixirData.nodeData.topic) {
      console.error('Invalid mind map structure:', JSON.stringify(mindElixirData).slice(0, 500));
      throw new Error('A IA gerou um mapa mental com estrutura inválida. Tente novamente.');
    }

    // normalizeMindElixirData already ensures ids/topic/children and distributes root children.

    // Stage 4: Image (optional) — chave Replicate no servidor
    let imageUrl: string | undefined;
    if (generateImage) {
      mapsStore.setGenerationStatus('image');
      onProgress(80, 'Gerando imagem ilustrativa...');
      try {
        imageUrl = await generateReplicateImageViaServer(analysis.central_theme);
      } catch {
        // Image generation is optional, don't fail
        console.warn('Image generation failed, continuing without image');
      }
    }

	    const finalArticle = buildFinalArticleMarkdown({
	      raw: articleText,
	      title: analysis.central_theme,
	      coverUrl: generateImage ? imageUrl : undefined,
	    });

    onProgress(95, 'Salvando mapa...');

    const now = new Date().toISOString();
    const mapId = uuidv4();

    const mergedSources: DeepThoughtSource[] = [
      ...(urlSource
        ? [{
            title: urlSource.title,
            url: urlSource.url,
            type: 'article' as const,
            ...(urlSource.siteName ? { why: `Fonte: ${urlSource.siteName}` } : {}),
          }]
        : []),
      ...(sources ?? []),
    ];
    const savedMap: SavedMap = {
      id: mapId,
      title: analysis.central_theme,
			query: effectiveQuery,
      template: templateId,
			graphType,
      mindElixirData,
	      article: finalArticle,
      imageUrl,
			sources: mergedSources.length ? mergedSources : undefined,
			mermaid,
      tags: analysis.suggested_tags ?? [],
      createdAt: now,
      updatedAt: now,
      analysis,
    };

    mapsStore.addMap(savedMap);
    mapsStore.setGenerationStatus('done');
    onProgress(100, 'Mapa mental gerado com sucesso!');
    onComplete(mapId);

    // Refresh usage stats after successful generation
    try {
      useUsageStore.getState().fetchUsage();
    } catch {
      // Non-critical
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    onError(message);
  }
}

function buildFinalArticleMarkdown(opts: { raw: string; title: string; coverUrl?: string }): string {
  const title = (opts.title ?? '').trim() || 'Mapa mental';
  let md = (opts.raw ?? '').trim();

  if (!md) {
    md = `# ${title}\n\n`;
  }

  // Ensure the article starts with an H1 title.
  if (!md.startsWith('# ')) {
    md = `# ${title}\n\n${md}`;
  }

  // Insert cover image right after the H1 when available.
  const coverUrl = (opts.coverUrl ?? '').trim();
  if (coverUrl && !md.includes(coverUrl)) {
    const lines = md.split(/\r?\n/);
    const h1Index = lines.findIndex((l) => l.startsWith('# '));
    if (h1Index >= 0) {
      // Insert with surrounding blank lines for stable markdown rendering.
      lines.splice(h1Index + 1, 0, '', `![Capa - ${title}](${coverUrl})`, '');
      md = lines.join('\n');
    } else {
      md = `# ${title}\n\n![Capa - ${title}](${coverUrl})\n\n${md}`;
    }
  }

  // Normalize excessive blank lines.
  md = md.replace(/\n{3,}/g, '\n\n').trim();
  return `${md}\n`;
}

async function generateReplicateImageViaServer(theme: string): Promise<string> {
  const token = getAuthToken();
  if (!token) throw new Error('Login obrigatório');

  const response = await fetch('/api/image/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ theme }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Erro ao gerar imagem');

  return data.imageUrl ?? '';
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

