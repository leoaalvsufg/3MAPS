import { lazy, Suspense } from 'react';
import type { GraphType, MindElixirData } from '@/types/mindmap';

// Lazy-load each graph component so only the active graph type is bundled on demand
const TreeGraph = lazy(() => import('./TreeGraph').then((m) => ({ default: m.TreeGraph })));
const OrgChartGraph = lazy(() => import('./OrgChartGraph').then((m) => ({ default: m.OrgChartGraph })));
const TimelineGraph = lazy(() => import('./TimelineGraph').then((m) => ({ default: m.TimelineGraph })));
const FishboneGraph = lazy(() => import('./FishboneGraph').then((m) => ({ default: m.FishboneGraph })));

function GraphLoader() {
  return (
    <div className="h-full w-full flex items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

export function GraphCanvas({ graphType, data }: { graphType: GraphType; data: MindElixirData }) {
  switch (graphType) {
    case 'tree':
      return (
        <Suspense fallback={<GraphLoader />}>
          <TreeGraph data={data} />
        </Suspense>
      );
    case 'orgchart':
      return (
        <Suspense fallback={<GraphLoader />}>
          <OrgChartGraph data={data} />
        </Suspense>
      );
    case 'timeline':
      return (
        <Suspense fallback={<GraphLoader />}>
          <TimelineGraph data={data} />
        </Suspense>
      );
    case 'fishbone':
      return (
        <Suspense fallback={<GraphLoader />}>
          <FishboneGraph data={data} />
        </Suspense>
      );
    case 'mindmap':
    default:
      // mindmap is rendered by MindMapCanvas
      return (
        <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
          Selecione o modo Mindmap.
        </div>
      );
  }
}
