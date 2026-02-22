import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Image, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { TemplateSelector } from './TemplateSelector';
import { ShuffleSuggestions } from './ShuffleSuggestions';
import { useMapsStore } from '@/stores/maps-store';
import { useSettingsStore } from '@/stores/settings-store';
import { generateMindMap } from '@/services/llm/generation';
import type { ClarificationRequest, ClarificationResponse } from '@/services/llm/generation';
import type { TemplateId } from '@/types/templates';
import { cn } from '@/lib/utils';

export function InputPanel() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>('padrao');
  const [generateImage, setGenerateImage] = useState(false);
  const [localError, setLocalError] = useState('');
	const [clarifyOpen, setClarifyOpen] = useState(false);
	const [clarifyReq, setClarifyReq] = useState<ClarificationRequest | null>(null);
	const [clarifyAnswers, setClarifyAnswers] = useState<string[]>([]);
	const clarifyResolverRef = useRef<((value: ClarificationResponse | null) => void) | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const generation = useMapsStore((s) => s.generation);
  const setGenerationProgress = useMapsStore((s) => s.setGenerationProgress);
  const setGenerationError = useMapsStore((s) => s.setGenerationError);
  const resetGeneration = useMapsStore((s) => s.resetGeneration);
  const hasApiKey = useSettingsStore((s) => s.hasApiKey);

  const isGenerating = ['analyzing', 'generating', 'article', 'image'].includes(generation.status);

  useEffect(() => {
    if (generation.status === 'error') {
      setLocalError(generation.error ?? 'Erro desconhecido');
    }
  }, [generation.status, generation.error]);

  const handleGenerate = async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      setLocalError('Digite um tópico ou pergunta para gerar o mapa.');
      return;
    }
    if (!hasApiKey()) {
      setLocalError('Configure sua chave de API nas Configurações antes de continuar.');
      return;
    }
    setLocalError('');
    resetGeneration();

		await generateMindMap(trimmed, selectedTemplate, generateImage, {
      onProgress: (progress, step) => setGenerationProgress(progress, step),
      onError: (err) => {
        setGenerationError(err);
        setLocalError(err);
      },
			onRequestClarification: async (req) => {
				// Open a dialog and await answers.
				setClarifyReq(req);
				setClarifyAnswers(req.questions.map(() => ''));
				setClarifyOpen(true);
				return await new Promise<ClarificationResponse | null>((resolve) => {
					clarifyResolverRef.current = resolve;
				});
			},
      onComplete: (mapId) => navigate(`/map/${mapId}`),
    });
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
				<DialogContent className="max-w-xl">
					<DialogHeader>
						<DialogTitle>Pensamento profundo — ajustar antes de gerar</DialogTitle>
						<DialogDescription>
							Responda rápido. Isso melhora o mapa, o artigo e o modo de apresentação.
						</DialogDescription>
					</DialogHeader>

					{clarifyReq?.recommended && (
						<div className="rounded-lg border border-border bg-muted/40 p-3">
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
						<div className="rounded-lg border border-border bg-card p-3">
							<div className="text-xs font-medium text-muted-foreground mb-2">Fontes sugeridas</div>
							<ul className="grid gap-1 text-xs text-muted-foreground">
								{clarifyReq?.sources?.slice(0, 5).map((s, i) => (
									<li key={`${s.title}-${i}`} className="flex flex-col">
										<span className="text-foreground/90">{s.title}</span>
										{s.url ? (
											<a className="underline underline-offset-2 hover:opacity-80" href={s.url} target="_blank" rel="noreferrer">
												{s.url}
											</a>
										) : null}
									</li>
								))}
							</ul>
						</div>
					)}

					<DialogFooter>
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
          placeholder="Digite sua pergunta ou tópico... (ex: Como funciona a inteligência artificial?)"
          className="min-h-[120px] resize-none text-base pr-4 pb-14"
          disabled={isGenerating}
          aria-label="Tópico ou pergunta para gerar mapa mental"
          aria-describedby="map-query-helper"
        />
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={generateImage}
              onChange={(e) => setGenerateImage(e.target.checked)}
              className="rounded"
              disabled={isGenerating}
            />
            <Image className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Gerar imagem ilustrativa</span>
          </label>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !query.trim()}
            size="sm"
            className="gap-2"
          >
            {isGenerating ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Gerando...</>
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
      <TemplateSelector selected={selectedTemplate} onSelect={setSelectedTemplate} />

      {/* Suggestions */}
      <ShuffleSuggestions onSelect={(s) => { setQuery(s); textareaRef.current?.focus(); }} />
    </div>
  );
}

