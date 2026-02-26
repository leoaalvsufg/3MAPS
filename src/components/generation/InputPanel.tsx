import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Image, AlertCircle, Loader2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { TemplateSelector } from './TemplateSelector';
import { ShuffleSuggestions } from './ShuffleSuggestions';
import { UpgradePrompt } from '@/components/monetization/UpgradePrompt';
import { useMapsStore } from '@/stores/maps-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUsageStore } from '@/stores/usage-store';
import { useAuthStore } from '@/stores/auth-store';
import { generateMindMap } from '@/services/llm/generation';
import type { ClarificationRequest, ClarificationResponse } from '@/services/llm/generation';
import { extractWebContent } from '@/services/api/webExtractApi';
import type { TemplateId } from '@/types/templates';
import { cn } from '@/lib/utils';

export function InputPanel() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>('padrao');
  const [generateImage, setGenerateImage] = useState(false);
  const [deepMode, setDeepMode] = useState(false);
  const [deepCredits, setDeepCredits] = useState<{ used: number; limit: number; extra: number } | null>(null);
  const [localError, setLocalError] = useState('');
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState('');
	const [clarifyOpen, setClarifyOpen] = useState(false);
	const [clarifyReq, setClarifyReq] = useState<ClarificationRequest | null>(null);
	const [clarifyAnswers, setClarifyAnswers] = useState<string[]>([]);
	const clarifyResolverRef = useRef<((value: ClarificationResponse | null) => void) | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const generation = useMapsStore((s) => s.generation);
  const setGenerationProgress = useMapsStore((s) => s.setGenerationProgress);
  const setGenerationError = useMapsStore((s) => s.setGenerationError);
  const resetGeneration = useMapsStore((s) => s.resetGeneration);
  const hasAnyApiKey = useSettingsStore((s) => s.hasAnyApiKey);
  const checkAction = useUsageStore((s) => s.checkAction);
  const consumeDeepCredit = useUsageStore((s) => s.consumeDeepCredit);

  const user = useAuthStore((s) => s.user);
  const isPremiumOrAbove = user?.plan === 'premium' || user?.plan === 'enterprise' || user?.isAdmin;

  const isGenerating = ['analyzing', 'generating', 'article', 'image'].includes(generation.status);

  const fetchDeepCredits = useCallback(async () => {
    if (!isPremiumOrAbove) return;
    try {
      const resp = await checkAction('deep_map');
      setDeepCredits({
        used: resp.advancedCallsUsed ?? 0,
        limit: resp.advancedCallsLimit ?? 4,
        extra: resp.extraCredits ?? user?.extraCredits ?? 0,
      });
    } catch {
      // ignore
    }
  }, [isPremiumOrAbove, checkAction, user?.extraCredits]);

  useEffect(() => {
    if (!isPremiumOrAbove) {
      setDeepMode(false);
      return;
    }
    void fetchDeepCredits();
  }, [isPremiumOrAbove, fetchDeepCredits]);

  useEffect(() => {
    if (!isPremiumOrAbove) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void fetchDeepCredits();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [isPremiumOrAbove, fetchDeepCredits]);

  useEffect(() => {
    if (generation.status === 'error') {
      setLocalError(generation.error ?? 'Erro desconhecido');
    }
  }, [generation.status, generation.error]);

  /** Detecta se o primeiro token do input é uma URL e retorna { url, restante } ou null. */
  const parseInputForUrl = (input: string): { url: string; restante: string } | null => {
    const parts = input.trim().split(/\s+/);
    if (parts.length === 0) return null;
    let candidate = parts[0];
    if (!candidate) return null;
    if (candidate.startsWith('http://') || candidate.startsWith('https://')) {
      try {
        new URL(candidate);
        return { url: candidate, restante: parts.slice(1).join(' ').trim() };
      } catch {
        return null;
      }
    }
    if (candidate.includes('.') && /^[a-zA-Z0-9][\w.-]*\.[a-zA-Z]{2,}(\/.*)?$/.test(candidate)) {
      try {
        const withScheme = candidate.startsWith('http') ? candidate : `https://${candidate}`;
        new URL(withScheme);
        return { url: withScheme, restante: parts.slice(1).join(' ').trim() };
      } catch {
        return null;
      }
    }
    return null;
  };

  const handleGenerate = async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      setLocalError('Digite um tópico ou pergunta para gerar o mapa.');
      return;
    }
    if (!hasAnyApiKey()) {
      setLocalError('Configure sua chave de API nas Configurações antes de continuar.');
      return;
    }
    setLocalError('');

    // Check monthly map creation limit
    try {
      const check = await checkAction('create_map');
      if (!check.allowed) {
        setUpgradeMessage(check.reason ?? 'Limite de mapas atingido. Faça upgrade para continuar.');
        setShowUpgrade(true);
        return;
      }
    } catch {
      // Fail open — allow generation if usage check fails
    }

    // Deep mode: check + consume one credit upfront
    if (deepMode) {
      try {
        const deepCheck = await checkAction('deep_map', { templateId: selectedTemplate });
        if (!deepCheck.allowed) {
          setUpgradeMessage(deepCheck.reason ?? 'Sem créditos de mapa aprofundado disponíveis.');
          setShowUpgrade(true);
          return;
        }
        const consumed = await consumeDeepCredit(selectedTemplate);
        if (!consumed) {
          setLocalError('Não foi possível reservar o crédito de mapa aprofundado. Tente novamente.');
          return;
        }
        void fetchDeepCredits();
      } catch {
        setLocalError('Erro ao verificar créditos. Tente novamente.');
        return;
      }
    }

    resetGeneration();

    let effectiveQuery = trimmed;
    let urlSource: { url: string; title: string; siteName?: string } | undefined;

    const urlParse = parseInputForUrl(trimmed);
    if (urlParse) {
      setGenerationProgress(5, 'Extraindo conteúdo do link...');
      try {
        const extracted = await extractWebContent({
          url: urlParse.url,
          mode: 'readability',
          maxChars: 25000,
        });
        const header = [
          'Gere um mapa mental EXCLUSIVAMENTE a partir do conteúdo abaixo (extraído do link).',
          `Link: ${extracted.finalUrl}`,
          `Título: ${extracted.title}`,
          `Site: ${extracted.siteName || extracted.finalUrl}`,
          'Conteúdo:',
          '<<<',
          extracted.text,
          '>>>',
          'Se algo não estiver no conteúdo, responda "não consta no texto".',
        ].join('\n');
        effectiveQuery = urlParse.restante
          ? `${header}\n\nPergunta-foco do usuário: ${urlParse.restante}`
          : header;
        urlSource = {
          url: extracted.finalUrl,
          title: extracted.title,
          siteName: extracted.siteName || undefined,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setLocalError(msg);
        setGenerationError(msg);
        resetGeneration();
        return;
      }
    }

		await generateMindMap(effectiveQuery, selectedTemplate, generateImage, {
      onProgress: (progress, step) => setGenerationProgress(progress, step),
      onError: (err) => {
        setGenerationError(err);
        setLocalError(err);
      },
			onRequestClarification: async (req) => {
				setClarifyReq(req);
				setClarifyAnswers(req.questions.map(() => ''));
				setClarifyOpen(true);
				return await new Promise<ClarificationResponse | null>((resolve) => {
					clarifyResolverRef.current = resolve;
				});
			},
      onComplete: (mapId) => navigate(`/map/${mapId}`),
    }, urlSource, deepMode);
  };

	const closeClarify = (value: ClarificationResponse | null) => {
		setClarifyOpen(false);
		const resolver = clarifyResolverRef.current;
		clarifyResolverRef.current = null;
		resolver?.(value);
	};

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleGenerate();
    }
  };

  return (
		<div className="w-full max-w-3xl mx-auto flex flex-col gap-6">
			<Dialog open={clarifyOpen} onOpenChange={(open) => !open && closeClarify(null)}>
				<DialogContent className="max-w-xl max-h-[90dvh] flex flex-col overflow-hidden p-4 sm:p-6">
					<DialogHeader className="shrink-0">
						<DialogTitle>Pensamento profundo — ajustar antes de gerar</DialogTitle>
						<DialogDescription>
							Responda rápido. Isso melhora o mapa, o artigo e o modo de apresentação.
						</DialogDescription>
					</DialogHeader>

					<div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
						{clarifyReq?.recommended && (
							<div className="rounded-lg border border-border bg-muted/40 p-3 mb-4">
								<div className="text-xs text-muted-foreground">Sugestão de apresentação</div>
								<div className="text-sm font-medium mt-0.5">
									{clarifyReq.recommended.graphType
										? clarifyReq.recommended.graphType
										: clarifyReq.recommended.mode}
								</div>
								{clarifyReq.recommended.reason && (
									<div className="text-xs text-muted-foreground mt-1">{clarifyReq.recommended.reason}</div>
								)}
							</div>
						)}

						<div className="grid gap-3">
							{clarifyReq?.questions.map((q, idx) => (
								<div key={q} className="grid gap-1">
									<div className="text-sm font-medium">{q}</div>
									<Input
										value={clarifyAnswers[idx] ?? ''}
										onChange={(e) => {
											const next = [...clarifyAnswers];
											next[idx] = e.target.value;
											setClarifyAnswers(next);
										}}
										placeholder="Sua resposta..."
										className="h-9"
									/>
								</div>
							))}
						</div>

						{(clarifyReq?.sources?.length ?? 0) > 0 && (
							<div className="rounded-lg border border-border bg-card p-3 mt-4">
								<div className="text-xs font-medium text-muted-foreground mb-2">Fontes sugeridas</div>
								<ul className="grid gap-1 text-xs text-muted-foreground">
									{clarifyReq?.sources?.slice(0, 5).map((s, i) => (
										<li key={`${s.title}-${i}`} className="flex flex-col">
											<span className="text-foreground/90">{s.title}</span>
											{s.url ? (
												<a className="underline underline-offset-2 hover:opacity-80 break-all" href={s.url} target="_blank" rel="noreferrer">
													{s.url}
												</a>
											) : null}
										</li>
									))}
								</ul>
							</div>
						)}
					</div>

					<DialogFooter className="shrink-0 pt-4 border-t border-border mt-4">
						<Button variant="outline" onClick={() => closeClarify(null)}>
							Cancelar
						</Button>
						<Button onClick={() => closeClarify({ answers: clarifyAnswers })}>
							Continuar
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
      {/* Main input */}
      <div className="relative">
        <Textarea
          ref={textareaRef}
          id="map-query-input"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setLocalError(''); }}
          onKeyDown={handleKeyDown}
          placeholder="Digite sua pergunta, tópico ou cole uma URL... (ex: https://exemplo.com/artigo)"
          className="min-h-[120px] resize-none text-base pr-4 pb-14"
          disabled={isGenerating}
          aria-label="Tópico ou pergunta para gerar mapa mental"
          aria-describedby="map-query-helper"
        />
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={generateImage}
                onChange={(e) => setGenerateImage(e.target.checked)}
                className="rounded"
                disabled={isGenerating}
              />
              <Image className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Imagem</span>
            </label>
            {isPremiumOrAbove && (
              <label className={cn(
                'flex items-center gap-2 cursor-pointer select-none rounded-full px-2.5 py-1 transition-colors',
                deepMode
                  ? 'bg-amber-500/15 ring-1 ring-amber-500/40'
                  : 'hover:bg-muted/50'
              )}>
                <input
                  type="checkbox"
                  checked={deepMode}
                  onChange={(e) => setDeepMode(e.target.checked)}
                  className="sr-only"
                  disabled={isGenerating}
                />
                <Zap className={cn('h-3.5 w-3.5', deepMode ? 'text-amber-500' : 'text-muted-foreground')} />
                <span className={cn('text-xs font-medium', deepMode ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
                  Aprofundado
                </span>
                {deepCredits && (
                  <span className={cn(
                    'text-[10px] font-semibold rounded-full px-1.5 py-0.5 min-w-[20px] text-center',
                    deepMode ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-muted text-muted-foreground'
                  )}>
                    {deepCredits.limit === -1
                      ? deepCredits.extra
                      : Math.max(0, deepCredits.limit - deepCredits.used) + deepCredits.extra}
                  </span>
                )}
              </label>
            )}
          </div>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !query.trim()}
            size="sm"
            className={cn('gap-2', deepMode && 'bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700')}
          >
            {isGenerating ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Gerando...</>
            ) : deepMode ? (
              <><Zap className="h-4 w-4" /> Gerar Aprofundado</>
            ) : (
              <><Sparkles className="h-4 w-4" /> Gerar Mapa</>
            )}
          </Button>
        </div>
      </div>

      {/* Helper text (linked via aria-describedby) */}
      <p id="map-query-helper" className="sr-only">
        Digite um tópico ou pergunta e pressione Ctrl+Enter ou clique em Gerar Mapa para criar um mapa mental com IA.
      </p>

      {/* Progress */}
      {isGenerating && (
        <div
          className="flex flex-col gap-2"
          role="status"
          aria-live="polite"
          aria-label={generation.currentStep ?? 'Gerando mapa...'}
        >
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>{generation.currentStep}</span>
          </div>
          <div className="w-full bg-muted rounded-full h-1.5">
            <div
              className="bg-primary h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${generation.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {localError && (
        <div className={cn('flex items-start gap-2 text-sm rounded-lg p-3',
          'bg-destructive/10 text-destructive border border-destructive/20')}>
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{localError}</span>
        </div>
      )}

      {/* Template selector */}
      <TemplateSelector
        selected={selectedTemplate}
        onSelect={setSelectedTemplate}
        onLockedSelect={() => {
          setUpgradeMessage('Este template está disponível apenas no plano Premium.');
          setShowUpgrade(true);
        }}
      />

      {/* Suggestions */}
      <ShuffleSuggestions onSelect={(s) => { setQuery(s); textareaRef.current?.focus(); }} />

      {/* Upgrade prompt */}
      {showUpgrade && (
        <UpgradePrompt
          message={upgradeMessage || undefined}
          onClose={() => setShowUpgrade(false)}
        />
      )}
    </div>
  );
}

