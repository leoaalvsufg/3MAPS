import type { MindElixirData, MindElixirNode } from '@/types/mindmap';
import { normalizeMindElixirData } from '@/lib/normalizeMindElixirData';

function Card({ node }: { node: MindElixirNode }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 shadow-sm">
      <div className="text-sm font-semibold leading-snug">{node.topic}</div>
	      {node.children && node.children.length > 0 && (
	        <div className="mt-1 text-xs text-muted-foreground">{node.children.length} subnós</div>
	      )}
    </div>
  );
}

export function OrgChartGraph({ data }: { data: MindElixirData }) {
  const safe = normalizeMindElixirData(data);
  const root = safe.nodeData;
  const level1 = root.children ?? [];

  return (
    <div className="h-full w-full overflow-auto bg-background">
      <div className="max-w-6xl mx-auto p-6">
        <h2 className="text-lg font-semibold mb-4">Org Chart</h2>

        <div className="flex flex-col items-center gap-6">
          <Card node={root} />

          {level1.length > 0 ? (
            <div className="w-full">
              <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(level1.length, 4)}, minmax(0, 1fr))` }}>
                {level1.map((n) => (
                  <div key={n.id} className="flex flex-col items-stretch gap-3">
                    <Card node={n} />
                    {(n.children ?? []).length > 0 && (
                      <div className="flex flex-col gap-2 pl-2 border-l border-border/70">
                        {(n.children ?? []).slice(0, 8).map((c) => (
                          <Card key={c.id} node={c} />
                        ))}
                        {(n.children ?? []).length > 8 && (
                          <div className="text-xs text-muted-foreground pl-1">+{(n.children ?? []).length - 8}...</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
	            <div className="text-sm text-muted-foreground">Sem sub-nós para exibir.</div>
          )}
        </div>
      </div>
    </div>
  );
}
