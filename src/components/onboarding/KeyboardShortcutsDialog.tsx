import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface Shortcut {
  keys: string;
  description: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: 'Ctrl + N', description: 'Novo mapa (ir para a página inicial)' },
  { keys: 'Ctrl + E', description: 'Abrir diálogo de exportação' },
  { keys: 'Ctrl + S', description: 'Salvar / sincronizar manualmente' },
  { keys: 'Ctrl + /', description: 'Recolher / expandir barra lateral' },
  { keys: 'Ctrl + Z', description: 'Desfazer última edição' },
  { keys: 'Ctrl + Shift + Z', description: 'Refazer última edição' },
  { keys: 'Ctrl + Y', description: 'Refazer última edição (alternativo)' },
  { keys: 'Escape', description: 'Fechar diálogo ou painel aberto' },
  { keys: '?', description: 'Mostrar atalhos de teclado' },
];

export function KeyboardShortcutsDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only trigger when no input is focused
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;

      if (e.key === '?' && !isInput && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Atalhos de teclado</DialogTitle>
          <DialogDescription>
            Use estes atalhos para navegar mais rapidamente pelo 3Maps.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Tecla</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Ação</th>
              </tr>
            </thead>
            <tbody>
              {SHORTCUTS.map((s, i) => (
                <tr
                  key={s.keys}
                  className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}
                >
                  <td className="px-4 py-2">
                    <kbd className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs font-medium text-foreground">
                      {s.keys}
                    </kbd>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{s.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          No macOS, use <kbd className="font-mono">⌘</kbd> no lugar de <kbd className="font-mono">Ctrl</kbd>.
        </p>
      </DialogContent>
    </Dialog>
  );
}
