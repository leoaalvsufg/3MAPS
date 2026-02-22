import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/stores/ui-store';

export function Header() {
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);

  return (
    <header className="flex items-center gap-3 h-14 px-4 border-b border-slate-200/80 bg-white md:hidden">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setSidebarOpen(true)}
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </Button>
      <div className="flex items-center gap-2.5">
		<div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center shadow-sm shadow-slate-200 ring-1 ring-slate-200/60">
		  <img src="/favicon.svg" alt="3Maps" width={28} height={28} className="object-contain" draggable={false} />
		</div>
        <span className="font-extrabold text-base tracking-tight bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
          3Maps
        </span>
      </div>
    </header>
  );
}

