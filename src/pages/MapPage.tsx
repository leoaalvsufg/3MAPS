import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Undo2, Redo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUndoRedo } from '@/lib/useUndoRedo';
import { MindMapCanvas, type MindMapCanvasHandle } from '@/components/generation/MindMapCanvas';
import { PostGenActions } from '@/components/generation/PostGenActions';
import { GraphCanvas } from '@/components/graphs/GraphCanvas';
import { DetailsPanel } from '@/components/layout/DetailsPanel';
import { ChatPanel } from '@/components/chat/ChatPanel';

// Lazy-load ExportDialog so jsPDF and html2canvas are only bundled when needed
const ExportDialog = lazy(() =>
  import('@/components/export/ExportDialog').then((m) => ({ default: m.ExportDialog }))
);
import { useMapsStore } from '@/stores/maps-store';
import { useSettingsStore } from '@/stores/settings-store';
import { parseJSON } from '@/services/llm/client';
import { callRoutedLLM } from '@/services/llm/routedClient';
		import { getNodeByNodeDetailedRefinementPrompt, getPostGenPrompt } from '@/services/llm/prompts';
		import type { DeepThoughtSource, GraphType, MindElixirData, MindElixirNode } from '@/types/mindmap';
import { FORMATO_PADRAO } from '@/types/formato';
import { normalizeMindElixirData } from '@/lib/normalizeMindElixirData';

export function MapPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const map = useMapsStore((s) => s.getMap(id ?? ''));
  const updateMap = useMapsStore((s) => s.updateMap);
  const loadMapFromServer = useMapsStore((s) => s.loadMapFromServer);
  const syncState = useMapsStore((s) => (id ? s.serverSyncById[id] : undefined));
  const settings = useSettingsStore();
  const username = useSettingsStore((s) => s.username);
	const exportTargetRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<MindMapCanvasHandle>(null);
  const [isLoading, setIsLoading] = useState(false);
 const postGenInFlightRef = useRef(false);
 const [activePostGenAction, setActivePostGenAction] = useState<
  'conciso' | 'detalhado' | 'traduzir' | 'regenerar' | null
 >(null);
  const [postGenError, setPostGenError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [showExport, setShowExport] = useState(false);
 const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const thumbnailGeneratedRef = useRef(false);

  // Undo/redo for mindElixirData edits
  const {
    state: undoRedoState,
    setState: pushUndoState,
    undo: undoEdit,
    redo: redoEdit,
    canUndo,
    canRedo,
  } = useUndoRedo<import('@/types/mindmap').MindElixirData | undefined>(map?.mindElixirData);

  // Sync undo/redo state back to the store when undo/redo is triggered
  const prevUndoRedoStateRef = useRef(undoRedoState);
  useEffect(() => {
    if (undoRedoState !== prevUndoRedoStateRef.current && undoRedoState && id) {
      prevUndoRedoStateRef.current = undoRedoState;
      updateMap(id, { mindElixirData: undoRedoState });
    }
  }, [undoRedoState, id, updateMap]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoEdit();
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        redoEdit();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undoEdit, redoEdit]);

	useEffect(() => {
		if (!id) return;
		void loadMapFromServer(id);
	}, [id, loadMapFromServer, username]);

  // Stable callback — used for export/thumbnail
  const handleReady = useCallback((element: HTMLElement) => {
    exportTargetRef.current = element;
    // Generate thumbnail once after a short delay to let the canvas render
    if (!thumbnailGeneratedRef.current) {
      thumbnailGeneratedRef.current = true;
      setTimeout(async () => {
        try {
          const container = exportTargetRef.current;
          if (!container) return;
          const { default: html2canvas } = await import('html2canvas');
          const canvas = await html2canvas(container, {
             backgroundColor: '#fefdfb',
            scale: 0.2,
            useCORS: true,
            logging: false,
          });
          // Prefer WebP if supported, fall back to JPEG
          const supportsWebP = canvas.toDataURL('image/webp').startsWith('data:image/webp');
          const format = supportsWebP ? 'image/webp' : 'image/jpeg';
          const MAX_THUMBNAIL_BYTES = 30 * 1024; // 30 KB
          let quality = 0.4;
          let thumbnail = canvas.toDataURL(format, quality);
          // If still too large, reduce quality further
          while (thumbnail.length > MAX_THUMBNAIL_BYTES && quality > 0.1) {
            quality = Math.max(0.1, quality - 0.1);
            thumbnail = canvas.toDataURL(format, quality);
          }
          useMapsStore.getState().updateMap(id ?? '', { thumbnail });
        } catch {
          // thumbnail generation is non-critical
        }
      }, 2000);
    }
  }, [id]); // Only depends on map ID

	const handlePostGenAction = async (action: 'conciso' | 'detalhado' | 'traduzir' | 'regenerar') => {
    if (!map || !map.analysis || !settings.hasAnyApiKey()) return;
		// Hard guard to avoid duplicate clicks / double-requests while processing.
		if (postGenInFlightRef.current) return;
		postGenInFlightRef.current = true;
		setPostGenError(null);
		setActivePostGenAction(action);
    setIsLoading(true);
    try {
			if (action === 'detalhado') {
					const scopeStartId = selectedNodeId && selectedNodeId !== 'root' ? selectedNodeId : null;
					const nodesForRefinement = buildNodesForDetailedRefinement(map.mindElixirData, scopeStartId);
					if (nodesForRefinement.length === 0) {
						setPostGenError('O mapa precisa ter pelo menos um nó (além do tema central) para usar Detalhado.');
						return;
					}
					const scopeAllowedIds = (() => {
						if (!scopeStartId) return undefined;
						const root = map.mindElixirData?.nodeData as MindElixirNode | undefined;
						if (!root) return undefined;
						const found = findNodeWithPath(root, scopeStartId);
						if (!found) return undefined;
						return collectSubtreeIds(found.node);
					})();
				const prompt = getNodeByNodeDetailedRefinementPrompt({
					centralTheme: map.analysis.central_theme,
					nodes: nodesForRefinement,
				});

				const result = await callRoutedLLM(
					'refine_detailed',
					[{ role: 'user', content: prompt }],
					{
						maxTokens: 6000,
						temperature: 0.35,
					}
				);

					const parsed = parseJSON<{
						edits?: Array<{
							id: string;
							rewrite_topic?: string;
							definition?: string;
							add_children?: Array<string | { topic: string; definition?: string }>;
						}>;
						sources_added?: DeepThoughtSource[];
					}>(result);
						const next = applyDetailedEdits(map.mindElixirData, parsed.edits ?? [], scopeAllowedIds);
					const mergedSources = mergeSources(map.sources, parsed.sources_added);
					updateMap(map.id, {
						mindElixirData: normalizeMindElixirData(next),
						...(mergedSources ? { sources: mergedSources } : {}),
					});
				return;
			}

	    const prompt = getPostGenPrompt(action, map.analysis);
	    const result = await callRoutedLLM(
	      'postgen',
	      [{ role: 'user', content: prompt }],
	      { maxTokens: 6000 }
	    );
	    const newData = normalizeMindElixirData(parseJSON<MindElixirData>(result));
	    updateMap(map.id, { mindElixirData: newData });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPostGenError(msg.length > 120 ? `${msg.slice(0, 120)}…` : msg);
      console.error('Post-gen action failed:', err);
    } finally {
      setIsLoading(false);
			setActivePostGenAction(null);
			postGenInFlightRef.current = false;
    }
  };

			function findNodeWithPath(root: MindElixirNode, targetId: string): { node: MindElixirNode; path: string } | null {
				const stack: Array<{ node: MindElixirNode; path: string }> = [{ node: root, path: root.topic ?? '' }];
				while (stack.length) {
					const cur = stack.pop();
					if (!cur) break;
					if (cur.node.id === targetId) return cur;
					for (const ch of cur.node.children ?? []) {
						stack.push({ node: ch, path: `${cur.path} > ${ch.topic ?? ''}` });
					}
				}
				return null;
			}

			function collectSubtreeIds(start: MindElixirNode): Set<string> {
				const ids = new Set<string>();
				const stack: MindElixirNode[] = [start];
				while (stack.length) {
					const n = stack.pop();
					if (!n) continue;
					ids.add(n.id);
					if (Array.isArray(n.children)) stack.push(...n.children);
				}
				return ids;
			}

			function findNodeById(root: MindElixirNode | undefined, targetId: string | null): MindElixirNode | null {
				if (!root || !targetId) return null;
				const stack: MindElixirNode[] = [root];
				while (stack.length) {
					const n = stack.pop();
					if (!n) continue;
					if (n.id === targetId) return n;
					if (Array.isArray(n.children)) stack.push(...n.children);
				}
				return null;
			}

			function buildNodesForDetailedRefinement(
				data: MindElixirData,
				startNodeId?: string | null
			): Array<{ id: string; topic: string; definition?: string; path: string; depth: number; childCount: number }> {
				const out: Array<{ id: string; topic: string; definition?: string; path: string; depth: number; childCount: number }> = [];
				const root = data?.nodeData as MindElixirNode | undefined;
				if (!root) return out;

				const safeStartId = startNodeId && startNodeId !== 'root' ? startNodeId : null;
				const start = safeStartId ? findNodeWithPath(root, safeStartId) : null;
				const startNode = start?.node ?? root;
				const startPath = start?.path ?? (root.topic ?? '');

				const queue: Array<{ node: MindElixirNode; path: string; depth: number }> = [
					{ node: startNode, path: startPath, depth: 0 },
				];
				while (queue.length && out.length < 40) {
					const item = queue.shift();
					if (!item) break;
					const { node, path, depth } = item;
					const children = Array.isArray(node.children) ? node.children : [];

					if (node.id && node.id !== 'root') {
						out.push({
							id: node.id,
							topic: node.topic ?? '',
							definition: (node.definition ?? node.note) || undefined,
							path,
							depth,
							childCount: children.length,
						});
					}
					for (const child of children) {
						queue.push({ node: child, path: `${path} > ${child.topic}`, depth: depth + 1 });
					}
				}
				return out;
			}

		function applyDetailedEdits(
			data: MindElixirData,
			edits: Array<{
				id: string;
				rewrite_topic?: string;
				definition?: string;
				add_children?: Array<string | { topic: string; definition?: string }>;
				}>,
			allowedIds?: Set<string>
		): MindElixirData {
		const next = JSON.parse(JSON.stringify(data)) as MindElixirData;
		const root = next?.nodeData as MindElixirNode | undefined;
		if (!root) return next;

		const byId = new Map<string, MindElixirNode>();
		const stack: MindElixirNode[] = [root];
		while (stack.length) {
			const n = stack.pop();
			if (!n) continue;
			byId.set(n.id, n);
			if (Array.isArray(n.children)) stack.push(...n.children);
		}

		const used = new Set(byId.keys());
		const makeId = () => {
			let id = '';
			do {
				id = `node_${Math.random().toString(36).slice(2, 10)}`;
			} while (used.has(id));
			used.add(id);
			return id;
		};

			for (const e of edits) {
				if (allowedIds && !allowedIds.has(e.id)) continue;
			const node = byId.get(e.id);
			if (!node) continue;

			if (typeof e.rewrite_topic === 'string' && e.rewrite_topic.trim()) {
				node.topic = e.rewrite_topic.trim().slice(0, 55);
			}

				if (typeof e.definition === 'string') {
					const def = e.definition.replace(/\s+/g, ' ').trim();
					if (def) node.definition = def.slice(0, 240);
				}

				if (Array.isArray(e.add_children) && e.add_children.length) {
				node.children = Array.isArray(node.children) ? node.children : [];
					for (const raw of e.add_children.slice(0, 4)) {
						const t = typeof raw === 'string' ? raw : raw?.topic;
						const topic = (t ?? '').trim();
						if (!topic) continue;
						const child: MindElixirNode = { id: makeId(), topic: topic.slice(0, 55) };
						if (typeof raw === 'object' && raw && typeof raw.definition === 'string') {
							const cdef = raw.definition.replace(/\s+/g, ' ').trim();
							if (cdef) child.definition = cdef.slice(0, 240);
						}
					node.children.push(child);
					byId.set(child.id, child);
				}
			}
		}

		return next;
	}

		function mergeSources(existing: DeepThoughtSource[] | undefined, added: DeepThoughtSource[] | undefined): DeepThoughtSource[] | undefined {
			const safeExisting = Array.isArray(existing) ? existing : [];
			const safeAdded = Array.isArray(added) ? added : [];
			if (safeExisting.length === 0 && safeAdded.length === 0) return undefined;

			const keyOf = (s: DeepThoughtSource) => (s.url?.trim() || s.title.trim()).toLowerCase();
			const byKey = new Map<string, DeepThoughtSource>();
			for (const s of safeExisting) {
				if (!s?.title?.trim()) continue;
				byKey.set(keyOf(s), s);
			}
			for (const s of safeAdded) {
				if (!s?.title?.trim()) continue;
				const k = keyOf(s);
				const prev = byKey.get(k);
				byKey.set(k, { ...prev, ...s, title: s.title.trim() });
			}
			return Array.from(byKey.values());
		}

  const handleExport = () => {
    setShowExport(true);
  };

  const handleChat = () => {
    setShowChat((v) => !v);
    if (showDetails) setShowDetails(false);
  };


	if (!map && syncState?.status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <p className="text-muted-foreground">Carregando mapa...</p>
      </div>
    );
  }

	if (!map && syncState?.status === 'error') {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-4 px-6">
				<p className="text-muted-foreground text-center">
					Não foi possível carregar este mapa do servidor. {syncState.error ? `(${syncState.error})` : ''}
				</p>
				<div className="flex items-center gap-2">
					<Button variant="outline" onClick={() => id && void loadMapFromServer(id)}>
						Tentar novamente
					</Button>
					<Button variant="ghost" onClick={() => navigate('/')}>
						Voltar ao início
					</Button>
				</div>
			</div>
		);
	}

  if (!map) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-muted-foreground">Mapa não encontrado.</p>
        <Button variant="outline" onClick={() => navigate('/')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar ao início
        </Button>
      </div>
    );
  }

	const graphType: GraphType = (map.graphType ?? 'mindmap');
	const handleGraphTypeChange = (type: GraphType) => {
		updateMap(map.id, { graphType: type });
			if (type !== 'mindmap') exportTargetRef.current = null;
			if (type !== 'mindmap') setSelectedNodeId(null);
	};

	const detailsEnabled = map.detailsEnabled ?? true;
	const formato = map.formato ?? FORMATO_PADRAO;
	const selectedNode = findNodeById(map.mindElixirData?.nodeData as MindElixirNode | undefined, selectedNodeId);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card shrink-0">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="gap-1.5 h-8">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Início</span>
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold truncate">{map.title}</h1>
          </div>
				{syncState?.status === 'loading' && (
					<span className="text-xs text-muted-foreground hidden sm:inline">Sincronizando...</span>
				)}
				{syncState?.status === 'error' && syncState.error && (
					<span className="text-xs text-destructive truncate max-w-[280px] hidden sm:inline" title={syncState.error}>
						Offline: {syncState.error}
					</span>
				)}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={undoEdit}
              disabled={!canUndo}
              title="Desfazer (Ctrl+Z)"
              aria-label="Desfazer"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={redoEdit}
              disabled={!canRedo}
              title="Refazer (Ctrl+Shift+Z)"
              aria-label="Refazer"
            >
              <Redo2 className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDetails((v) => !v)}
            className="text-xs h-8 hidden lg:flex"
          >
            {showDetails ? 'Ocultar detalhes' : 'Ver detalhes'}
          </Button>
        </div>

        {/* Post-gen actions */}
        <div className="px-4 py-2 shrink-0">
          <PostGenActions
            onConcise={() => handlePostGenAction('conciso')}
            onDetailed={() => handlePostGenAction('detalhado')}
            onTranslate={() => handlePostGenAction('traduzir')}
            onRegenerate={() => handlePostGenAction('regenerar')}
            onReorganize={() => canvasRef.current?.reorganize?.()}
            onExport={handleExport}
            onChat={handleChat}
				graphType={graphType}
				onGraphTypeChange={handleGraphTypeChange}
					detailsEnabled={detailsEnabled}
					onDetailsEnabledChange={(enabled) => updateMap(map.id, { detailsEnabled: enabled })}
					formato={formato}
					onFormatoChange={(f) => updateMap(map.id, { formato: f })}
            isLoading={isLoading}
				activeAction={activePostGenAction ?? undefined}
				error={postGenError}
          />
        </div>

        {/* Canvas */}
	      <div className="flex-1 overflow-hidden bg-muted/30">
				{graphType === 'mindmap' ? (
						<MindMapCanvas
							ref={canvasRef}
							data={map.mindElixirData}
							onReady={handleReady}
							onChange={(next) => {
								pushUndoState(next);
								updateMap(map.id, { mindElixirData: next });
							}}
							onSelectionChange={setSelectedNodeId}
							detailsEnabled={detailsEnabled}
							formato={formato}
						/>
				) : (
					<GraphCanvas graphType={graphType} data={map.mindElixirData} />
				)}
	      </div>
      </div>

      {/* Details panel */}
      {showDetails && !showChat && (
        <div className="w-80 shrink-0 hidden lg:flex flex-col overflow-hidden">
	          <DetailsPanel map={map} selectedNode={selectedNode} detailsEnabled={detailsEnabled} />
        </div>
      )}

      {/* Chat panel */}
      {showChat && (
        <div className="w-80 shrink-0 hidden lg:flex flex-col overflow-hidden">
          <ChatPanel map={map} onClose={() => setShowChat(false)} />
        </div>
      )}

      {/* Export dialog — lazy loaded so jsPDF/html2canvas only load on demand */}
      <Suspense fallback={null}>
        <ExportDialog
          open={showExport}
          onClose={() => setShowExport(false)}
          map={map}
          mindElixirInstance={null}
          exportTarget={exportTargetRef.current}
          viewportElement={canvasRef.current?.getViewportElement() ?? null}
          flowInstance={canvasRef.current?.getFlowInstance() ?? null}
        />
      </Suspense>
    </div>
  );
}

