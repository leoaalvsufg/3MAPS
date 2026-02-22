import type { MindElixirData, MindElixirNode } from '@/types/mindmap';

type NodeDirection = 0 | 1;

const LEFT: NodeDirection = 0;
const RIGHT: NodeDirection = 1;

function toTopic(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  if (value == null) return fallback;
  const s = String(value).trim();
  return s.length > 0 ? s : fallback;
}

function ensureUniqueId(id: string, used: Set<string>): string {
  const base = id.trim() || 'node';
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let i = 2;
  while (used.has(`${base}_${i}`)) i++;
  const next = `${base}_${i}`;
  used.add(next);
  return next;
}

/**
 * Normaliza MindElixirData para evitar bugs de layout:
 * - todo nó tem { id (único), topic (string), children (array) }
 * - nenhum id duplicado/vazio
 * - filhos diretos da raiz ganham direction LEFT/RIGHT para distribuir nos dois lados
 */
export function normalizeMindElixirData(input: MindElixirData | null | undefined): MindElixirData {
  const used = new Set<string>();
  let counter = 0;

  const fallback: MindElixirData = {
    nodeData: { id: 'root', topic: 'Mapa Mental', children: [] },
  };

  const root: MindElixirNode = input?.nodeData
    ? { ...(input.nodeData as MindElixirNode) }
    : { ...fallback.nodeData };

  function normalizeNode(node: MindElixirNode, isRoot = false): MindElixirNode {
    const n: MindElixirNode = { ...node };

    // topic
    n.topic = toTopic((n as unknown as { topic?: unknown }).topic, isRoot ? 'Mapa Mental' : `Tópico ${counter + 1}`);

    // id must be unique and non-empty
    const rawId = (n as unknown as { id?: unknown }).id;
    const candidate = typeof rawId === 'string' && rawId.trim() ? rawId : (isRoot ? 'root' : `node_${++counter}`);
    n.id = ensureUniqueId(candidate, used);

    // children must be an array
    const rawChildren = (n as unknown as { children?: unknown }).children;
    const children: MindElixirNode[] = Array.isArray(rawChildren) ? (rawChildren as MindElixirNode[]) : [];
    n.children = children.map((c) => normalizeNode(c));

    return n;
  }

  const normalizedRoot = normalizeNode(root, true);

  // Distribute direct children of root to both sides.
  normalizedRoot.children = (normalizedRoot.children ?? []).map((child, idx) => {
    const c: MindElixirNode = { ...child };
    if (c.direction == null) c.direction = idx % 2 === 0 ? RIGHT : LEFT;
    return c;
  });

  return {
    ...(input ?? fallback),
    nodeData: normalizedRoot,
  };
}

