/**
 * Configuração visual do mapa mental (MapaMental).
 * Usado na barra de Ações quando tipo === "MapaMental".
 */
export type NodeShape =
  | 'classic'
  | 'pill'
  | 'glass'
  | 'neon'
  | 'flat'
  | 'outline'
  | 'card'
  | 'tag';

export type ColorTheme =
  | 'aurora'
  | 'floresta'
  | 'oceano'
  | 'vulcao'
  | 'lavanda'
  | 'sol'
  | 'neutro'
  | 'candy'
  | 'terra'
  | 'matrix';

export type EdgeType =
  | 'bezier'
  | 'smooth-step'
  | 'straight'
  | 'organic'
  | 'angular'
  | 'elbow';

export type LayoutType =
  | 'radial'
  | 'tree-horizontal'
  | 'tree-vertical'
  | 'org-chart'
  | 'free';

export type DisplayMode = 'compact' | 'detailed';

export interface LevelColors {
  bg: string;
  text: string;
  border: string;
  accent: string;
}

export interface FormatoConfig {
  nodeShape: NodeShape;
  colorTheme: ColorTheme;
  edgeType: EdgeType;
  layout: LayoutType;
}

export const FORMATO_PADRAO: FormatoConfig = {
  nodeShape: 'classic',
  colorTheme: 'oceano',
  edgeType: 'bezier',
  layout: 'radial',
};

export const MODO_PADRAO: DisplayMode = 'detailed';

export const COMBINACOES_PRONTAS: Record<string, FormatoConfig> = {
  'Deep Space': {
    nodeShape: 'glass',
    colorTheme: 'aurora',
    edgeType: 'bezier',
    layout: 'radial',
  },
  'Jardim Zen': {
    nodeShape: 'pill',
    colorTheme: 'floresta',
    edgeType: 'organic',
    layout: 'radial',
  },
  'Corporate Clean': {
    nodeShape: 'card',
    colorTheme: 'neutro',
    edgeType: 'smooth-step',
    layout: 'tree-horizontal',
  },
  'Neon City': {
    nodeShape: 'neon',
    colorTheme: 'matrix',
    edgeType: 'straight',
    layout: 'tree-vertical',
  },
  'Sunset Vibes': {
    nodeShape: 'flat',
    colorTheme: 'sol',
    edgeType: 'bezier',
    layout: 'radial',
  },
  'Candy Rush': {
    nodeShape: 'pill',
    colorTheme: 'candy',
    edgeType: 'organic',
    layout: 'radial',
  },
  'Blueprint': {
    nodeShape: 'outline',
    colorTheme: 'oceano',
    edgeType: 'angular',
    layout: 'tree-horizontal',
  },
  'Lava Flow': {
    nodeShape: 'glass',
    colorTheme: 'vulcao',
    edgeType: 'bezier',
    layout: 'radial',
  },
  'Lavender Dream': {
    nodeShape: 'card',
    colorTheme: 'lavanda',
    edgeType: 'smooth-step',
    layout: 'tree-vertical',
  },
  'Desert Road': {
    nodeShape: 'tag',
    colorTheme: 'terra',
    edgeType: 'elbow',
    layout: 'org-chart',
  },
};

export const DISPLAY_MODE_CONFIG = {
  compact: {
    maxNodeWidth: 200,
    nodeHorizontalPadding: 36,
    nodeVerticalPadding: 24,
    titleOnly: true,
    spacingMultiplier: 1.0,
    descriptionMaxLines: 0,
    descriptionLineHeight: 0,
  },
  detailed: {
    maxNodeWidth: 280,
    nodeHorizontalPadding: 36,
    nodeVerticalPadding: 32,
    titleOnly: false,
    spacingMultiplier: 1.4,
    descriptionMaxLines: 3,
    descriptionLineHeight: 15.4,
  },
} as const;

export const SPACING_BASE = {
  horizontal: 60,
  vertical: 80,
  radialRing: 120,
  minAngle: 15,
} as const;
