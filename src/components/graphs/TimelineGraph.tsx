import type { MindElixirData, MindElixirNode } from '@/types/mindmap';
import { normalizeMindElixirData } from '@/lib/normalizeMindElixirData';

function TimelineItem({ node }: { node: MindElixirNode }) {
  const children = node.children ?? [];
  return (
    <li className="relative pl-6 pb-6">
      <span className="absolute left-0 top-1 h-3 w-3 rounded-full bg-primary" />
      <div className="text-sm font-semibold">{node.topic}</div>
      {children.length > 0 && (
        <ul className="mt-2 ml-1 border-l border-border/70 pl-4 space-y-3">
          {children.map((c) => (
            <TimelineItem key={c.id} node={c} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function TimelineGraph({ data }: { data: MindElixirData }) {
  const safe = normalizeMindElixirData(data);
  const root = safe.nodeData;
  const items = root.children ?? [];

  return (
    <div className="h-full w-full overflow-auto bg-background">
      <div className="max-w-4xl mx-auto p-6">
        <h2 className="text-lg font-semibold mb-1">Timeline</h2>
        <p className="text-sm text-muted-foreground mb-4">Baseado nos ramos do mapa (ordem atual).</p>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-base font-bold mb-4">{root.topic}</div>
          {items.length > 0 ? (
            <ul className="border-l border-border/70 pl-2">
              {items.map((n) => (
                <TimelineItem key={n.id} node={n} />
              ))}
            </ul>
          ) : (
            <div className="text-sm text-muted-foreground">Sem eventos para exibir.</div>
          )}
        </div>
      </div>
    </div>
  );
}
