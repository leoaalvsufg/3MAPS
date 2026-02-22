import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Map, Search, Plus, RefreshCw, LayoutGrid, List, Calendar, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MapCard } from '@/components/maps/MapCard';
import { TagBadge } from '@/components/maps/TagBadge';
import { useMapsStore } from '@/stores/maps-store';
import { useUIStore } from '@/stores/ui-store';
import { useAuthStore } from '@/stores/auth-store';
import { TEMPLATES } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import type { SavedMap } from '@/types/mindmap';

// ---------------------------------------------------------------------------
// List view row
// ---------------------------------------------------------------------------

function MapListRow({ map }: { map: SavedMap }) {
  const navigate = useNavigate();
  const deleteMap = useMapsStore((s) => s.deleteMap);
  const template = TEMPLATES.find((t) => t.id === map.template);
  const displayTitle = map.ownerPath ?? map.title;

  return (
    <div
      role="article"
      aria-label={`Mapa mental: ${displayTitle}`}
      onClick={() => navigate(`/map/${map.id}`)}
      className="group flex items-center gap-4 px-4 py-3 bg-card border border-border rounded-xl cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all"
    >
      {/* Icon */}
      <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center shrink-0 text-xl">
        {template?.icon ?? '🗺️'}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-sm text-foreground truncate">{displayTitle}</h3>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{map.query}</p>
      </div>

      {/* Tags */}
      <div className="hidden sm:flex items-center gap-1 shrink-0">
        {map.tags.slice(0, 2).map((tag) => (
          <TagBadge key={tag} name={tag} />
        ))}
        {map.tags.length > 2 && (
          <span className="text-xs text-muted-foreground">+{map.tags.length - 2}</span>
        )}
      </div>

      {/* Template */}
      <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground shrink-0 w-28">
        <Tag className="h-3 w-3" />
        <span className="truncate">{template?.name ?? map.template}</span>
      </div>

      {/* Date */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
        <Calendar className="h-3 w-3" />
        {formatDate(map.createdAt)}
      </div>

      {/* Delete */}
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          if (confirm(`Excluir "${displayTitle}"?`)) deleteMap(map.id);
        }}
        className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground shrink-0"
        aria-label={`Excluir mapa "${displayTitle}"`}
      >
        ✕
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function AllMapsPage() {
  const navigate = useNavigate();
  const maps = useMapsStore((s) => s.maps);
  const loadAllMapsFromServer = useMapsStore((s) => s.loadAllMapsFromServer);
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const sortBy = useUIStore((s) => s.sortBy);
  const setSortBy = useUIStore((s) => s.setSortBy);
  const viewMode = useUIStore((s) => s.viewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAdmin = useAuthStore((s) => s.user?.isAdmin === true);

  // Sync maps from server when page mounts (if authenticated)
  useEffect(() => {
    if (isAuthenticated) {
      setSyncing(true);
      void loadAllMapsFromServer().finally(() => setSyncing(false));
    }
  }, [isAuthenticated, loadAllMapsFromServer]);

  const filtered = useMemo(() => {
    let result = [...maps];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          m.query.toLowerCase().includes(q) ||
          m.tags.some((t) => t.includes(q))
      );
    }

    if (sortBy === 'title') {
      result.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
    } else if (sortBy === 'template') {
      result.sort((a, b) => a.template.localeCompare(b.template));
    } else {
      result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    return result;
  }, [maps, search, sortBy]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-card shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Map className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold">{isAdmin ? 'Todos os Mapas' : 'Meus Mapas'}</h1>
            <span className="text-sm text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {maps.length}
            </span>
            {syncing && (
              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            <div className="flex items-center border border-border rounded-lg overflow-hidden">
              <Button
                size="sm"
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                className="h-8 w-8 p-0 rounded-none border-0"
                onClick={() => setViewMode('grid')}
                title="Visualização em grade"
                aria-pressed={viewMode === 'grid'}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                className="h-8 w-8 p-0 rounded-none border-0"
                onClick={() => setViewMode('list')}
                title="Visualização em lista"
                aria-pressed={viewMode === 'list'}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>

            {isAuthenticated && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSyncing(true);
                  void loadAllMapsFromServer().finally(() => setSyncing(false));
                }}
                disabled={syncing}
                className="gap-1.5"
                title="Sincronizar com servidor"
              >
                <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Sincronizar</span>
              </Button>
            )}
            <Button size="sm" onClick={() => navigate('/')} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Novo Mapa
            </Button>
          </div>
        </div>

        {/* Search + Sort */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar mapas..."
              className="pl-9 h-9"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'date' | 'title' | 'template')}
            className="h-9 px-3 rounded-md border border-input bg-background text-sm"
          >
            <option value="date">Data</option>
            <option value="title">Título</option>
            <option value="template">Template</option>
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
              <Map className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground font-medium">
              {maps.length === 0 ? 'Nenhum mapa criado ainda.' : 'Nenhum mapa encontrado.'}
            </p>
            <p className="text-sm text-muted-foreground">
              {maps.length === 0
                ? 'Comece perguntando algo na página inicial!'
                : 'Tente ajustar os filtros de busca.'}
            </p>
            {maps.length === 0 && (
              <Button onClick={() => navigate('/')} className="mt-2">
                <Plus className="h-4 w-4 mr-2" />
                Criar Primeiro Mapa
              </Button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((map) => (
              <MapCard key={map.id} map={map} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((map) => (
              <MapListRow key={map.id} map={map} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
