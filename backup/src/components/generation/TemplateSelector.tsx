import { cn } from '@/lib/utils';
import { TEMPLATES } from '@/lib/constants';
import type { TemplateId } from '@/types/templates';

interface TemplateSelectorProps {
  selected: TemplateId;
  onSelect: (id: TemplateId) => void;
}

const colorMap: Record<string, string> = {
  blue: 'border-blue-200 bg-blue-50 hover:bg-blue-100 data-[selected=true]:border-blue-500 data-[selected=true]:bg-blue-100',
  yellow: 'border-yellow-200 bg-yellow-50 hover:bg-yellow-100 data-[selected=true]:border-yellow-500 data-[selected=true]:bg-yellow-100',
  purple: 'border-purple-200 bg-purple-50 hover:bg-purple-100 data-[selected=true]:border-purple-500 data-[selected=true]:bg-purple-100',
  green: 'border-green-200 bg-green-50 hover:bg-green-100 data-[selected=true]:border-green-500 data-[selected=true]:bg-green-100',
  teal: 'border-teal-200 bg-teal-50 hover:bg-teal-100 data-[selected=true]:border-teal-500 data-[selected=true]:bg-teal-100',
  red: 'border-red-200 bg-red-50 hover:bg-red-100 data-[selected=true]:border-red-500 data-[selected=true]:bg-red-100',
  orange: 'border-orange-200 bg-orange-50 hover:bg-orange-100 data-[selected=true]:border-orange-500 data-[selected=true]:bg-orange-100',
  indigo: 'border-indigo-200 bg-indigo-50 hover:bg-indigo-100 data-[selected=true]:border-indigo-500 data-[selected=true]:bg-indigo-100',
	slate: 'border-slate-200 bg-slate-50 hover:bg-slate-100 data-[selected=true]:border-slate-600 data-[selected=true]:bg-slate-100',
};

export function TemplateSelector({ selected, onSelect }: TemplateSelectorProps) {
  return (
    <div className="w-full">
      <p className="text-sm font-medium text-muted-foreground mb-3">Escolha um template</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {TEMPLATES.map((template) => (
          <button
            key={template.id}
            data-selected={selected === template.id}
            onClick={() => onSelect(template.id)}
            className={cn(
              'flex flex-col items-start gap-1 p-3 rounded-xl border-2 text-left transition-all cursor-pointer',
              colorMap[template.color] ?? colorMap.blue,
              selected === template.id && 'ring-2 ring-offset-1 ring-current'
            )}
          >
            <span className="text-xl">{template.icon}</span>
            <span className="text-xs font-semibold text-foreground leading-tight">
              {template.name}
            </span>
            <span className="text-[10px] text-muted-foreground leading-tight line-clamp-2">
              {template.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

