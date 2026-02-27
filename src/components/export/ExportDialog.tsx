import { useState } from 'react';
import { Download, FileImage, FileCode, FileText, FileDown, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  exportAsPng,
  exportAsSvg,
  exportAsPdf,
  exportAsMarkdown,
  exportElementAsPng,
  exportElementAsPdf,
  type ExportFormat,
} from './exportUtils';
import type { SavedMap } from '@/types/mindmap';
import type MindElixir from 'mind-elixir';
import { useUsageStore } from '@/stores/usage-store';
import { useAuthStore } from '@/stores/auth-store';
import { PLANS } from '@/lib/plans';
import { UpgradePrompt } from '@/components/monetization/UpgradePrompt';

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  map: SavedMap;
  mindElixirInstance: InstanceType<typeof MindElixir> | null;
  /**
   * Optional DOM element to export when MindElixir instance is not available.
   * Used by the ReactFlow mindmap renderer.
   */
  exportTarget?: HTMLElement | null;
}

const FORMATS: { id: ExportFormat; label: string; description: string; icon: React.ReactNode }[] = [
  {
    id: 'png',
    label: 'PNG',
    description: 'Imagem de alta qualidade',
    icon: <FileImage className="h-5 w-5" />,
  },
  {
    id: 'svg',
    label: 'SVG',
    description: 'Vetor escalável',
    icon: <FileCode className="h-5 w-5" />,
  },
  {
    id: 'pdf',
    label: 'PDF',
    description: 'Documento para impressão',
    icon: <FileText className="h-5 w-5" />,
  },
  {
    id: 'markdown',
    label: 'Markdown',
    description: 'Texto estruturado + artigo',
    icon: <FileDown className="h-5 w-5" />,
  },
];

export function ExportDialog({ open, onClose, map, mindElixirInstance, exportTarget }: ExportDialogProps) {
  const [loading, setLoading] = useState<ExportFormat | null>(null);
  const [error, setError] = useState('');
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [lockedFormat, setLockedFormat] = useState<string>('');

  const limits = useUsageStore((s) => s.limits);
  const isAdmin = useAuthStore((s) => s.user?.isAdmin === true);
  // Admin is enterprise+ on UI, even if usage limits are not loaded yet.
  const allowedFormats = isAdmin
    ? PLANS.admin.exportFormats
    : (limits?.exportFormats ?? PLANS.free.exportFormats);

  const handleExport = async (format: ExportFormat) => {
    // Check if format is allowed for the user's plan
    if (!allowedFormats.includes(format)) {
      setLockedFormat(format.toUpperCase());
      setShowUpgrade(true);
      return;
    }

    const canExportImage = Boolean(mindElixirInstance || exportTarget);
    if (!canExportImage && format !== 'markdown') {
      setError('Canvas do mapa não disponível. Tente novamente.');
      return;
    }
    setLoading(format);
    setError('');
    try {
      const filename = map.title.toLowerCase().replace(/\s+/g, '-').slice(0, 50);
      switch (format) {
        case 'png':
          if (mindElixirInstance) await exportAsPng(mindElixirInstance, filename);
          else await exportElementAsPng(exportTarget!, filename);
          break;
        case 'svg':
          if (!mindElixirInstance) {
            throw new Error('Exportação SVG não está disponível para este tipo de canvas. Use PNG/PDF.');
          }
          await exportAsSvg(mindElixirInstance, filename);
          break;
        case 'pdf':
          if (mindElixirInstance) await exportAsPdf(mindElixirInstance, map);
          else await exportElementAsPdf(exportTarget!, map);
          break;
        case 'markdown':
          exportAsMarkdown(map);
          break;
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao exportar');
    } finally {
      setLoading(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Exportar Mapa Mental
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground mb-4">
            Escolha o formato de exportação para <strong>{map.title}</strong>
          </p>

          <div className="grid grid-cols-2 gap-3">
            {FORMATS.map((fmt) => {
              const isLocked = !allowedFormats.includes(fmt.id);
              return (
                <button
                  key={fmt.id}
                  onClick={() => handleExport(fmt.id)}
                  disabled={loading !== null && !isLocked}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all relative ${
                    isLocked
                      ? 'border-border bg-muted/30 opacity-70 cursor-pointer hover:border-amber-400 hover:bg-amber-50/50'
                      : 'border-border hover:border-primary hover:bg-primary/5 disabled:opacity-50 disabled:cursor-not-allowed'
                  }`}
                >
                  {isLocked && (
                    <Badge className="absolute top-2 right-2 text-[10px] px-1.5 py-0 bg-amber-500 hover:bg-amber-500 text-white">
                      Premium
                    </Badge>
                  )}
                  {loading === fmt.id ? (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  ) : isLocked ? (
                    <Lock className="h-5 w-5 text-amber-500" />
                  ) : (
                    <span className="text-muted-foreground">{fmt.icon}</span>
                  )}
                  <div className="text-center">
                    <p className="text-sm font-semibold">{fmt.label}</p>
                    <p className="text-xs text-muted-foreground">{fmt.description}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {error && (
            <p className="text-sm text-destructive mt-2">{error}</p>
          )}

          <div className="flex justify-end mt-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {showUpgrade && (
        <UpgradePrompt
          feature={`exportação em ${lockedFormat}`}
          onClose={() => setShowUpgrade(false)}
        />
      )}
    </>
  );
}

