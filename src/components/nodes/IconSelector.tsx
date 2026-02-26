/**
 * IconSelector — escolher ícone (emoji) para um nó
 */

import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ImageIcon, X } from 'lucide-react';

const ICON_OPTIONS = [
  '💡', '📌', '⭐', '🎯', '✓', '⚠', '📋', '📁', '🔗', '💬',
  '📊', '📈', '🎨', '🔧', '📦', '🚀', '💡', '🌟', '🔥', '💎',
  '📝', '📖', '🔍', '🧩', '⚙', '🏷', '📌', '📍', '🗂', '🗃',
];

interface IconSelectorProps {
  value: string[];
  onChange: (icons: string[]) => void;
  trigger?: React.ReactNode;
}

export function IconSelector({ value, onChange, trigger }: IconSelectorProps) {
  const [open, setOpen] = useState(false);

  const selectIcon = (icon: string) => {
    const current = value ?? [];
    if (current.includes(icon)) {
      onChange(current.filter((i) => i !== icon));
    } else {
      onChange([...current, icon]);
    }
  };

  const clearAll = () => {
    onChange([]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="h-8 w-8 p-0">
            <ImageIcon className="h-4 w-4" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">Ícone</span>
          {(value?.length ?? 0) > 0 && (
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={clearAll}>
              <X className="h-3 w-3 mr-1" />
              Remover
            </Button>
          )}
        </div>
        <div className="grid grid-cols-5 gap-1">
          {ICON_OPTIONS.map((icon) => (
            <button
              key={icon}
              type="button"
              onClick={() => selectIcon(icon)}
              className={`h-8 w-8 rounded flex items-center justify-center text-lg transition-colors ${
                (value ?? []).includes(icon)
                  ? 'bg-primary/20 text-primary ring-1 ring-primary/30'
                  : 'hover:bg-muted'
              }`}
            >
              {icon}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
