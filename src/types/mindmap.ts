export type GenerationStatus =
  | 'idle'
  | 'analyzing'
  | 'generating'
  | 'article'
  | 'image'
  | 'done'
  | 'error';

export type GraphType = 'mindmap' | 'orgchart' | 'tree' | 'timeline' | 'fishbone';

export interface MindElixirNode {
  id: string;
  topic: string;
  /**
   * mind-elixir accepts children as optional, but we normalize to always provide an array.
   */
  children?: MindElixirNode[];
  /**
   * Only meaningful for direct children of root when using MindElixir.SIDE.
   * 0 = LEFT, 1 = RIGHT
   */
  direction?: 0 | 1;
  style?: {
    background?: string;
    color?: string;
    fontSize?: string;
    fontWeight?: string;
  };
  tags?: string[];
  icons?: string[];
  hyperLink?: string;
  note?: string;
	  /** Short glossary-style definition for this concept (pt-BR). */
	  definition?: string;
  expanded?: boolean;
}

export interface MindElixirData {
  nodeData: MindElixirNode;
  arrows?: Array<{
    id: string;
    label: string;
    from: string;
    to: string;
    delta1?: { x: number; y: number };
    delta2?: { x: number; y: number };
  }>;
  summaries?: Array<{
    id: string;
    parent: string;
    start: number;
    end: number;
    text: string;
  }>;
  direction?: 0 | 1 | 2;
  theme?: {
    name: string;
    type?: 'light' | 'dark';
    palette: string[];
    cssVar: Record<string, string>;
  };
}

export interface AnalysisResult {
  central_theme: string;
  subtopics: string[];
  key_concepts: string[];
  relationships: Array<{ from: string; to: string; type: string }>;
  depth_level: number;
  suggested_node_count: number;
  suggested_tags: string[];
  template_context: string;
}

export interface DeepThoughtSource {
	title: string;
	author?: string;
	year?: string;
	type?: 'book' | 'paper' | 'standard' | 'doc' | 'article' | 'video' | 'course' | 'other';
	url?: string;
	why?: string;
}

export interface MermaidDiagram {
	kind?: string;
	code: string;
}

import type { FormatoConfig } from './formato';

export interface SavedMap {
  id: string;
  title: string;
  /** For admin views: owner username of this map. */
  ownerUsername?: string;
  /** For admin views: display path in "user/map_name" format. */
  ownerPath?: string;
  query: string;
  template: string;
  /**
   * Which visualization should be used to render this map.
   * Backwards compatible: older stored maps may not have this, so default to 'mindmap'.
   */
  graphType?: GraphType;
  mindElixirData: MindElixirData;
  article: string;
  imageUrl?: string;
  thumbnail?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  analysis?: AnalysisResult;
	/** Optional: for template 'pensamento_profundo' (and future templates). */
	sources?: DeepThoughtSource[];
	/** Optional: mermaid diagram suggested/produced by the LLM. */
	mermaid?: MermaidDiagram;
  /** UI-only flag persisted per map: controls whether node definitions/details are shown globally or only for the selected node. */
	detailsEnabled?: boolean;
	/** Configuração visual do mapa mental (nodeShape, colorTheme, edgeType, layout). Apenas quando graphType === 'mindmap'. */
	formato?: FormatoConfig;
	/** ISO timestamp of when this map was last successfully synced to the server. */
	lastSyncedAt?: string;
}

export interface GenerationState {
  status: GenerationStatus;
  progress: number;
  currentStep: string;
  error?: string;
  currentMapId?: string;
}

