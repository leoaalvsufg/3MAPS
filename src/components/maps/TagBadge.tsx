import { X } from 'lucide-react';
import { getTagColor } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface TagBadgeProps {
  name: string;
  removable?: boolean;
  onRemove?: () => void;
  onClick?: () => void;
  active?: boolean;
  size?: 'sm' | 'md';
}

export function TagBadge({
  name,
  removable,
  onRemove,
  onClick,
  active,
  size = 'sm',
}: TagBadgeProps) {
  const color = getTagColor(name);

  return (
    <span
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-medium transition-all',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        color.bg, color.text, color.border,
        onClick && 'cursor-pointer hover:opacity-80',
        active && 'ring-2 ring-offset-1 ring-current'
      )}
    >
      {name}
      {removable && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="hover:opacity-70 transition-opacity ml-0.5"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}

