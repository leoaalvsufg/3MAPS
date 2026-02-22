import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Tag, Plus, X, FileText, Image as ImageIcon, BookOpen, Code } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useMapsStore } from '@/stores/maps-store';
import { getTagColor } from '@/lib/utils';
import type { MindElixirNode, SavedMap } from '@/types/mindmap';

interface DetailsPanelProps {
  map: SavedMap;
	selectedNode?: MindElixirNode | null;
	detailsEnabled?: boolean;
}

export function DetailsPanel({ map, selectedNode, detailsEnabled }: DetailsPanelProps) {
  const [newTag, setNewTag] = useState('');
	const [activeTab, setActiveTab] = useState<'article' | 'image' | 'sources' | 'diagram'>('article');
  const addTag = useMapsStore((s) => s.addTag);
  const removeTag = useMapsStore((s) => s.removeTag);

  const handleAddTag = () => {
    const trimmed = newTag.trim().toLowerCase();
    if (trimmed) {
      addTag(map.id, trimmed);
      setNewTag('');
    }
  };

		const sourcesMarkdown = (() => {
			const sources = map.sources ?? [];
			if (sources.length === 0) return '';
			const lines = sources.map((s) => {
				const meta = [s.author, s.year, s.type].filter(Boolean).join(' · ');
				const why = s.why ? ` — ${s.why}` : '';
				const url = s.url ? ` ([link](${s.url}))` : '';
				return `- **${s.title}**${meta ? ` (${meta})` : ''}${why}${url}`;
			});
			return `\n\n---\n\n## Fontes\n\n${lines.join('\n')}`;
		})();

		const articleMarkdown = (() => {
			const article = map.article ?? '';
			// Avoid duplicating if the LLM already produced a Fontes section.
			const hasFontes = /(^|\n)#{2,3}\s*fontes\b/i.test(article);
			if (!sourcesMarkdown || hasFontes) return article;
			return `${article}${sourcesMarkdown}`;
		})();

  return (
    <div className="flex flex-col h-full bg-card border-l border-border">
      {/* Header */}
      <div className="p-4 border-b border-border shrink-0">
        <h2 className="font-semibold text-sm text-foreground truncate" title={map.title}>
          {map.title}
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5 truncate" title={map.query}>
          {map.query}
        </p>
      </div>

			{/* Selected node + mode indicator */}
			<div className="p-4 border-b border-border shrink-0">
				<div className="flex items-center justify-between gap-2">
					<div className="text-xs font-medium text-muted-foreground">Definições / Detalhes</div>
					<span
						className={`text-[11px] px-2 py-0.5 rounded-full border ${
							(detailsEnabled ?? true)
								? 'bg-primary/10 text-primary border-primary/20'
								: 'bg-muted text-muted-foreground border-border'
						}`}
						title="Este toggle controla apenas a exibição (não reprocessa o LLM)"
					>
						{(detailsEnabled ?? true) ? 'Ligado' : 'Desligado'}
					</span>
				</div>
				<div className="mt-2">
					<div className="text-[11px] text-muted-foreground">Nó selecionado</div>
					<div
						className="text-xs font-medium text-foreground truncate"
						title={selectedNode?.topic ?? 'Nenhum'}
					>
						{selectedNode?.topic ?? 'Nenhum'}
					</div>
				</div>

				{selectedNode ? (
					<div className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">
						{(selectedNode.definition ?? selectedNode.note ?? '').trim() || 'Sem definição/detalhes para este nó.'}
					</div>
				) : (
					<div className="mt-2 text-xs text-muted-foreground">
						Selecione um nó no mapa para ver sua definição/detalhes aqui.
					</div>
				)}
			</div>

      {/* Tags */}
      <div className="p-4 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5 mb-2">
          <Tag className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Tags</span>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {map.tags.map((tag) => {
            const color = getTagColor(tag);
            return (
              <span
                key={tag}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${color.bg} ${color.text} ${color.border}`}
              >
                {tag}
                <button
                  onClick={() => removeTag(map.id, tag)}
                  className="hover:opacity-70 transition-opacity"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            );
          })}
          {map.tags.length === 0 && (
            <span className="text-xs text-muted-foreground">Nenhuma tag</span>
          )}
        </div>
        <div className="flex gap-1">
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
            placeholder="Adicionar tag..."
            className="h-7 text-xs"
          />
          <Button size="sm" variant="outline" onClick={handleAddTag} className="h-7 px-2">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border shrink-0">
        <button
          onClick={() => setActiveTab('article')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
            activeTab === 'article'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <FileText className="h-3.5 w-3.5" />
          Artigo
        </button>
        {map.imageUrl && (
          <button
            onClick={() => setActiveTab('image')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
              activeTab === 'image'
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ImageIcon className="h-3.5 w-3.5" />
            Imagem
          </button>
        )}
				{(map.sources?.length ?? 0) > 0 && (
					<button
						onClick={() => setActiveTab('sources')}
						className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
							activeTab === 'sources'
								? 'text-primary border-b-2 border-primary'
								: 'text-muted-foreground hover:text-foreground'
						}`}
					>
						<BookOpen className="h-3.5 w-3.5" />
						Fontes
					</button>
				)}
				{map.mermaid?.code && (
					<button
						onClick={() => setActiveTab('diagram')}
						className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
							activeTab === 'diagram'
								? 'text-primary border-b-2 border-primary'
								: 'text-muted-foreground hover:text-foreground'
						}`}
					>
						<Code className="h-3.5 w-3.5" />
						Diagrama
					</button>
				)}
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        {activeTab === 'article' && (
          <div className="p-4 prose prose-sm max-w-none dark:prose-invert">
	            <ReactMarkdown>{articleMarkdown}</ReactMarkdown>
          </div>
        )}
        {activeTab === 'image' && map.imageUrl && (
          <div className="p-4">
            <img
              src={map.imageUrl}
              alt={map.title}
              className="w-full rounded-lg border border-border"
            />
          </div>
        )}
				{activeTab === 'sources' && (map.sources?.length ?? 0) > 0 && (
					<div className="p-4 space-y-3">
						<div className="text-xs text-muted-foreground">
								Fontes sugeridas pelo template <span className="font-medium">Pensamento Profundo</span> e/ou pela ação <span className="font-medium">Detalhado</span>.
						</div>
						<ul className="space-y-2">
							{map.sources?.map((s, i) => (
								<li key={`${s.title}-${i}`} className="rounded-lg border border-border bg-card p-3">
									<div className="text-sm font-medium text-foreground/90">{s.title}</div>
									<div className="text-xs text-muted-foreground mt-0.5">
										{[s.author, s.year, s.type].filter(Boolean).join(' · ')}
									</div>
									{s.why ? <div className="text-xs text-muted-foreground mt-1">{s.why}</div> : null}
									{s.url ? (
										<a
											className="text-xs underline underline-offset-2 hover:opacity-80"
											href={s.url}
											target="_blank"
											rel="noreferrer"
										>
											{s.url}
										</a>
									) : null}
								</li>
							))}
						</ul>
					</div>
				)}
				{activeTab === 'diagram' && map.mermaid?.code && (
					<div className="p-4 space-y-3">
						<div className="flex items-center justify-between gap-2">
							<div>
								<div className="text-sm font-medium">Mermaid</div>
								<div className="text-xs text-muted-foreground">{map.mermaid.kind ?? 'diagram'}</div>
							</div>
							<Button
								size="sm"
								variant="outline"
								onClick={() => {
									try {
										void navigator.clipboard.writeText(map.mermaid?.code ?? '');
									} catch {
										// ignore
									}
								}}
							>
								Copiar
							</Button>
						</div>
						<pre className="text-xs rounded-lg border border-border bg-muted/40 p-3 overflow-auto">
							<code>{map.mermaid.code}</code>
						</pre>
					</div>
				)}
      </ScrollArea>
    </div>
  );
}

