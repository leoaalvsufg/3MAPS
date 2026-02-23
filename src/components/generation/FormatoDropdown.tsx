import * as React from 'react';
import { Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  COMBINACOES_PRONTAS,
  type FormatoConfig,
  type NodeShape,
  type ColorTheme,
  type EdgeType,
  type LayoutType,
} from '@/types/formato';

const NODE_SHAPES: Array<{ id: NodeShape; label: string }> = [
  { id: 'classic', label: 'Clássico' },
  { id: 'pill', label: 'Cápsula' },
  { id: 'glass', label: 'Vidro' },
  { id: 'neon', label: 'Neon' },
  { id: 'flat', label: 'Plano' },
  { id: 'outline', label: 'Contorno' },
  { id: 'card', label: 'Card' },
  { id: 'tag', label: 'Etiqueta' },
];

const COLOR_THEMES_LIST: Array<{ id: ColorTheme; label: string; emoji: string }> = [
  { id: 'aurora', label: 'Aurora Boreal', emoji: '🌌' },
  { id: 'floresta', label: 'Floresta', emoji: '🌿' },
  { id: 'oceano', label: 'Oceano', emoji: '🌊' },
  { id: 'vulcao', label: 'Vulcão', emoji: '🌋' },
  { id: 'lavanda', label: 'Lavanda', emoji: '💜' },
  { id: 'sol', label: 'Pôr do Sol', emoji: '🌅' },
  { id: 'neutro', label: 'Neutro', emoji: '⚡' },
  { id: 'candy', label: 'Candy Pop', emoji: '🍬' },
  { id: 'terra', label: 'Terra', emoji: '🏜️' },
  { id: 'matrix', label: 'Matrix', emoji: '🖥️' },
];

const EDGE_TYPES: Array<{ id: EdgeType; label: string }> = [
  { id: 'bezier', label: 'Bézier' },
  { id: 'smooth-step', label: 'Step' },
  { id: 'straight', label: 'Reta' },
  { id: 'organic', label: 'Orgânica' },
  { id: 'angular', label: 'Angular' },
  { id: 'elbow', label: 'Elbow' },
];

const LAYOUTS: Array<{ id: LayoutType; label: string }> = [
  { id: 'radial', label: 'Radial' },
  { id: 'tree-horizontal', label: 'Árvore H' },
  { id: 'tree-vertical', label: 'Árvore V' },
  { id: 'org-chart', label: 'Org Chart' },
];

interface FormatoDropdownProps {
  value: FormatoConfig;
  onChange: (formato: FormatoConfig) => void;
  className?: string;
}

export function FormatoDropdown({ value, onChange, className }: FormatoDropdownProps) {
  const [local, setLocal] = React.useState<FormatoConfig>(value);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (open) setLocal(value);
  }, [open, value]);

  const handleApply = () => {
    onChange(local);
    setOpen(false);
  };

  const handlePreset = (preset: FormatoConfig) => {
    setLocal(preset);
    onChange(preset);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`gap-1.5 text-xs h-8 ${className ?? ''}`}
          title="Formato visual do mapa"
        >
          <Palette className="h-3.5 w-3.5" />
          Formato
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] max-h-[85vh] overflow-y-auto">
        <div className="space-y-4">
          <h4 className="font-medium text-sm">Formato</h4>

          {/* Estilo dos Nós */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Estilo dos Nós</div>
            <div className="flex flex-wrap gap-1.5">
              {NODE_SHAPES.map((s) => (
                <Button
                  key={s.id}
                  variant={local.nodeShape === s.id ? 'secondary' : 'outline'}
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => setLocal((p) => ({ ...p, nodeShape: s.id }))}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Paleta de Cores */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Paleta de Cores</div>
            <div className="grid grid-cols-2 gap-1">
              {COLOR_THEMES_LIST.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ${
                    local.colorTheme === t.id ? 'bg-primary/15 text-primary' : 'hover:bg-muted/60'
                  }`}
                  onClick={() => setLocal((p) => ({ ...p, colorTheme: t.id }))}
                >
                  <span>{t.emoji}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tipo de Conexão */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Tipo de Conexão</div>
            <div className="flex flex-wrap gap-1.5">
              {EDGE_TYPES.map((e) => (
                <Button
                  key={e.id}
                  variant={local.edgeType === e.id ? 'secondary' : 'outline'}
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => setLocal((p) => ({ ...p, edgeType: e.id }))}
                >
                  {e.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Layout */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Layout</div>
            <div className="flex flex-wrap gap-1.5">
              {LAYOUTS.map((l) => (
                <Button
                  key={l.id}
                  variant={local.layout === l.id ? 'secondary' : 'outline'}
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => setLocal((p) => ({ ...p, layout: l.id }))}
                >
                  {l.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Combinações prontas */}
          <div className="border-t pt-4">
            <div className="text-xs font-medium text-muted-foreground mb-2">Combinações prontas</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(COMBINACOES_PRONTAS).map(([name, config]) => (
                <Button
                  key={name}
                  variant="outline"
                  size="sm"
                  className="text-xs h-8"
                  onClick={() => handlePreset(config)}
                >
                  {name}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleApply}>
              Aplicar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
