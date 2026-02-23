import type { ColorTheme, LevelColors } from '@/types/formato';

/** Paletas de cores por tema. Cada nível (0–4) define bg, text, border, accent. */
export const COLOR_THEMES: Record<ColorTheme, LevelColors[]> = {
  aurora: [
    { bg: '#0f172a', text: '#e2e8f0', border: '#38bdf8', accent: '#38bdf8' },
    { bg: '#1e3a5f', text: '#e2e8f0', border: '#7dd3fc', accent: '#7dd3fc' },
    { bg: 'rgba(30,64,175,0.13)', text: '#1e3a5f', border: '#60a5fa', accent: '#3b82f6' },
    { bg: 'rgba(167,139,250,0.08)', text: '#4c1d95', border: '#a78bfa', accent: '#8b5cf6' },
    { bg: 'rgba(196,181,253,0.06)', text: '#5b21b6', border: '#c4b5fd', accent: '#a78bfa' },
  ],
  floresta: [
    { bg: '#064e3b', text: '#ecfdf5', border: '#34d399', accent: '#10b981' },
    { bg: '#065f46', text: '#ecfdf5', border: '#6ee7b7', accent: '#34d399' },
    { bg: 'rgba(209,250,229,0.13)', text: '#064e3b', border: '#6ee7b7', accent: '#10b981' },
    { bg: 'rgba(254,243,199,0.08)', text: '#713f12', border: '#fbbf24', accent: '#f59e0b' },
    { bg: 'rgba(254,249,195,0.06)', text: '#854d0e', border: '#fde68a', accent: '#fbbf24' },
  ],
  oceano: [
    { bg: '#0c4a6e', text: '#f0f9ff', border: '#38bdf8', accent: '#0ea5e9' },
    { bg: '#075985', text: '#f0f9ff', border: '#7dd3fc', accent: '#38bdf8' },
    { bg: '#e0f2fe', text: '#0c4a6e', border: '#7dd3fc', accent: '#0ea5e9' },
    { bg: '#f0f9ff', text: '#0c4a6e', border: '#bae6fd', accent: '#38bdf8' },
    { bg: '#f8fafc', text: '#334155', border: '#cbd5e1', accent: '#94a3b8' },
  ],
  vulcao: [
    { bg: '#7f1d1d', text: '#fef2f2', border: '#f87171', accent: '#ef4444' },
    { bg: '#991b1b', text: '#fef2f2', border: '#fca5a5', accent: '#f87171' },
    { bg: '#fef2f2', text: '#7f1d1d', border: '#fca5a5', accent: '#ef4444' },
    { bg: '#fff7ed', text: '#7c2d12', border: '#fdba74', accent: '#f97316' },
    { bg: '#fffbeb', text: '#78350f', border: '#fde68a', accent: '#f59e0b' },
  ],
  lavanda: [
    { bg: '#4c1d95', text: '#f5f3ff', border: '#a78bfa', accent: '#8b5cf6' },
    { bg: '#5b21b6', text: '#f5f3ff', border: '#c4b5fd', accent: '#a78bfa' },
    { bg: '#f5f3ff', text: '#4c1d95', border: '#c4b5fd', accent: '#8b5cf6' },
    { bg: '#fdf4ff', text: '#701a75', border: '#f0abfc', accent: '#d946ef' },
    { bg: '#fef2f2', text: '#9f1239', border: '#fda4af', accent: '#fb7185' },
  ],
  sol: [
    { bg: '#9a3412', text: '#fff7ed', border: '#fb923c', accent: '#f97316' },
    { bg: '#c2410c', text: '#fff7ed', border: '#fdba74', accent: '#fb923c' },
    { bg: '#fff7ed', text: '#9a3412', border: '#fdba74', accent: '#f97316' },
    { bg: '#fef3c7', text: '#92400e', border: '#fcd34d', accent: '#f59e0b' },
    { bg: '#fefce8', text: '#854d0e', border: '#fde68a', accent: '#eab308' },
  ],
  neutro: [
    { bg: '#18181b', text: '#fafafa', border: '#52525b', accent: '#a1a1aa' },
    { bg: '#27272a', text: '#fafafa', border: '#71717a', accent: '#a1a1aa' },
    { bg: '#f4f4f5', text: '#18181b', border: '#d4d4d8', accent: '#71717a' },
    { bg: '#fafafa', text: '#27272a', border: '#e4e4e7', accent: '#a1a1aa' },
    { bg: '#ffffff', text: '#3f3f46', border: '#e4e4e7', accent: '#d4d4d8' },
  ],
  candy: [
    { bg: '#ec4899', text: '#ffffff', border: '#f472b6', accent: '#ec4899' },
    { bg: '#8b5cf6', text: '#ffffff', border: '#a78bfa', accent: '#8b5cf6' },
    { bg: '#fce7f3', text: '#9d174d', border: '#f9a8d4', accent: '#ec4899' },
    { bg: '#ede9fe', text: '#5b21b6', border: '#c4b5fd', accent: '#8b5cf6' },
    { bg: '#e0f2fe', text: '#0369a1', border: '#7dd3fc', accent: '#0ea5e9' },
  ],
  terra: [
    { bg: '#78350f', text: '#fefce8', border: '#d97706', accent: '#b45309' },
    { bg: '#92400e', text: '#fefce8', border: '#f59e0b', accent: '#d97706' },
    { bg: '#fef3c7', text: '#78350f', border: '#fbbf24', accent: '#d97706' },
    { bg: '#fdf2f8', text: '#831843', border: '#f9a8d4', accent: '#ec4899' },
    { bg: '#f5f5f4', text: '#44403c', border: '#d6d3d1', accent: '#a8a29e' },
  ],
  matrix: [
    { bg: '#022c22', text: '#4ade80', border: '#22c55e', accent: '#22c55e' },
    { bg: '#052e16', text: '#86efac', border: '#4ade80', accent: '#22c55e' },
    { bg: '#0a0a0a', text: '#4ade80', border: '#166534', accent: '#22c55e' },
    { bg: '#0f0f0f', text: '#86efac', border: '#14532d', accent: '#16a34a' },
    { bg: '#111111', text: '#bbf7d0', border: '#15803d', accent: '#22c55e' },
  ],
};

/** Retorna as cores do nível (0–4). Níveis > 4 usam nível 4. */
export function getColorsForLevel(theme: ColorTheme, level: number): LevelColors {
  const palette = COLOR_THEMES[theme];
  const idx = Math.min(level, palette.length - 1);
  return palette[idx];
}
