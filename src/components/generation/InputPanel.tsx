import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Image, AlertCircle, Loader2, Youtube, X, Upload, Brain, Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { TemplateSelector } from './TemplateSelector';
import { ShuffleSuggestions } from './ShuffleSuggestions';
import { UpgradePrompt } from '@/components/monetization/UpgradePrompt';
import { useMapsStore } from '@/stores/maps-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUsageStore } from '@/stores/usage-store';
import { generateMindMap, type AttachmentInput, type GenerationMode } from '@/services/llm/generation';
import type { ClarificationRequest, ClarificationResponse } from '@/services/llm/generation';
import type { TemplateId } from '@/types/templates';
import { cn } from '@/lib/utils';

const IMAGE_MAX_SIZE = 20 * 1024 * 1024; // 20MB
const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const YOUTUBE_REGEX = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const YOUTUBE_URL_FULL = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[a-zA-Z0-9_-]{11}(?:\S)*/g;

function extractYouTubeUrl(text: string): string | null {
  const m = text.match(YOUTUBE_REGEX);
  if (!m) return null;
  return `https://www.youtube.com/watch?v=${m[1]}`;
}

export function InputPanel() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>('padrao');
  const [generateImage, setGenerateImage] = useState(false);
  const [imageModeEnabled, setImageModeEnabled] = useState(false);
  const [generationMode, setGenerationMode] = useState<GenerationMode>('normal');
  const [localError, setLocalError] = useState('');
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState('');
	const [clarifyOpen, setClarifyOpen] = useState(false);
	const [clarifyReq, setClarifyReq] = useState<ClarificationRequest | null>(null);
	const [clarifyAnswers, setClarifyAnswers] = useState<string[]>([]);
  const clarifyResolverRef = useRef<((value: ClarificationResponse | null) => void) | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [imageAttachment, setImageAttachment] = useState<{ base64: string; mimeType: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const youtubeUrl = useMemo(() => {
    if (imageAttachment) return null;
    return extractYouTubeUrl(query);
  }, [query, imageAttachment]);

  const generation = useMapsStore((s) => s.generation);
  const setGenerationProgress = useMapsStore((s) => s.setGenerationProgress);
  const setGenerationError = useMapsStore((s) => s.setGenerationError);
  const resetGeneration = useMapsStore((s) => s.resetGeneration);
  const hasAnyApiKey = useSettingsStore((s) => s.hasAnyApiKey);
  const checkAction = useUsageStore((s) => s.checkAction);
  const extraCredits = useUsageStore((s) => s.extraCredits);
  const fetchUsage = useUsageStore((s) => s.fetchUsage);

  const isGenerating = ['analyzing', 'generating', 'article', 'image'].includes(generation.status);

  useEffect(() => {
    if (generation.status === 'error') {
      setLocalError(generation.error ?? 'Erro desconhecido');
    }
  }, [generation.status, generation.error]);

  useEffect(() => {
    void fetchUsage();
  }, [fetchUsage]);

  const processImageFile = (file: File): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!IMAGE_TYPES.includes(file.type)) {
        reject(new Error('Formato não suportado. Use JPG, PNG, GIF ou WebP.'));
        return;
      }
      if (file.size > IMAGE_MAX_SIZE) {
        reject(new Error('Imagem muito grande. Máximo 20 MB.'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        setImageAttachment({ base64, mimeType: file.type });
        setLocalError('');
        resolve();
      };
      reader.onerror = () => reject(new Error('Erro ao ler a imagem.'));
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processImageFile(file).catch((err) => setLocalError(err instanceof Error ? err.message : 'Erro'));
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (imageAttachment || youtubeUrl) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    processImageFile(file).catch((err) => setLocalError(err instanceof Error ? err.message : 'Erro'));
  };

  const handleTextareaPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItem = items.find((item) => item.type.startsWith('image/'));
    if (!imageItem) return;
    const file = imageItem.getAsFile();
    if (!file) return;
    e.preventDefault();
    setImageModeEnabled(true);
    processImageFile(file).catch((err) => setLocalError(err instanceof Error ? err.message : 'Erro'));
  };

  const handleTextareaDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    e.preventDefault();
    setImageModeEnabled(true);
    processImageFile(file).catch((err) => setLocalError(err instanceof Error ? err.message : 'Erro'));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!imageAttachment && !youtubeUrl) setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const canGenerate = query.trim() || youtubeUrl || imageAttachment;
  const lacksDeepCredits = generationMode === 'deep' && extraCredits < 2;

  const handleGenerate = async () => {
    if (!canGenerate) {
      setLocalError('Digite um tópico, cole um link do YouTube ou envie uma imagem.');
      return;
    }
    if (!hasAnyApiKey()) {
      setLocalError('Configure sua chave de API nas Configurações antes de continuar.');
      return;
    }
    setLocalError('');

    // Check monthly map creation limit
    try {
      const check = await checkAction('create_map', { generationMode });
      if (!check.allowed) {
        setUpgradeMessage(check.reason ?? 'Limite de mapas atingido. Faça upgrade para continuar.');
        setShowUpgrade(true);
        return;
      }
    } catch {
      // Fail open — allow generation if usage check fails
    }

    resetGeneration();

    const trimmed = query.trim();
    let attachment: AttachmentInput | undefined;
    let effectiveQuery = trimmed;

    if (imageModeEnabled && imageAttachment) {
      attachment = { type: 'image', base64: imageAttachment.base64, mimeType: imageAttachment.mimeType };
      effectiveQuery = trimmed || 'Extraia as principais ideias desta imagem para um mapa mental.';
    } else if (youtubeUrl) {
      attachment = { type: 'youtube', url: youtubeUrl };
      effectiveQuery = trimmed.replace(YOUTUBE_URL_FULL, '').trim() || 'Quais as principais ideias desse vídeo para um mapa mental?';
    } else if (imageAttachment) {
      attachment = { type: 'image', base64: imageAttachment.base64, mimeType: imageAttachment.mimeType };
      effectiveQuery = trimmed || 'Extraia as principais ideias desta imagem para um mapa mental.';
    }

    await generateMindMap(effectiveQuery, selectedTemplate, generateImage, {
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
    }, attachment, generationMode);
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
      {/* Attachments: YouTube ou imagem */}
      {(youtubeUrl || imageAttachment) && (
        <div className="flex flex-wrap items-center gap-3">
          {youtubeUrl && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
              <img
                src={`https://img.youtube.com/vi/${youtubeUrl.match(YOUTUBE_REGEX)?.[1] ?? ''}/mqdefault.jpg`}
                alt="YouTube"
                className="h-12 w-20 rounded object-cover"
              />
              <span className="flex items-center gap-1.5 text-sm">
                <Youtube className="h-4 w-4 text-red-500" />
                YouTube detectado
              </span>
              <button
                type="button"
                onClick={() => setQuery((q) => q.replace(YOUTUBE_URL_FULL, '').trim())}
                className="ml-1 rounded p-1 hover:bg-muted"
                aria-label="Remover link YouTube"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          {imageAttachment && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-2">
              <img
                src={`data:${imageAttachment.mimeType};base64,${imageAttachment.base64}`}
                alt="Preview"
                className="h-12 w-16 rounded object-cover"
              />
              <span className="text-sm text-muted-foreground">Imagem anexada</span>
              <button
                type="button"
                onClick={() => {
                  setImageAttachment(null);
                  setImageModeEnabled(false);
                }}
                className="rounded p-1 hover:bg-muted"
                aria-label="Remover imagem"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Upload imagem (quando modo imagem ativo) */}
      {imageModeEnabled && !youtubeUrl && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            'rounded-lg border-2 border-dashed p-6 text-center transition-colors',
            dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-muted-foreground/40',
            imageAttachment && 'hidden'
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={IMAGE_TYPES.join(',')}
            onChange={handleFileChange}
            className="hidden"
          />
          <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            Arraste uma imagem aqui ou{' '}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-primary underline hover:no-underline"
            >
              selecione um arquivo
            </button>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">JPG, PNG, GIF ou WebP. Máx. 20 MB. Você também pode colar direto na caixa (Ctrl+V).</p>
        </div>
      )}

      {/* Main input */}
      <div className="relative">
        <Textarea
          ref={textareaRef}
          id="map-query-input"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setLocalError(''); }}
          onKeyDown={handleKeyDown}
          onPaste={handleTextareaPaste}
          onDrop={handleTextareaDrop}
          onDragOver={(e) => {
            if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) e.preventDefault();
          }}
          placeholder="Digite sua pergunta ou tópico... (ex: Como funciona a inteligência artificial?)"
          className="min-h-[120px] resize-none text-base pr-4 pb-28"
          disabled={isGenerating}
          aria-label="Tópico ou pergunta para gerar mapa mental"
          aria-describedby="map-query-helper"
        />
        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={generateImage}
              disabled={isGenerating}
              onClick={() => setGenerateImage((v) => !v)}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs transition-all',
                generateImage
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                isGenerating && 'opacity-60 cursor-not-allowed'
              )}
            >
              <Image className="h-3.5 w-3.5" />
              <span className="font-medium">Gerar imagem</span>
              <Badge variant={generateImage ? 'default' : 'secondary'} className="h-5 rounded-full px-2 text-[10px]">
                {generateImage ? 'ON' : 'OFF'}
              </Badge>
            </button>

            <button
              type="button"
              aria-pressed={imageModeEnabled}
              disabled={isGenerating}
              onClick={() => {
                setImageModeEnabled((v) => {
                  const next = !v;
                  if (!next) setImageAttachment(null);
                  return next;
                });
              }}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs transition-all',
                imageModeEnabled
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                isGenerating && 'opacity-60 cursor-not-allowed'
              )}
            >
              <Upload className="h-3.5 w-3.5" />
              <span className="font-medium">Imagem</span>
              <Badge variant={imageModeEnabled ? 'default' : 'secondary'} className="h-5 rounded-full px-2 text-[10px]">
                {imageModeEnabled ? 'ON' : 'OFF'}
              </Badge>
            </button>

            <button
              type="button"
              aria-pressed={generationMode === 'deep'}
              disabled={isGenerating}
              onClick={() => setGenerationMode((m) => (m === 'deep' ? 'normal' : 'deep'))}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs transition-all',
                generationMode === 'deep'
                  ? 'border-violet-300 bg-violet-50 text-violet-700 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                isGenerating && 'opacity-60 cursor-not-allowed'
              )}
            >
              <Brain className="h-3.5 w-3.5" />
              <span className="font-medium">Aprofundado</span>
              <Badge
                className={cn(
                  'h-5 rounded-full px-2 text-[10px] font-semibold',
                  generationMode === 'deep'
                    ? 'bg-violet-600 text-white hover:bg-violet-600'
                    : 'bg-slate-600 text-white hover:bg-slate-600'
                )}
              >
                <Coins className="mr-1 h-3 w-3" />
                2 créditos
              </Badge>
              <Badge variant="secondary" className="h-5 rounded-full px-2 text-[10px]">
                saldo {extraCredits}
              </Badge>
            </button>
          </div>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !canGenerate || lacksDeepCredits}
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
      {lacksDeepCredits && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Saldo insuficiente para o modo aprofundado. São necessários 2 créditos extras.
        </p>
      )}

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

