import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Calendar, Tag, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useMapsStore } from '@/stores/maps-store';
import { formatDate } from '@/lib/utils';
import { TEMPLATES } from '@/lib/constants';
import type { SavedMap } from '@/types/mindmap';

interface MapCardProps {
  map: SavedMap;
}

export function MapCard({ map }: MapCardProps) {
  const navigate = useNavigate();
  const deleteMap = useMapsStore((s) => s.deleteMap);
  const template = TEMPLATES.find((t) => t.id === map.template);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const displayTitle = map.ownerPath ?? map.title;

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = () => {
    deleteMap(map.id);
    setShowDeleteDialog(false);
  };

  return (
    <>
      <div
        role="article"
        aria-label={`Mapa mental: ${displayTitle}`}
        onClick={() => navigate(`/map/${map.id}`)}
        className="group relative flex flex-col bg-card border border-border rounded-xl overflow-hidden cursor-pointer hover:border-primary/50 hover:shadow-md transition-all"
      >
        {/* Thumbnail */}
        <div className="aspect-video bg-muted/50 flex items-center justify-center overflow-hidden border-b border-border">
          {map.thumbnail ? (
            <img src={map.thumbnail} alt={map.title} className="w-full h-full object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <span className="text-3xl">{template?.icon ?? '🗺️'}</span>
              <span className="text-xs">{template?.name ?? 'Mapa Mental'}</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex flex-col gap-2 p-3 flex-1">
          <h3 className="font-semibold text-sm leading-tight line-clamp-2 text-foreground">
            {displayTitle}
          </h3>

          <p className="text-xs text-muted-foreground line-clamp-1">{map.query}</p>

          {/* Footer */}
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {formatDate(map.createdAt)}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Tag className="h-3 w-3" />
              {template?.name ?? map.template}
            </div>
          </div>
        </div>

        {/* Delete button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDeleteClick}
          className="absolute top-2 right-2 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 hover:bg-destructive hover:text-destructive-foreground"
          aria-label={`Excluir mapa "${displayTitle}"`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-sm" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Excluir mapa
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Tem certeza que deseja excluir <strong className="text-foreground">"{displayTitle}"</strong>?
            Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
