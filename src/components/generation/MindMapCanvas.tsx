import '@xyflow/react/dist/style.css';
import './mindmapFlow.css';

import type { CSSProperties } from 'react';
import { createContext, forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
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
  type OnNodeDragStop,
  type ReactFlowInstance,
} from '@xyflow/react';
import { Plus, Trash2, ImageIcon } from 'lucide-react';
import { IconSelector } from '@/components/nodes/IconSelector';
import { normalizeMindElixirData } from '@/lib/normalizeMindElixirData';
import { getColorsForLevel } from '@/lib/formatoThemes';
import {
  estimateNodeDimensions,
  resolveOverlaps,
  getLayoutedElements,
} from '@/lib/mindmapLayout';
import { FORMATO_PADRAO, type NodeShape, type LevelColors } from '@/types/formato';
import type { MindElixirData, MindElixirNode } from '@/types/mindmap';

function getNodeStyle(
  shape: NodeShape,
  colors: LevelColors,
  level: number,
  showDescription: boolean
): CSSProperties {
  const base: React.CSSProperties = {
    color: colors.text,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  };
  const isRoot = level === 0;
  switch (shape) {
    case 'classic':
      return { ...base, borderRadius: 6, borderWidth: 2, borderStyle: 'solid', padding: '12px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' };
    case 'pill':
      return { ...base, borderRadius: showDescription ? 20 : 50, borderWidth: 2, borderStyle: 'solid', padding: showDescription ? '12px 22px' : '10px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
    case 'glass':
      return { ...base, borderRadius: 12, borderWidth: 1, borderStyle: 'solid', padding: '12px 18px', boxShadow: `0 4px 16px ${colors.border}33`, backdropFilter: 'blur(8px)' };
    case 'neon':
      return { color: colors.accent, backgroundColor: '#1a1a2e', borderColor: colors.accent, borderRadius: 8, borderWidth: 2, borderStyle: 'solid', padding: '12px 18px', boxShadow: `0 0 12px ${colors.accent}80, 0 0 4px ${colors.accent}4D` };
    case 'flat':
      return { ...base, borderRadius: 8, border: 'none', padding: '12px 18px', boxShadow: '0 2px 6px rgba(0,0,0,0.1)', backgroundColor: isRoot ? colors.accent : colors.bg, color: isRoot ? '#fff' : colors.text };
    case 'outline':
      return { ...base, borderRadius: 8, borderWidth: 2, borderStyle: 'solid', padding: '12px 18px', backgroundColor: isRoot ? `${colors.accent}10` : '#fff' };
    case 'card':
      return { ...base, borderRadius: 12, border: 'none', padding: '14px 20px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', backgroundColor: '#ffffff', borderLeft: `4px solid ${isRoot ? colors.accent : colors.border}` };
    case 'tag':
      return { ...base, borderRadius: 4, borderWidth: 1.5, borderStyle: 'solid', padding: '6px 14px', fontSize: '0.9em', letterSpacing: '0.3px' };
    default:
      return { ...base, borderRadius: 6, borderWidth: 2, borderStyle: 'solid', padding: '12px 18px' };
  }
}

export interface MindMapCanvasHandle {
  fitView: () => void;
  reorganize: () => void;
  getViewportElement: () => HTMLElement | null;
  getFlowInstance: () => ReactFlowInstance | null;
}

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
	/** Configuração visual (nodeShape, colorTheme, edgeType, layout). */
	formato?: import('@/types/formato').FormatoConfig;
}

type MindmapActions = {
  updateTopic: (id: string, topic: string) => void;
  addChild: (parentId: string) => void;
  deleteNode: (id: string) => void;
  updateNodeIcons: (id: string, icons: string[]) => void;
};

const MindmapActionsContext = createContext<MindmapActions | null>(null);

function useMindmapActions(): MindmapActions {
  const ctx = useContext(MindmapActionsContext);
  if (!ctx) throw new Error('MindmapActionsContext not found');
  return ctx;
}

export type MindmapNodeData = {
  label: string;
  definition?: string;
  showDefinition?: boolean;
  level?: number;
  nodeShape?: import('@/types/formato').NodeShape;
  colorTheme?: import('@/types/formato').ColorTheme;
  icons?: string[];
};

type MindmapNodeWithMeasured = Node<MindmapNodeData> & {
  measured?: { width: number; height: number };
};

function MindmapNode({ id, data, selected }: NodeProps<Node<MindmapNodeData>>) {
  const { updateTopic, addChild, deleteNode, updateNodeIcons } = useMindmapActions();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(data.label);
  const level = data.level ?? 0;
  const theme = data.colorTheme ?? 'oceano';
  const shape = data.nodeShape ?? 'classic';
  const colors = getColorsForLevel(theme, level);

  useEffect(() => {
    if (!isEditing) setDraft(data.label);
  }, [data.label, isEditing]);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== data.label) updateTopic(id, next);
    setIsEditing(false);
  };

  const isRoot = id === 'root';
  const showDef = isRoot ? false : (data.definition && data.showDefinition);
  const nodeStyle = getNodeStyle(shape, colors, level, showDef);

  return (
    <div
      className="mindmap-node"
      data-selected={selected}
      data-root={isRoot}
      data-shape={shape}
      data-theme={theme}
      style={nodeStyle}
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
	              <div className="flex items-center gap-2 min-w-0">
	                {(data.icons ?? []).length > 0 && (
	                  <span className="mindmap-node__icons shrink-0 text-base">
	                    {(data.icons ?? []).slice(0, 2).join(' ')}
	                  </span>
	                )}
	                <div className="mindmap-node__label min-w-0" title={data.label}>
	                  {data.label}
	                </div>
	            </div>
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
            <IconSelector
              value={data.icons ?? []}
              onChange={(icons) => updateNodeIcons(id, icons)}
              trigger={
                <button
                  className="mindmap-node__action"
                  title="Propor ícone"
                  aria-label="Propor ícone"
                >
                  <ImageIcon className="h-4 w-4" />
                </button>
              }
            />
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

const EDGE_TYPE_MAP: Record<import('@/types/formato').EdgeType, string> = {
  bezier: 'default',
  'smooth-step': 'smoothstep',
  straight: 'straight',
  organic: 'smoothstep',
  angular: 'step',
  elbow: 'step',
};

function buildLayout(
  root: MindElixirNode,
  opts?: {
    showAllDetails?: boolean;
    formato?: import('@/types/formato').FormatoConfig;
  }
): { nodes: Node<MindmapNodeData>[]; edges: Edge[] } {
  const X_SPACING = 360;
  const Y_SPACING = 84;
  const GAP_UNITS = 1;
  /** Extra height units for nodes that will display a definition */
  const DEF_EXTRA = 0.7;

  const showAll = opts?.showAllDetails ?? true;
  const formato = opts?.formato ?? FORMATO_PADRAO;

  const safeRoot = deepCloneNode(root);
  const heights = new Map<string, number>();

  /** Returns true when the node will visually show its definition (for layout measure). Use showAll only so layout is stable when selecting. */
  const willShowDef = (n: MindElixirNode): boolean => {
    if (n.id === 'root' || !n.definition) return false;
    return showAll;
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

  const addNode = (n: MindElixirNode, x: number, y: number, level: number, nodeRef: Node<MindmapNodeData>[]) => {
    const node: Node<MindmapNodeData> = {
      id: n.id,
      type: 'mindmapNode',
      position: { x, y },
      data: {
        label: n.topic,
        definition: n.definition || undefined,
        level,
        nodeShape: formato.nodeShape,
        colorTheme: formato.colorTheme,
        ...(n.icons && n.icons.length > 0 ? { icons: [...n.icons] } : {}),
      },
    };
    const measured = estimateNodeDimensions(node, showAll ? 'detailed' : 'compact');
    (node as MindmapNodeWithMeasured).measured = measured;
    nodeRef.push(node);
  };

  addNode(safeRoot, 0, 0, 0, nodes);

  const leftChildren = (safeRoot.children ?? []).filter((c) => (c.direction ?? RIGHT) === LEFT);
  const rightChildren = (safeRoot.children ?? []).filter((c) => (c.direction ?? RIGHT) === RIGHT);

  const totalHeight = (arr: MindElixirNode[]) =>
    arr.reduce((acc, c) => acc + (heights.get(c.id) ?? 1), 0) + (arr.length > 0 ? GAP_UNITS * (arr.length - 1) : 0);

  const leftTotal = totalHeight(leftChildren);
  const rightTotal = totalHeight(rightChildren);

  const edgeType = EDGE_TYPE_MAP[formato.edgeType] ?? 'default';

  const layoutSubtree = (parent: MindElixirNode, n: MindElixirNode, depth: number, yTopUnits: number, side: typeof LEFT | typeof RIGHT) => {
    const h = heights.get(n.id) ?? 1;
    const yCenterUnits = yTopUnits + h / 2;
    const x = (side === RIGHT ? 1 : -1) * depth * X_SPACING;
    const y = yCenterUnits * Y_SPACING;
    addNode(n, x, y, depth, nodes);

    const sourceHandle = side === RIGHT ? 'r' : 'l';
    const targetHandle = side === RIGHT ? 'tl' : 'tr';

    edges.push({
      id: `${parent.id}->${n.id}`,
      source: parent.id,
      target: n.id,
      type: edgeType as 'default' | 'smoothstep' | 'straight' | 'step',
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

  const layoutType = formato.layout ?? 'radial';
  const useDagre = ['tree-horizontal', 'tree-vertical', 'org-chart'].includes(layoutType);
  let finalNodes = nodes;

  if (useDagre && nodes.length > 0) {
    try {
      const { nodes: dagreNodes } = getLayoutedElements(
        nodes,
        edges,
        layoutType,
        showAll ? 'detailed' : 'compact'
      );
      finalNodes = dagreNodes as Node<MindmapNodeData>[];
    } catch {
      finalNodes = nodes;
    }
  }

  const resolved = resolveOverlaps(finalNodes as MindmapNodeWithMeasured[], 20);
  return { nodes: resolved, edges };
}

export const MindMapCanvas = forwardRef<MindMapCanvasHandle, MindMapCanvasProps>(function MindMapCanvas({ data, onReady, onChange, onSelectionChange, detailsEnabled, formato: formatoProp }, ref) {
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
	const formato = formatoProp ?? FORMATO_PADRAO;

  const computeDisplayNodes = useCallback(
    (layoutNodes: Node<MindmapNodeData>[]) =>
      layoutNodes.map((n) => {
        const isSelected = selectedId === n.id;
        return {
          ...n,
          selected: isSelected,
          data: {
            ...(n.data as MindmapNodeData),
            showDefinition: showAllDetails ? true : isSelected,
          },
        };
      }),
    [selectedId, showAllDetails]
  );

  const computeLayout = useCallback(() => {
    try {
      const { nodes: layoutNodes, edges: layoutEdges } = buildLayout(safeData.nodeData, {
        showAllDetails,
        formato,
      });
      return { layoutNodes: layoutNodes ?? [], layoutEdges: layoutEdges ?? [] };
    } catch (err) {
      console.error('[MindMapCanvas] Layout error:', err);
      const fallback = buildLayout(
        { id: 'root', topic: 'Mapa Mental', children: [] },
        { showAllDetails, formato }
      );
      return { layoutNodes: fallback.nodes, layoutEdges: fallback.edges };
    }
  }, [safeData, showAllDetails, formato]);

  const initialLayout = useMemo(() => computeLayout(), [computeLayout]);
  const [nodes, setNodesState] = useState<Node<MindmapNodeData>[]>(() =>
    computeDisplayNodes(initialLayout.layoutNodes)
  );
  const [layoutEdges, setLayoutEdges] = useState<Edge[]>(initialLayout.layoutEdges);

  useEffect(() => {
    const { layoutNodes, layoutEdges: nextEdges } = computeLayout();
    setLayoutEdges(nextEdges);
    setNodesState(computeDisplayNodes(layoutNodes));
  }, [computeLayout, computeDisplayNodes]);
  const edges = useMemo(() => {
    const targetLevels = new Map<string, number>();
    for (const n of nodes) {
      const d = n.data as MindmapNodeData;
      if (d?.level != null) targetLevels.set(n.id, d.level);
    }
    const theme = formato.colorTheme ?? 'oceano';
    return layoutEdges.map((e) => {
      const isConnected = selectedId ? e.source === selectedId || e.target === selectedId : false;
      const targetLevel = targetLevels.get(e.target) ?? 0;
      const colors = getColorsForLevel(theme, targetLevel);
      return {
        ...e,
        animated: isConnected,
        style: {
          stroke: isConnected ? colors.accent : colors.border,
          strokeWidth: isConnected ? 2.2 : targetLevel === 0 ? 2 : 1.6,
        },
      };
    });
  }, [layoutEdges, nodes, selectedId, formato.colorTheme]);

  const onNodesChange: OnNodesChange = useCallback((changes) => {
    let newSelectedId: string | null = null;
    setNodesState((current) => {
      const next = applyNodeChanges(changes, current);
      const sel = next.find((n) => n.selected);
      newSelectedId = sel?.id ?? null;
      return next;
    });
    setSelectedId(newSelectedId);
  }, []);

  const onNodeDragStop: OnNodeDragStop = useCallback((_evt, draggedNode) => {
    setNodesState((current) => {
      const moved = current.find((n) => n.id === draggedNode.id);
      if (!moved) return current;

      const mWithMeasured = moved as MindmapNodeWithMeasured;
      const mW = mWithMeasured.measured?.width ?? 180;
      const mH = mWithMeasured.measured?.height ?? 50;
      let x = draggedNode.position.x;
      let y = draggedNode.position.y;
      const padding = 20;

      for (let attempt = 0; attempt < 50; attempt++) {
        let clean = true;
        for (const other of current) {
          if (other.id === moved.id) continue;
          const oWithMeasured = other as MindmapNodeWithMeasured;
          const oW = oWithMeasured.measured?.width ?? 180;
          const oH = oWithMeasured.measured?.height ?? 50;

          const mCx = x + mW / 2;
          const mCy = y + mH / 2;
          const oCx = other.position.x + oW / 2;
          const oCy = other.position.y + oH / 2;

          const overlapX = mW / 2 + oW / 2 + padding - Math.abs(mCx - oCx);
          const overlapY = mH / 2 + oH / 2 + padding - Math.abs(mCy - oCy);

          if (overlapX > 0 && overlapY > 0) {
            clean = false;
            if (overlapX < overlapY) {
              x += mCx < oCx ? -overlapX : overlapX;
            } else {
              y += mCy < oCy ? -overlapY : overlapY;
            }
          }
        }
        if (clean) break;
      }

      return current.map((n) =>
        n.id === moved.id ? { ...n, position: { x, y } } : n
      );
    });
  }, []);

  const actions = useMemo<MindmapActions>(() => {
    return {
      updateTopic: (id, topic) => {
        const root = safeData.nodeData;
        const [nextRoot, changed] = updateNodeById(root, id, (n) => ({ ...n, topic }));
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
      updateNodeIcons: (id, icons) => {
        const root = safeData.nodeData;
        const [nextRoot, changed] = updateNodeById(root, id, (n) => ({
          ...n,
          icons: icons.length > 0 ? [...icons] : undefined,
        }));
        if (!changed) return;
        onChange?.(normalizeMindElixirData({ ...safeData, nodeData: nextRoot }));
      },
    };
  }, [onChange, safeData, selectedId]);

  const [instance, setInstance] = useState<ReactFlowInstance | null>(null);
  const didInitialFitRef = useRef(false);
  const lastLayoutFingerprintRef = useRef('');

  const reorganize = useCallback(() => {
    const { layoutNodes, layoutEdges } = computeLayout();
    setLayoutEdges(layoutEdges);
    setNodesState(computeDisplayNodes(layoutNodes));
    requestAnimationFrame(() => {
      if (instance) {
        try {
          instance.fitView({ padding: 0.25, duration: 300, minZoom: 0.3, maxZoom: 1.5 });
        } catch { /* ignore */ }
      }
    });
  }, [computeLayout, computeDisplayNodes, instance]);

  useImperativeHandle(ref, () => ({
    fitView: () => {
      if (!instance) return;
      requestAnimationFrame(() => {
        try {
          instance.fitView({ padding: 0.25, duration: 400, minZoom: 0.3, maxZoom: 1.5 });
        } catch { /* ignore */ }
      });
    },
    reorganize,
    getViewportElement: () => {
      return wrapperRef.current?.querySelector('.react-flow__viewport') as HTMLElement | null;
    },
    getFlowInstance: () => instance,
  }), [instance, reorganize]);

  // Build a lightweight fingerprint of the layout so we can detect content changes
  // (e.g. definitions added by "Detalhado"). Icons excluded so adding an icon does not trigger zoom/fitView.
  const layoutFingerprint = useMemo(() => {
    return nodes
      .map((n) => {
        const d = n.data as MindmapNodeData;
        return `${n.id}:${d?.label ?? ''}:${d?.definition ?? ''}`;
      })
      .join('|');
  }, [nodes]);

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
          onNodeDragStop={onNodeDragStop}
					onPaneClick={() => setSelectedId(null)}
          onInit={setInstance}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable
          selectNodesOnDrag={false}
          multiSelectionKeyCode="Shift"
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
});

