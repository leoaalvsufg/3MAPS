/**
 * Layout engine para mapas mentais: dagre + anti-sobreposição.
 */
import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';
import { DISPLAY_MODE_CONFIG } from '@/types/formato';
import type { LayoutType } from '@/types/formato';

interface NodeDataWithLevel {
  label?: string;
  definition?: string;
  level?: number;
}

const PADDING = 20;
const DEFAULT_W = 180;
const DEFAULT_H = 50;

/** Estima dimensões do nó baseado em título/descrição e modo. */
export function estimateNodeDimensions(
  node: Node<NodeDataWithLevel>,
  displayMode: 'compact' | 'detailed'
): { width: number; height: number } {
  const config = DISPLAY_MODE_CONFIG[displayMode];
  const { label, definition, level } = node.data ?? {};
  const title = label ?? '';
  const desc = definition ?? '';

  const charWidth = level === 0 ? 9.5 : level === 1 ? 8.5 : 7.5;
  const titleWidth = title.length * charWidth + config.nodeHorizontalPadding;
  let descWidth = 0;
  if (displayMode === 'detailed' && desc) {
    const descCharWidth = level === 0 ? 7 : 6.5;
    descWidth = Math.min(desc.length * descCharWidth, config.maxNodeWidth - config.nodeHorizontalPadding);
  }

  const width = Math.max(
    Math.min(Math.max(titleWidth, descWidth + config.nodeHorizontalPadding), config.maxNodeWidth),
    120
  );

  const titleHeight = level === 0 ? 20 : level === 1 ? 18 : 16;
  let descHeight = 0;
  if (displayMode === 'detailed' && desc) {
    const descCharWidth = level === 0 ? 7 : 6.5;
    const charsPerLine = Math.floor((width - config.nodeHorizontalPadding) / descCharWidth) || 20;
    const numLines = Math.min(Math.ceil(desc.length / charsPerLine), config.descriptionMaxLines);
    descHeight = numLines * config.descriptionLineHeight + 6;
  }

  const height = titleHeight + descHeight + config.nodeVerticalPadding;
  return { width, height };
}

/** Resolve sobreposição iterando pares de nós e empurrando na direção de menor colisão. */
export function resolveOverlaps<T extends { id: string; position: { x: number; y: number }; measured?: { width: number; height: number } }>(
  nodes: T[],
  padding = PADDING
): T[] {
  const result = nodes.map((n) => ({ ...n, position: { ...n.position } }));
  let hasOverlap = true;
  let iterations = 0;

  while (hasOverlap && iterations < 100) {
    hasOverlap = false;
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const a = result[i];
        const b = result[j];
        const aW = a.measured?.width ?? DEFAULT_W;
        const aH = a.measured?.height ?? DEFAULT_H;
        const bW = b.measured?.width ?? DEFAULT_W;
        const bH = b.measured?.height ?? DEFAULT_H;

        const aCx = a.position.x + aW / 2;
        const aCy = a.position.y + aH / 2;
        const bCx = b.position.x + bW / 2;
        const bCy = b.position.y + bH / 2;

        const overlapX = aW / 2 + bW / 2 + padding - Math.abs(aCx - bCx);
        const overlapY = aH / 2 + bH / 2 + padding - Math.abs(aCy - bCy);

        if (overlapX > 0 && overlapY > 0) {
          hasOverlap = true;
          const shift = overlapX < overlapY ? overlapX / 2 + 1 : overlapY / 2 + 1;
          if (overlapX < overlapY) {
            const dx = aCx < bCx ? -shift : shift;
            a.position.x += dx;
            b.position.x -= dx;
          } else {
            const dy = aCy < bCy ? -shift : shift;
            a.position.y += dy;
            b.position.y -= dy;
          }
        }
      }
    }
    iterations++;
  }

  return result.map((r, idx) => ({ ...nodes[idx], position: { ...r.position } }));
}

/** Mapeia LayoutType para rankdir do dagre. */
function layoutToRankDir(layout: LayoutType): 'TB' | 'LR' | 'RL' | 'BT' {
  switch (layout) {
    case 'tree-horizontal':
      return 'LR';
    case 'tree-vertical':
    case 'org-chart':
      return 'TB';
    case 'radial':
    case 'free':
    default:
      return 'LR';
  }
}

/** Aplica layout dagre aos nós e edges. Retorna nós com posições e measured. */
export function getLayoutedElements<T extends NodeDataWithLevel>(
  nodes: Node<T>[],
  edges: Edge[],
  layout: LayoutType,
  displayMode: 'compact' | 'detailed'
): { nodes: (Node<T> & { measured?: { width: number; height: number } })[]; edges: Edge[] } {
  const rankdir = layoutToRankDir(layout);
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));

  const mult = DISPLAY_MODE_CONFIG[displayMode].spacingMultiplier;
  g.setGraph({
    rankdir,
    nodesep: 60 * mult,
    ranksep: 80 * mult,
    edgesep: 30,
    marginx: 20,
    marginy: 20,
  });

  const nodesWithMeasured = nodes.map((n) => {
    const measured = estimateNodeDimensions(n as Node<NodeDataWithLevel>, displayMode);
    return { ...n, measured };
  });

  nodesWithMeasured.forEach((node) => {
    const { width, height } = node.measured ?? { width: DEFAULT_W, height: DEFAULT_H };
    g.setNode(node.id, { width: width + PADDING, height: height + PADDING });
  });

  edges.forEach((e) => {
    g.setEdge(e.source, e.target);
  });

  dagre.layout(g);

  const layoutedNodes = nodesWithMeasured.map((node) => {
    const nodeWithPos = g.node(node.id);
    const { width, height } = node.measured ?? { width: DEFAULT_W, height: DEFAULT_H };
    return {
      ...node,
      position: {
        x: nodeWithPos.x - width / 2,
        y: nodeWithPos.y - height / 2,
      },
      measured: node.measured,
    };
  });

  return { nodes: layoutedNodes, edges };
}
