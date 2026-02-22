import type { MindElixirData, MindElixirNode } from '@/types/mindmap';
import { normalizeMindElixirData } from '@/lib/normalizeMindElixirData';

function Branch({ node, position }: { node: MindElixirNode; position: 'top' | 'bottom' }) {
  const children = node.children ?? [];
  return (
    <div className={position === 'top' ? 'self-start' : 'self-end'}>
      <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
        <div className="text-sm font-semibold">{node.topic}</div>
        {children.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {children.slice(0, 6).map((c) => (
              <li key={c.id} className="truncate">• {c.topic}</li>
            ))}
            {children.length > 6 && <li>+{children.length - 6}...</li>}
          </ul>
        )}
      </div>
    </div>
  );
}

export function FishboneGraph({ data }: { data: MindElixirData }) {
  const safe = normalizeMindElixirData(data);
  const root = safe.nodeData;
  const branches = root.children ?? [];

  return (
    <div className="h-full w-full overflow-auto bg-background">
      <div className="max-w-6xl mx-auto p-6">
        <h2 className="text-lg font-semibold mb-4">Fishbone</h2>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between gap-6">
            <div className="text-base font-bold shrink-0">{root.topic}</div>
            <div className="h-px flex-1 bg-border" />
            <div className="text-xs text-muted-foreground shrink-0">(causas → efeito)</div>
          </div>

          {branches.length > 0 ? (
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {branches.map((b, idx) => (
                <Branch key={b.id} node={b} position={idx % 2 === 0 ? 'top' : 'bottom'} />
              ))}
            </div>
          ) : (
            <div className="mt-4 text-sm text-muted-foreground">Sem ramos para exibir.</div>
          )}
        </div>
      </div>
    </div>
  );
}
