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
import { callLLM, parseJSON } from './client';
import {
  getAnalysisPrompt,
	getDeepThoughtPreflightPrompt,
  getMindMapPrompt,
  getArticlePrompt,
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

export async function generateMindMap(
  query: string,
  templateId: TemplateId,
  generateImage: boolean,
  callbacks: GenerationCallbacks
): Promise<void> {
  const { onProgress, onError, onComplete } = callbacks;
  const settings = useSettingsStore.getState();
  const mapsStore = useMapsStore.getState();

  if (!settings.hasApiKey()) {
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

  const llmOptions = {
    provider: settings.provider,
    apiKey: await settings.getActiveApiKey(),
    model: settings.selectedModel,
  };

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

			const preflightText = await callLLM(
				[{ role: 'user', content: getDeepThoughtPreflightPrompt(query) }],
				{ ...llmOptions, temperature: 0.2, maxTokens: 2200 }
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
		}

    // Stage 1: Analysis
    onProgress(10, 'Analisando conteúdo...');
    mapsStore.setGenerationStatus('analyzing');

    const analysisText = await callLLM(
			[{ role: 'user', content: getAnalysisPrompt(effectiveQuery, templateId, extraContext) }],
      { ...llmOptions, temperature: 0.3 }
    );

    const analysis = parseJSON<AnalysisResult>(analysisText);
    onProgress(30, 'Análise concluída. Gerando mapa mental...');

    // Stage 2 & 3: Mind map + Article (parallel)
    mapsStore.setGenerationStatus('generating');

    const [mindMapText, articleText] = await Promise.all([
      callLLM(
        [{ role: 'user', content: getMindMapPrompt(analysis) }],
        { ...llmOptions, temperature: 0.4, maxTokens: 8000 }
      ),
      callLLM(
        [{ role: 'user', content: getArticlePrompt(analysis) }],
        { ...llmOptions, temperature: 0.7, maxTokens: 4000 }
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

    // Stage 4: Image (optional)
    let imageUrl: string | undefined;
    if (generateImage && settings.replicateApiKey) {
      mapsStore.setGenerationStatus('image');
      onProgress(80, 'Gerando imagem ilustrativa...');
      try {
        imageUrl = await generateReplicateImage(
          analysis.central_theme,
          settings.replicateApiKey
        );
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

    const savedMap: SavedMap = {
      id: mapId,
      title: analysis.central_theme,
			query: effectiveQuery,
      template: templateId,
			graphType,
      mindElixirData,
	      article: finalArticle,
      imageUrl,
			sources,
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

async function generateReplicateImage(
  theme: string,
  apiKey: string
): Promise<string> {
  const prompt = `A beautiful, detailed illustration representing the concept of "${theme}". Digital art, vibrant colors, professional quality.`;

  const response = await fetch('/api/replicate/v1/models/black-forest-labs/flux-schnell/predictions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token ${apiKey}`,
    },
    body: JSON.stringify({
      input: { prompt, width: 1024, height: 576, num_outputs: 1 },
    }),
  });

  if (!response.ok) throw new Error('Replicate API error');

  const prediction = await response.json();
  const predictionId = prediction.id;

  // Poll for result
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await fetch(`/api/replicate/v1/predictions/${predictionId}`, {
      headers: { Authorization: `Token ${apiKey}` },
    });
    const result = await poll.json();
    if (result.status === 'succeeded') return result.output?.[0] ?? '';
    if (result.status === 'failed') throw new Error('Image generation failed');
  }

  throw new Error('Image generation timed out');
}

