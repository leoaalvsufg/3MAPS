import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Map, Search, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MapCard } from '@/components/maps/MapCard';
import { TagBadge } from '@/components/maps/TagBadge';
import { useMapsStore } from '@/stores/maps-store';
import { useUIStore } from '@/stores/ui-store';

export function AllMapsPage() {
  const navigate = useNavigate();
  const maps = useMapsStore((s) => s.maps);
  const getAllTags = useMapsStore((s) => s.getAllTags);
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const sortBy = useUIStore((s) => s.sortBy);
  const setSortBy = useUIStore((s) => s.setSortBy);

  const allTags = getAllTags();

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

    if (activeTag) {
      result = result.filter((m) => m.tags.includes(activeTag));
    }

    if (sortBy === 'title') {
      result.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
    } else if (sortBy === 'template') {
      result.sort((a, b) => a.template.localeCompare(b.template));
    } else {
      result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    return result;
  }, [maps, search, activeTag, sortBy]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-card shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Map className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold">Meus Mapas</h1>
            <span className="text-sm text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {maps.length}
            </span>
          </div>
          <Button size="sm" onClick={() => navigate('/')} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Novo Mapa
          </Button>
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

        {/* Tag filters */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            <button
              onClick={() => setActiveTag(null)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                !activeTag
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:border-foreground/30'
              }`}
            >
              Todas
            </button>
            {allTags.map((tag) => (
              <TagBadge
                key={tag}
                name={tag}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                active={activeTag === tag}
              />
            ))}
          </div>
        )}
      </div>

      {/* Grid */}
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
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((map) => (
              <MapCard key={map.id} map={map} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

