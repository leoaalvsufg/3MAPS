import { Minimize2, Maximize2, Languages, RefreshCw, Download, MessageSquare, Layers, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { GraphType } from '@/types/mindmap';

import './postGenActions.css';

type PostGenAction = 'conciso' | 'detalhado' | 'traduzir' | 'regenerar';

interface PostGenActionsProps {
  onConcise: () => void;
  onDetailed: () => void;
  onTranslate: () => void;
  onRegenerate: () => void;
  onExport: () => void;
  onChat: () => void;
  graphType: GraphType;
  onGraphTypeChange: (type: GraphType) => void;
	detailsEnabled?: boolean;
	onDetailsEnabledChange?: (enabled: boolean) => void;
  isLoading?: boolean;
	activeAction?: PostGenAction;
}

export function PostGenActions({
  onConcise,
  onDetailed,
  onTranslate,
  onRegenerate,
  onExport,
  onChat,
  graphType,
  onGraphTypeChange,
	detailsEnabled,
	onDetailsEnabledChange,
  isLoading,
	activeAction,
}: PostGenActionsProps) {
  const GRAPH_TYPES: Array<{ id: GraphType; label: string }> = [
    { id: 'mindmap', label: 'Mindmap' },
    { id: 'orgchart', label: 'Org Chart' },
    { id: 'tree', label: 'Tree' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'fishbone', label: 'Fishbone' },
  ];

  const graphTypeLabel = GRAPH_TYPES.find((t) => t.id === graphType)?.label ?? graphType;
	const isDetailedProcessing = Boolean(isLoading && activeAction === 'detalhado');

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-card border border-border rounded-xl shadow-sm">
      <span className="text-xs font-medium text-muted-foreground mr-1 hidden sm:block">Ações:</span>

      {/* Graph type selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs h-8"
            title="Tipo de gráfico"
          >
	            <Layers className="h-3.5 w-3.5" />
            Tipo: {graphTypeLabel}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Tipo de gráfico</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup value={graphType} onValueChange={(v) => onGraphTypeChange(v as GraphType)}>
            {GRAPH_TYPES.map((t) => (
              <DropdownMenuRadioItem key={t.id} value={t.id}>
                {t.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

				{/* Details toggle (mindmap only) */}
				{graphType === 'mindmap' && typeof detailsEnabled === 'boolean' && onDetailsEnabledChange && (
					<Button
						variant={detailsEnabled ? 'secondary' : 'outline'}
						size="sm"
						onClick={() => onDetailsEnabledChange(!detailsEnabled)}
						className="gap-1.5 text-xs h-8"
						aria-pressed={detailsEnabled}
						title="Ativar/desativar exibição de definições/detalhes (não reprocessa o LLM)"
					>
						<BookOpen className="h-3.5 w-3.5" />
						Ativar detalhes: {detailsEnabled ? 'ligado' : 'desligado'}
					</Button>
				)}

      <Button
        variant="outline"
        size="sm"
        onClick={onConcise}
        disabled={isLoading}
        className="gap-1.5 text-xs h-8"
        title="Versão mais concisa"
      >
        <Minimize2 className="h-3.5 w-3.5" />
        Conciso
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={onDetailed}
        disabled={isLoading}
        className="gap-1.5 text-xs h-8"
        title="Versão mais detalhada"
      >
				{isDetailedProcessing ? (
					<span
						aria-hidden="true"
						className="h-3.5 w-3.5 rounded-full border border-border/60 border-t-primary/70 animate-spin"
					/>
				) : (
					<Maximize2 className="h-3.5 w-3.5" />
				)}
				{isDetailedProcessing ? 'Detalhando…' : 'Detalhado'}
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={onTranslate}
        disabled={isLoading}
        className="gap-1.5 text-xs h-8"
        title="Traduzir para inglês"
      >
        <Languages className="h-3.5 w-3.5" />
        Traduzir
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={onRegenerate}
        disabled={isLoading}
        className="gap-1.5 text-xs h-8"
        title="Regenerar mapa"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Regenerar
      </Button>

      <div className="flex-1" />

      <Button
        variant="outline"
        size="sm"
        onClick={onChat}
        className="gap-1.5 text-xs h-8 text-primary border-primary/30 hover:bg-primary/5"
        title="Abrir chat"
      >
        <MessageSquare className="h-3.5 w-3.5" />
        Chat
      </Button>

      <Button
        size="sm"
        onClick={onExport}
        className="gap-1.5 text-xs h-8"
        title="Exportar mapa"
      >
        <Download className="h-3.5 w-3.5" />
        Exportar
      </Button>

			{isDetailedProcessing && (
				<div className="w-full pt-2">
					<div className="postgen-gaugeTrack" aria-hidden="true">
						<div className="postgen-gaugeBar" />
					</div>
					<div className="mt-1 text-[11px] text-muted-foreground">
						Processando “Detalhado”…
					</div>
				</div>
			)}
    </div>
  );
}

