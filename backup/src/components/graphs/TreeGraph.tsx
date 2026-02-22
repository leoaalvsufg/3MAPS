import type { MindElixirData, MindElixirNode } from '@/types/mindmap';
import { normalizeMindElixirData } from '@/lib/normalizeMindElixirData';

function TreeNode({ node, depth }: { node: MindElixirNode; depth: number }) {
  const children = node.children ?? [];
  return (
    <div className="pl-4">
      <div className="flex items-center gap-2 py-1">
        <div className="h-2 w-2 rounded-full bg-primary/70" />
        <div className="text-sm font-medium text-foreground">{node.topic}</div>
      </div>
      {children.length > 0 && (
        <div className="ml-1 border-l border-border/70 pl-3">
          {children.map((c) => (
            <TreeNode key={c.id} node={c} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function TreeGraph({ data }: { data: MindElixirData }) {
  const safe = normalizeMindElixirData(data);
  return (
    <div className="h-full w-full overflow-auto bg-background">
      <div className="max-w-4xl mx-auto p-6">
        <h2 className="text-lg font-semibold mb-4">Tree</h2>
        <div className="rounded-xl border border-border bg-card p-4">
          <TreeNode node={safe.nodeData} depth={0} />
        </div>
      </div>
    </div>
  );
}
