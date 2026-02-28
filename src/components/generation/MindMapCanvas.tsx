import '@xyflow/react/dist/style.css';
import './mindmapFlow.css';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
		BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  applyNodeChanges,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
  type OnNodesChange,
  type ReactFlowInstance,
} from '@xyflow/react';
import { Plus, Trash2, Smile, X } from 'lucide-react';
import { normalizeMindElixirData } from '@/lib/normalizeMindElixirData';
import type { MindElixirData, MindElixirNode } from '@/types/mindmap';

interface MindMapCanvasProps {
  data: MindElixirData;
  /**
   * Called when the underlying DOM element that represents the canvas is ready.
   * Used for export/thumbnail.
   */
  onReady?: (element: HTMLElement) => void;
  /**
   * Called when the user edits the mindmap structure (topic/add/remove).
   * Use it to persist in the offline-first store.
   */
  onChange?: (next: MindElixirData) => void;
	/** Called whenever the currently selected node changes (or is cleared). */
	onSelectionChange?: (id: string | null) => void;
	/**
	 * Controls display of node definitions/details.
	 * - true: show definitions for all nodes
	 * - false: show definitions only for the selected node
	 */
	detailsEnabled?: boolean;
}

type MindmapActions = {
  updateTopic: (id: string, topic: string) => void;
  updateIcons: (id: string, icons: string[]) => void;
  addChild: (parentId: string) => void;
  deleteNode: (id: string) => void;
};

const MindmapActionsContext = createContext<MindmapActions | null>(null);

function useMindmapActions(): MindmapActions {
  const ctx = useContext(MindmapActionsContext);
  if (!ctx) throw new Error('MindmapActionsContext not found');
  return ctx;
}

type MindmapNodeData = {
  label: string;
	definition?: string;
	showDefinition?: boolean;
	icons?: string[];
	hyperLink?: string;
	thumbnailUrl?: string;
	isRoot?: boolean;
};

const EMOJI_QUICK_PICK = ['📌', '🎯', '✅', '❌', '💡', '⭐', '📝', '🔗', '📎', '📁', '🗂️', '💼', '📊', '🔒', '⚡', '🔥', '💬', '🧩', '🎨', '🌟'];

function MindmapNode({ id, data, selected }: NodeProps<Node<MindmapNodeData>>) {
  const { updateTopic, updateIcons, addChild, deleteNode } = useMindmapActions();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(data.label);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const iconPickerRef = useRef<HTMLDivElement>(null);
  const icon = (data.icons ?? [])[0] ?? null; // Apenas 1 ícone por nó

  useEffect(() => {
    if (!isEditing) setDraft(data.label);
  }, [data.label, isEditing]);

  useEffect(() => {
    if (!showIconPicker) return;
    const handleClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (iconPickerRef.current?.contains(el)) return;
      setShowIconPicker(false);
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [showIconPicker]);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== data.label) updateTopic(id, next);
    setIsEditing(false);
  };

  return (
    <div
      className="mindmap-node"
      data-selected={selected}
      data-root={id === 'root'}
      onDoubleClick={() => setIsEditing(true)}
    >
      {/* Handles for left/right connections */}
      <Handle id="l" type="source" position={Position.Left} style={{ opacity: 0 }} />
      <Handle id="r" type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Handle id="tl" type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle id="tr" type="target" position={Position.Right} style={{ opacity: 0 }} />

      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') {
                  setDraft(data.label);
                  setIsEditing(false);
                }
              }}
              className="mindmap-node__input"
            />
          ) : (
	            <>
	              {(data.isRoot && data.thumbnailUrl) ? (
	                <a
	                  href={data.hyperLink ?? data.thumbnailUrl}
	                  target="_blank"
	                  rel="noreferrer"
	                  onClick={(e) => e.stopPropagation()}
	                  className="mb-2 block"
	                  title="Abrir vídeo no YouTube"
	                >
	                  <img
	                    src={data.thumbnailUrl}
	                    alt="Thumbnail do vídeo"
	                    className="h-20 w-36 rounded-md border border-border object-cover"
	                  />
	                </a>
	              ) : null}
	              <div className="flex items-center gap-1.5 flex-wrap">
	                {icon && (
	                  <span className="shrink-0 text-base leading-none" aria-hidden>{icon}</span>
	                )}
	                <div className="mindmap-node__label min-w-0" title={data.label}>
	                  {data.label}
	                </div>
	              </div>
								{(data.isRoot && data.hyperLink) ? (
									<a
										href={data.hyperLink}
										target="_blank"
										rel="noreferrer"
										onClick={(e) => e.stopPropagation()}
										className="mt-1 block text-xs text-primary underline underline-offset-2 break-all"
										title="Abrir vídeo no YouTube"
									>
										{data.hyperLink}
									</a>
								) : null}
							{(id !== 'root' && data.definition && data.showDefinition) ? (
							<div className="mindmap-node__definition" title={data.definition}>
								{data.definition}
							</div>
						) : null}
	            </>
          )}
        </div>

        {selected && (
          <div className="mindmap-node__actions flex items-center gap-1 shrink-0">
            <div className="relative flex items-center gap-0.5">
              <button
                className={`mindmap-node__action flex items-center justify-center min-w-[28px] ${icon ? 'text-lg' : ''}`}
                title={icon ? 'Alterar ou remover ícone' : 'Adicionar ícone'}
                onClick={() => setShowIconPicker((v) => !v)}
                aria-label={icon ? 'Alterar ícone' : 'Adicionar ícone'}
                aria-expanded={showIconPicker}
              >
                {icon ?? <Smile className="h-4 w-4" />}
              </button>
              {icon && (
                <button
                  className="mindmap-node__action p-0.5 hover:bg-destructive/20 hover:text-destructive rounded"
                  title="Remover ícone"
                  onClick={() => {
                    updateIcons(id, []);
                    setShowIconPicker(false);
                  }}
                  aria-label="Remover ícone"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              {showIconPicker && (
                <div
                  ref={iconPickerRef}
                  className="absolute top-full left-0 mt-1.5 z-50 p-3 rounded-xl border border-border bg-popover shadow-xl min-w-[220px]"
                  role="listbox"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="grid grid-cols-5 gap-2 w-full">
                    {EMOJI_QUICK_PICK.map((emoji, i) => (
                      <button
                        key={i}
                        type="button"
                        className={`min-w-[36px] min-h-[36px] w-9 h-9 flex items-center justify-center text-xl rounded-lg transition-colors shrink-0 ${
                          icon === emoji ? 'bg-primary/20 ring-2 ring-primary/40' : 'hover:bg-muted/80 active:scale-95'
                        }`}
                        onClick={() => {
                          updateIcons(id, [emoji]);
                          setShowIconPicker(false);
                        }}
                        title={emoji}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="w-full mt-3 py-2 text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                    onClick={() => {
                      updateIcons(id, []);
                      setShowIconPicker(false);
                    }}
                  >
                    Remover ícone
                  </button>
                </div>
              )}
            </div>
            <button
              className="mindmap-node__action"
              title="Adicionar filho"
              onClick={() => addChild(id)}
              aria-label="Adicionar filho"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              className="mindmap-node__action"
              title="Remover nó"
              onClick={() => deleteNode(id)}
              disabled={id === 'root'}
              aria-label="Remover nó"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = {
  mindmapNode: MindmapNode,
};

const LEFT = 0 as const;
const RIGHT = 1 as const;

function deepCloneNode(n: MindElixirNode): MindElixirNode {
  return {
    ...n,
    children: (n.children ?? []).map(deepCloneNode),
  };
}

function updateNodeById(root: MindElixirNode, id: string, updater: (n: MindElixirNode) => MindElixirNode): [MindElixirNode, boolean] {
  if (root.id === id) return [updater({ ...root, children: (root.children ?? []).map(deepCloneNode) }), true];
  const children = root.children ?? [];
  let changed = false;
  const nextChildren = children.map((c) => {
    const [next, did] = updateNodeById(c, id, updater);
    if (did) changed = true;
    return next;
  });
  return changed ? [{ ...root, children: nextChildren }, true] : [root, false];
}

function removeNodeById(root: MindElixirNode, id: string): [MindElixirNode, boolean] {
  if (id === 'root') return [root, false];
  const children = root.children ?? [];
  let changed = false;
  const kept: MindElixirNode[] = [];
  for (const c of children) {
    if (c.id === id) {
      changed = true;
      continue;
    }
    const [next, did] = removeNodeById(c, id);
    if (did) changed = true;
    kept.push(next);
  }
  return changed ? [{ ...root, children: kept }, true] : [root, false];
}

function nextChildTopic(parent: MindElixirNode): string {
  const n = (parent.children ?? []).length + 1;
  return `Novo tópico ${n}`;
}

function buildLayout(
  root: MindElixirNode,
  opts?: { showAllDetails?: boolean; selectedId?: string | null; nodePositions?: Record<string, { x: number; y: number }> }
): { nodes: Node<MindmapNodeData>[]; edges: Edge[] } {
  const X_SPACING = 280;
  const Y_SPACING = 84;
  const GAP_UNITS = 1;
  /** Extra height units for nodes that will display a definition */
  const DEF_EXTRA = 0.7;

  const showAll = opts?.showAllDetails ?? true;
  const selId = opts?.selectedId ?? null;
  const nodePositions = opts?.nodePositions ?? {};

  const safeRoot = deepCloneNode(root);
  const heights = new Map<string, number>();

  /** Returns true when the node will visually show its definition */
  const willShowDef = (n: MindElixirNode): boolean => {
    if (n.id === 'root' || !n.definition) return false;
    return showAll || n.id === selId;
  };

  const measure = (n: MindElixirNode): number => {
    const children = n.children ?? [];
    const selfH = 1 + (willShowDef(n) ? DEF_EXTRA : 0);
    if (children.length === 0) {
      heights.set(n.id, selfH);
      return selfH;
    }
    let sum = 0;
    for (const c of children) sum += measure(c);
    const total = Math.max(selfH, sum + GAP_UNITS * (children.length - 1));
    heights.set(n.id, total);
    return total;
  };

  measure(safeRoot);

  const nodes: Node<MindmapNodeData>[] = [];
  const edges: Edge[] = [];

  const addNode = (n: MindElixirNode, x: number, y: number) => {
    const pos = nodePositions[n.id] ?? { x, y };
    nodes.push({
      id: n.id,
      type: 'mindmapNode',
      position: pos,
      draggable: n.id !== 'root',
      data: {
        label: n.topic,
        definition: n.definition || undefined,
        icons: n.icons ?? [],
        hyperLink: n.hyperLink || undefined,
        thumbnailUrl: n.thumbnailUrl || undefined,
        isRoot: n.id === 'root',
      },
    });
  };

  addNode(safeRoot, 0, 0);

  const leftChildren = (safeRoot.children ?? []).filter((c) => (c.direction ?? RIGHT) === LEFT);
  const rightChildren = (safeRoot.children ?? []).filter((c) => (c.direction ?? RIGHT) === RIGHT);

  const totalHeight = (arr: MindElixirNode[]) =>
    arr.reduce((acc, c) => acc + (heights.get(c.id) ?? 1), 0) + (arr.length > 0 ? GAP_UNITS * (arr.length - 1) : 0);

  const leftTotal = totalHeight(leftChildren);
  const rightTotal = totalHeight(rightChildren);

  const layoutSubtree = (parent: MindElixirNode, n: MindElixirNode, depth: number, yTopUnits: number, side: typeof LEFT | typeof RIGHT) => {
    const h = heights.get(n.id) ?? 1;
    const yCenterUnits = yTopUnits + h / 2;
    const x = (side === RIGHT ? 1 : -1) * depth * X_SPACING;
    const y = yCenterUnits * Y_SPACING;
    addNode(n, x, y);

    const sourceHandle = side === RIGHT ? 'r' : 'l';
    const targetHandle = side === RIGHT ? 'tl' : 'tr';

    edges.push({
      id: `${parent.id}->${n.id}`,
      source: parent.id,
      target: n.id,
      type: 'smoothstep',
      sourceHandle,
      targetHandle,
    });

    const children = n.children ?? [];
    let cur = yTopUnits;
    for (const c of children) {
      const ch = heights.get(c.id) ?? 1;
      layoutSubtree(n, c, depth + 1, cur, side);
      cur += ch + GAP_UNITS;
    }
  };

  // Center both sides around y=0 to keep the root centered.
  let curRight = -rightTotal / 2;
  for (const c of rightChildren) {
    const ch = heights.get(c.id) ?? 1;
    layoutSubtree(safeRoot, c, 1, curRight, RIGHT);
    curRight += ch + GAP_UNITS;
  }
  let curLeft = -leftTotal / 2;
  for (const c of leftChildren) {
    const ch = heights.get(c.id) ?? 1;
    layoutSubtree(safeRoot, c, 1, curLeft, LEFT);
    curLeft += ch + GAP_UNITS;
  }

  return { nodes, edges };
}

export function MindMapCanvas({ data, onReady, onChange, onSelectionChange, detailsEnabled }: MindMapCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const safeData = useMemo(() => normalizeMindElixirData(data), [data]);

  // Keep selection state stable across re-layout.
  const [selectedId, setSelectedId] = useState<string | null>(null);

	useEffect(() => {
		onSelectionChange?.(selectedId);
	}, [onSelectionChange, selectedId]);

	const showAllDetails = detailsEnabled ?? true;

  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(() => {
    return buildLayout(safeData.nodeData, {
      showAllDetails,
      selectedId,
      nodePositions: safeData.nodePositions,
    });
  }, [safeData, showAllDetails, selectedId]);
  const nodes = useMemo(() => {
		return layoutNodes.map((n) => {
			const isSelected = selectedId === n.id;
			return {
				...n,
				selected: isSelected,
				data: {
					...(n.data as MindmapNodeData),
					showDefinition: showAllDetails ? true : isSelected,
				},
			};
		});
	}, [layoutNodes, selectedId, showAllDetails]);
  const edges = useMemo(() => {
    return layoutEdges.map((e) => {
      const isConnected = selectedId ? e.source === selectedId || e.target === selectedId : false;
      return {
        ...e,
        animated: isConnected,
        style: {
          stroke: isConnected ? 'var(--mm-edge-selected)' : 'var(--mm-edge)',
          strokeWidth: isConnected ? 2.2 : 1.6,
        },
      };
    });
  }, [layoutEdges, selectedId]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      const next = applyNodeChanges(changes, nodes);
      const selected = next.find((n) => n.selected);
      setSelectedId(selected?.id ?? null);

      const positionChanges = changes.filter(
        (c): c is { type: 'position'; id: string } =>
          c.type === 'position' && 'id' in c && c.id !== 'root'
      );
      if (positionChanges.length > 0 && onChange) {
        const nextPositions = { ...(safeData.nodePositions ?? {}) };
        for (const n of next) {
          if (n.id !== 'root' && positionChanges.some((pc) => pc.id === n.id)) {
            nextPositions[n.id] = n.position;
          }
        }
        onChange(normalizeMindElixirData({ ...safeData, nodePositions: nextPositions }));
      }
    },
    [nodes, onChange, safeData]
  );

  const actions = useMemo<MindmapActions>(() => {
    return {
      updateTopic: (id, topic) => {
        const root = safeData.nodeData;
        const [nextRoot, changed] = updateNodeById(root, id, (n) => ({ ...n, topic }));
        if (!changed) return;
        onChange?.(normalizeMindElixirData({ ...safeData, nodeData: nextRoot }));
      },
      updateIcons: (id, icons) => {
        const root = safeData.nodeData;
        const [nextRoot, changed] = updateNodeById(root, id, (n) => ({ ...n, icons }));
        if (!changed) return;
        onChange?.(normalizeMindElixirData({ ...safeData, nodeData: nextRoot }));
      },
      addChild: (parentId) => {
        const root = safeData.nodeData;
        const [nextRoot, changed] = updateNodeById(root, parentId, (p) => {
          const nextChildren = [...(p.children ?? [])];
          const newNode: MindElixirNode = {
            id: `node_${Math.random().toString(36).slice(2, 10)}`,
            topic: nextChildTopic(p),
            children: [],
          };
          // If adding directly under root, keep explicit direction for stable side distribution.
          if (p.id === 'root') {
            const idx = nextChildren.length;
            newNode.direction = idx % 2 === 0 ? RIGHT : LEFT;
          }
          nextChildren.push(newNode);
          return { ...p, children: nextChildren };
        });
        if (!changed) return;
        onChange?.(normalizeMindElixirData({ ...safeData, nodeData: nextRoot }));
      },
      deleteNode: (id) => {
        const root = safeData.nodeData;
        const [nextRoot, changed] = removeNodeById(root, id);
        if (!changed) return;
        if (selectedId === id) setSelectedId(null);
        onChange?.(normalizeMindElixirData({ ...safeData, nodeData: nextRoot }));
      },
    };
  }, [onChange, safeData, selectedId]);

  const [instance, setInstance] = useState<ReactFlowInstance | null>(null);
  const didInitialFitRef = useRef(false);
  const lastLayoutFingerprintRef = useRef('');

  // Build a lightweight fingerprint of the layout so we can detect content changes
  // (e.g. definitions added by "Detalhado") even when the node count stays the same.
  const layoutFingerprint = useMemo(() => {
    return layoutNodes
      .map((n) => `${n.id}:${(n.data as MindmapNodeData).label}:${(n.data as MindmapNodeData).definition ?? ''}`)
      .join('|');
  }, [layoutNodes]);

  useEffect(() => {
    if (!wrapperRef.current) return;
    onReadyRef.current?.(wrapperRef.current);
  }, []);

  useEffect(() => {
    if (!instance) return;
    const shouldFit = !didInitialFitRef.current || layoutFingerprint !== lastLayoutFingerprintRef.current;
    if (!shouldFit) return;
    didInitialFitRef.current = true;
    lastLayoutFingerprintRef.current = layoutFingerprint;
    // Let DOM settle before fitting.
    requestAnimationFrame(() => {
      try {
        instance.fitView({ padding: 0.2, duration: 250 });
      } catch {
        // ignore
      }
    });
  }, [instance, layoutFingerprint]);

  return (
    <div
      ref={wrapperRef}
      className="mindmap-flow w-full h-full"
      style={{ minHeight: 600 }}
      role="img"
      aria-label={`Mapa mental: ${safeData.nodeData?.topic ?? 'Mapa mental'}`}
      tabIndex={0}
    >
      <MindmapActionsContext.Provider value={actions}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
					onPaneClick={() => setSelectedId(null)}
          onInit={setInstance}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable
          fitView
          proOptions={{ hideAttribution: true }}
        >
	          <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--mm-dot)" />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </MindmapActionsContext.Provider>
    </div>
  );
}

