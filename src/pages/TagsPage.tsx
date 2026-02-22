import { useState } from 'react';
import { Tag } from 'lucide-react';
import { TagBadge } from '@/components/maps/TagBadge';
import { MapCard } from '@/components/maps/MapCard';
import { useMapsStore } from '@/stores/maps-store';

export function TagsPage() {
  const maps = useMapsStore((s) => s.maps);
  const getAllTags = useMapsStore((s) => s.getAllTags);
  const tags = getAllTags();
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const filteredMaps = selectedTag
    ? maps.filter((m) => m.tags.includes(selectedTag))
    : [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <Tag className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Tags</h1>
          <span className="text-sm text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {tags.length}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col md:flex-row overflow-hidden">
        {/* Tag list: horizontal em mobile, sidebar em desktop */}
        <div className="md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-border overflow-x-auto md:overflow-y-auto overflow-y-hidden p-4 flex flex-row md:flex-col gap-2">
          {tags.length === 0 ? (
            <div className="flex flex-col items-center justify-center w-full md:w-auto min-h-[80px] md:min-h-0 text-center gap-2 shrink-0">
              <Tag className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nenhuma tag ainda.</p>
              <p className="text-xs text-muted-foreground hidden md:block">
                Tags são criadas ao gerar mapas ou adicionadas manualmente.
              </p>
            </div>
          ) : (
            tags.map((tag) => {
              const count = maps.filter((m) => m.tags.includes(tag)).length;
              return (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                  className={`flex items-center justify-between shrink-0 md:shrink px-3 py-2 rounded-lg text-left transition-colors ${
                    selectedTag === tag
                      ? 'bg-primary/10 border border-primary/30'
                      : 'hover:bg-muted border border-transparent'
                  }`}
                >
                  <TagBadge name={tag} active={selectedTag === tag} />
                  <span className="text-xs text-muted-foreground ml-2">{count}</span>
                </button>
              );
            })
          )}
        </div>

        {/* Maps for selected tag */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {!selectedTag ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-2">
              <Tag className="h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">Selecione uma tag para ver os mapas</p>
            </div>
          ) : filteredMaps.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum mapa com esta tag.</p>
          ) : (
            <>
              <h2 className="text-sm font-semibold text-muted-foreground mb-4">
                {filteredMaps.length} mapa{filteredMaps.length !== 1 ? 's' : ''} com a tag "{selectedTag}"
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredMaps.map((map) => (
                  <MapCard key={map.id} map={map} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

